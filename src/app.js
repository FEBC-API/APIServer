import express from 'express';
import axios from 'axios';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';

import logger, { errorLogger } from './utils/logger.js';
import indexRouter from './routes/index.js';
import timer from 'node:timers/promises';
import config from './config/index.js';
import rateLimit from 'express-rate-limit';
import moment from 'moment-timezone';
import { readFile } from 'fs/promises';
import { getDb } from './utils/dbUtil.js';
import proxy from '#bin/proxy.js';

var app = express();

// 프록시(Koyeb, AWS 등)를 신뢰
app.set('trust proxy', true);

const blacklistedIps = new Map();

morgan.token('client-id', (req) => req.headers['client-id'] || '-');
morgan.token('ip', (req) => req.ip);
morgan.token('date-local', () => moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss'));
app.use(morgan(':date-local :client-id :ip :method :url :status :response-time ms - :res[content-length]'));

// 프록시 서버 구동
app.use('/proxy', proxy);

app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: false, limit: '200mb' }));
app.use(cookieParser());
app.use(express.static('public'));

async function loadSwaggerFiles() {
  try {
    
    const todoSwaggerFile = await readFile('./swagger-todo-output.json', 'utf8'); // Todo List API 문서
    const marketSwaggerFile = await readFile('./swagger-output.json', 'utf8'); // Open Market API 문서
    const todoSwaggerJson = JSON.parse(todoSwaggerFile);
    const marketSwaggerJson = JSON.parse(marketSwaggerFile);

    const swaggerOptions = {
      docExpansion: 'list', // none, list, full
      defaultModelsExpandDepth: -1,
      displayRequestDuration: true,
      requestInterceptor: (req) => {
        console.log(req.headers);
        req.headers['client-id'] = 'openmarket';
        return req;
      },
    }

    // swagger ui에서 자동으로 client-id 헤더를 추가하도록 fetch api 수정
    const customJsStr = `
      (function() {
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
          if (args[1] && args[1].headers) {
            args[1].headers['client-id'] = 'openmarket';
          } else if (args[1]) {
            args[1].headers = { ...args[1].headers, 'client-id': 'openmarket' };
          } else {
            args[1] = { headers: { 'client-id': 'openmarket' } };
          }
          return originalFetch.apply(this, args);
        };
      })();
    `;

    // Todo API 문서용 별도 인스턴스
    app.use('/todo/apidocs', swaggerUi.serveFiles(todoSwaggerJson), swaggerUi.setup(todoSwaggerJson, {
      swaggerOptions,
      customJsStr
    }));

    // Market API 문서용 별도 인스턴스  
    app.use('/market/apidocs', swaggerUi.serveFiles(marketSwaggerJson), swaggerUi.setup(marketSwaggerJson, {
      swaggerOptions,
      customJsStr
    }));

  } catch (error) {
    console.error('Error loading swagger files:', error);
  }
}
await loadSwaggerFiles();


app.use(
  cors({
    origin: config.cors.origin,
    credentials: true,
  })
);

// 요청 제한 정보를 req 객체에 저장하는 미들웨어(배포는 1000회, 개발은 100회)
app.use((req, res, next) => {
  const origin = req.headers.origin || req.headers.referer || '';
  const isVercelClient = origin.includes('vercel.app');
  req.rateLimitInfo = {
    limit: isVercelClient ? 1000 : 100,
    message: isVercelClient ? '1000회/10초' : '100회/10초'
  };
  next();
});

app.use((req, res, next) => {
  // 블랙리스트에 등록된 IP는 요청을 차단
  const ip = req.ip;
  const blacklist = blacklistedIps.get(ip);
  if (blacklist) {
    const blockEndTime = moment(blacklist.time).add(1, 'hour');
    const minutesLeft = blockEndTime.diff(moment(), 'minutes'); // 남은 시간(분) 계산
    return res.status(403).json({ ok: 0, message: `요청 횟수 제한 초과(${req.rateLimitInfo.message})로 인해
해당 IP는 1시간 동안 접속이 차단되었습니다.
차단 해제까지 남은 시간은 ${minutesLeft}분입니다.
이 기간 동안 무한 루프나 불필요한 대량 요청이 발생하지 않았는지 확인한 뒤,
버그를 수정하고 다시 시도해 주세요 🙂`});
  }
  next();
});

