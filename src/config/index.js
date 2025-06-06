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
  // clientIds: ['sample', 'board', 'brunch', 'nike', '00-openmarket', 'openmarket', 'vanilla01', 'vanilla02', 'vanilla03', 'vanilla04', 'vanilla05', 'vanilla06', 'vanilla07', 'final00', 'final01', 'final02', 'final03', 'final04', 'final05', 'final06', 'final07'],
  clientIds: ['openmarket'],
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
    /localhost/,
    /127.0.0.1/,
    /127.0.0.1:8080/,
    /127.0.0.1:3000/,
    /netlify.app$/,
    /vercel.app$/,
    /koyeb.app$/,
    /codepen.io$/,
    /stackblitz.com$/,
    /webcontainer.io$/,
    ...(process.env.APP_HOST ? [new RegExp(process.env.APP_HOST)] : [])
  ]
};

export default { db, jwt, cors };