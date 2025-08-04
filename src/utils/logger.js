import tracer from 'tracer';
import fs from 'fs';
import path from 'path';

// logs 디렉토리 생성
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

let logger;
let errorLogger;

if (process.env.NODE_ENV == 'production') {
  logger = tracer.dailyfile({
    root: 'logs',
    maxLogFiles: 365,
    allLogsFileName: 'log',
    level: 3,  // log(0), trace(1), debug(2), info(3), warn(4), error(5), fatal(6)
    format: ['{{timestamp}} <{{title}}> {{file}}:{{line}}({{method}}()) {{message}}'],
    dateformat: 'yyyy-mm-dd HH:MM:ss',
    inspectOpt: {
      depth: 5
    }
  });

  errorLogger = tracer.dailyfile({
    root: 'logs',
    maxLogFiles: 365,
    allLogsFileName: 'error',
    level: 5,  // error(5), fatal(6)
    format: ['{{timestamp}} <{{title}}> {{file}}:{{line}}({{method}}()) {{message}}'],
    dateformat: 'yyyy-mm-dd HH:MM:ss',
    inspectOpt: {
      depth: 5
    }
  });
} else {
  logger = tracer.colorConsole({
    level: 0,  // log(0), trace(1), debug(2), info(3), warn(4), error(5), fatal(6)
    format: ['{{timestamp}} <{{title}}> {{file}}:{{line}}({{method}}()) {{message}}'],
    dateformat: 'yyyy-mm-dd HH:MM:ss',
    inspectOpt: {
      depth: 10
    },
    preprocess: function(data) {
      // CloudWatch Logs로 전송한 로그가 여러 줄로 나뉘지 않도록 모든 인수를 문자열로 변환
      for (let i = 0; i < data.args.length; i++) {
        let arg = data.args[i];
        if (typeof arg === 'object' && arg !== null) {
          data.args[i] = JSON.stringify(arg, null, 2);
        }
      }
    }
  });

  errorLogger = tracer.colorConsole({
    level: 5,  // error(5), fatal(6)
    format: ['{{timestamp}} <{{title}}> {{file}}:{{line}}({{method}}()) {{message}}'],
    dateformat: 'yyyy-mm-dd HH:MM:ss',
    inspectOpt: {
      depth: 10
    }
  });
}

export { errorLogger };

export default logger;
