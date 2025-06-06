import express from 'express';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';

import logger, { errorLogger } from './utils/logger.js';
import indexRouter from './routes/index.js';
import timer from 'node:timers/promises';
import config from './config/index.js';
import rateLimit from 'express-rate-limit';
import moment from 'moment';
import { readFile } from 'fs/promises';
import proxy from '#bin/proxy.js';


var app = express();

const blacklistedIps = new Map();

app.use(morgan('dev'));


// 프록시 서버 구동
app.use('/proxy', proxy);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static('public'));

async function loadSwaggerFiles() {
  try {
    
    const swaggerFile = await readFile('./swagger-todo-output.json', 'utf8'); // Todo List API 문서
    // const swaggerFile = await readFile('./swagger-output.json', 'utf8'); // Open Market API 문서
    const swaggerJson = JSON.parse(swaggerFile);
    app.use('/apidocs', swaggerUi.serve, swaggerUi.setup(swaggerJson, {
      // explorer: true,
      swaggerOptions: {
        docExpansion: 'list', // none, list, full
        defaultModelsExpandDepth: -1,
        displayRequestDuration: true,
      }
    }));

  } catch (error) {
    console.error('Error loading swagger files:', error);
  }
}
await loadSwaggerFiles();


// 요청 제한 설정 (10초에 100번 요청 가능)
const limiter = rateLimit({
  windowMs: 1000 * 10, // 10초
  max: 100, // 최대 요청 횟수
  keyGenerator: (req) => req.headers['x-forwarded-for'] || req.ip, // 요청 IP를 키로 사용
  skip: (req) => req.path.startsWith('/files/'), // /files/ 경로는 제한을 두지 않음
  handler: function(req, res /*, next*/) {
    const blockTime = 1000*60*60; // 한 시간
    const ip = req.headers['x-forwarded-for'] || req.ip;
    // 차단된 IP 목록에 추가
    blacklistedIps.set(ip, { ip, time: Date.now() });
    setTimeout(() => {
      errorLogger.error('블랙리스트 해제', ip);
      // 차단된 IP 목록에서 제거
      blacklistedIps.delete(ip);
    }, blockTime);
    errorLogger.error('블랙리스트 추가', ip);
    res.status(429).json({ ok: 0, message: '요청 횟수 제한 초과(100회/10초)로 인해 IP를 차단합니다.' });
  }
});

app.use((req, res, next) => {
  // 블랙리스트에 등록된 IP는 요청을 차단
  const ip = req.headers['x-forwarded-for'] || req.ip;
  const blacklist = blacklistedIps.get(ip);
  if (blacklist) {
    const blockEndTime = moment(blacklist.time).add(1, 'hour');
    const minutesLeft = blockEndTime.diff(moment(), 'minutes'); // 남은 시간(분) 계산
    return res.status(403).json({ ok: 0, message: `요청 횟수 제한 초과(100회/10초)로 인해 이 IP는 1시간 동안 접속이 차단되었습니다. 차단 해제까지 남은 시간 ${minutesLeft}분 동안 어디에서 무한루프가 발생했는지 확인한 후 버그를 수정하고 재도전하세요^^`});
  }
  next();
});

// 모든 경로에 제한 적용
app.use(limiter);

app.use(
  cors({
    origin: config.cors.origin,
    credentials: true,
  })
);

app.use(
  // '/api',
  async function (req, res, next) {
    if (req.query.delay) {
      await timer.setTimeout(req.query.delay);
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
app.use(function(err, req, res, next){
  logger.error(err.status === 404 ? req.method + ' ' +err.message : err.stack+'\n\n');
  if(err.cause){
    logger.error(err.cause);
  }

  const status = err.cause?.status || err.status || 500;

  // let message = status === 500 ? '요청하신 작업 처리에 실패했습니다. 잠시 후 다시 이용해 주시기 바랍니다.' : err.message;
  let message = err.message;

  res.status(status);
  let result = { ok: 0, message };
  if(status === 401 || status === 422){
    result = { ...result, ...err };  
  }
  res.json(result);
});

export default app;
