import logger from '#utils/logger.js';
import dotenv from 'dotenv';

// 기본 .env 파일 로딩(package.json에서 로딩함)
dotenv.config({ path: '.env' });
// 환경별 .env 파일 로딩
logger.log('NODE_ENV', process.env.NODE_ENV);
if (process.env.NODE_ENV) {
  dotenv.config({ override: true, path: `.env.${process.env.NODE_ENV}` });
}

export const db = {
  url: process.env.DB_URL,
  clientIds: [
    ...['sample', 'board', 'brunch', 'nike', 'openmarket',],
    ...['febc13-js13-emjf', 'febc13-js14-emjf'],
    ...new Array(16).fill(0).map((_, index) => `febc13-final${index.toString().padStart(2, '0')}-emjf`),
  ],
};

export const jwt = {
  access: {
    secretKey: 'OpenmarketAccessToken', // 암호키
    options: {
      algorithm: 'HS256', // 대칭키 방식
      expiresIn: '1d',  // 하루
      // expiresIn: '2h',  // 2시간
      // expiresIn: '10m', // 10분
      // expiresIn: '10s',  // 10초
      issuer: 'FEBC', // 발행자
    },
  },
  refresh: {
    secretKey: 'OpenmarketRefreshToken',
    options: {
      algorithm: 'HS256',
      expiresIn: '30d',
      // expiresIn: '30s',
      issuer: 'FEBC',
    },
  }
};

export const cors = {
  origin: [
    /localhost$/,
    /127.0.0.1$/,
    /netlify.app$/,
    /vercel.app$/,
    /koyeb.app$/,
    /codepen.io$/,
    /stackblitz.com$/,
    /webcontainer.io$/,
    /devtunnels.ms$/,
    ...(process.env.APP_HOST ? [new RegExp(process.env.APP_HOST)] : [])
  ]
};

export default { db, jwt, cors };