// 요청 제한 설정 (express-rate-limit 사용)
app.use(rateLimit({
  windowMs: 1000 * 10, // 10초
  limit: (req) => req.rateLimitInfo.limit, // req에 저장된 값 사용
  validate: { xForwardedForHeader: false }, // Koyeb 등 프록시 환경에서의 경고 방지
  handler: async function(req, res /*, next*/) {
    const blockTime = 1000*60*60; // 한 시간
    const ip = req.ip;

    // 이미 블랙리스트에 추가 중이거나 추가된 IP라면 중복 로그 방지를 위해 리턴
    if (blacklistedIps.has(ip)) {
      return res.status(429).json({ ok: 0, message: `요청 횟수 제한 초과(${req.rateLimitInfo.message})로 인해 IP를 차단합니다.` });
    }

    // 즉시 블랙리스트에 추가(동기적으로 실행되어 다음 요청의 중복 진입 방지)
    blacklistedIps.set(ip, { ip, time: Date.now() });

    try {
      const db = await getDb('openmarket');

      // IP 위치 정보 조회 (로컬 IP 제외)
      let location = null;
      if (ip !== '::1' && ip !== '127.0.0.1' && !ip.startsWith('192.168.')) {
        try {
          const locRes = await axios.get(`http://ip-api.com/json/${ip}`);
          if (locRes.data.status === 'success') {
            location = {
              country: locRes.data.country,
              region: locRes.data.regionName,
              city: locRes.data.city,
              isp: locRes.data.isp,
              lat: locRes.data.lat,
              lon: locRes.data.lon
            };
          }
        } catch (err) {
          errorLogger.error('IP 위치 정보 조회 실패:', err.message);
        }
      }

      const logData = {
        _id: await db.nextSeq('logs'),
        type: 'blacklist',
        clientId: req.headers['client-id'],
        ip,
        location,
        limitInfo: req.rateLimitInfo,
        path: `${req.method} ${req.originalUrl}`,
        body: req.body,
        start: moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss'),
      };
      await db.collection('logs').insertOne(logData);
      const logId = logData._id;

      setTimeout(async () => {
        errorLogger.error('블랙리스트 해제', ip);
        // 차단된 IP 목록에서 제거
        blacklistedIps.delete(ip);

        try {
          await db.collection('logs').updateOne(
            { _id: logId },
            { 
              $set: { 
                finish: moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss'),
                releaseReason: 'timeout'
              } 
            }
          );
        } catch (err) {
          errorLogger.error('블랙리스트 로그 업데이트 실패(해제):', err);
        }
      }, blockTime);

    } catch (err) {
      errorLogger.error('블랙리스트 로그 저장 실패(추가):', err);
    }

    errorLogger.error('블랙리스트 추가', ip);
    res.status(429).json({ ok: 0, message: `요청 횟수 제한 초과(${req.rateLimitInfo.message})로 인해 IP를 차단합니다.` });
  }
}));

app.use(
  // '/api',
  async function (req, res, next) {
    const delay = Number(req.query.delay);
    if (delay > 0) {
      await timer.setTimeout(delay);
    }
    next();
  },
  indexRouter
);

// 404 에러
app.use(function(req, res, next){
  const err = new Error(`${req.url} 리소스를 찾을 수 없습니다.`);
  err.status = 404;
  next(err);
});

// 500 에러
app.use(function(err, req, res, _next){
  logger.error(err.status === 404 ? req.method + ' ' + err.message : err.stack+'\n\n');
  if(err.cause){
    logger.error(err.cause);
  }

  const status = err.cause?.status || err.status || 500;
  delete err.status;

  logger.debug(status, err)
  res.status(status).json({ ok: 0, message: err.message, ...err });
});

// 서버 시작 로그 기록 및 미해제 블랙리스트 정리
(async () => {
  try {
    const db = await getDb('openmarket');
    const now = moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss');

    // 서버 시작 전에 해제되지 않은(finish가 없는) 블랙리스트 로그 정리
    const result = await db.collection('logs').updateMany(
      { type: 'blacklist', finish: { $exists: false } },
      { $set: { finish: now, cause: 'server_restart' } }
    );
    
    if (result.matchedCount > 0) {
      logger.log(`서버 재시작으로 인해 미해제된 블랙리스트 ${result.matchedCount}건을 정리했습니다.`);
    }

    // 서버 시작 로그 기록
    await db.collection('logs').insertOne({
      _id: await db.nextSeq('logs'),
      type: 'server_restart',
      createdAt: now
    });
  } catch (err) {
    errorLogger.error('서버 시작 로그 및 정리 실패:', err);
  }
})();

export default app;
