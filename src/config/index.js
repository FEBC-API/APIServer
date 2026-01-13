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
    ...['fesp02-02hyundai-morgans-e3jc'], // FESP 2기
    ...new Array(8).fill(0).map((_, index) => `febc11-final${index.toString().padStart(2, '0')}-regj`),
    ...['febc13-js13-emjf', 'febc13-js14-emjf'],
    // ...new Array(15).fill(0).map((_, index) => `febc13-final${index.toString().padStart(2, '0')}-emjf`),
    ...['febc13-final02-emjf', 'febc13-final03-emjf', 'febc13-final04-emjf', 'febc13-final05-emjf', 'febc13-final11-emjf', 'febc13-final13-emjf', 'febc13-final14-emjf'],
    ...['febc13-final01-emjf', 'febc13-final06-emjf', 'febc13-final07-emjf', 'febc13-final09-emjf', 'febc13-final10-emjf', 'febc13-final12-emjf', 'febc13-final15-emjf'],
    ...new Array(10).fill(0).map((_, index) => `febc15-vanilla${index.toString().padStart(2, '0')}-ecad`),
    ...['febc15-vanilla10-brunch', 'febc15-vanilla10-nike'], // 15기 보조강사 jbm
    ...new Array(10).fill(0).map((_, index) => `febc15-final${index.toString().padStart(2, '0')}-ecad`),
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
    /localhost/,
    /127\.0\.0\.1/,
    /.*netlify\.app/,
    /.*vercel\.app/,
    /.*koyeb\.app/,
    /.*codepen\.io/,
    /.*stackblitz\.com/,
    /.*webcontainer\.io/,
    /.*devtunnels\.ms/,
    /.*github\.io/,
    /.*github\.dev/,
    /.*devtunnels\.ms/,
    ...(process.env.APP_HOST ? [new RegExp(process.env.APP_HOST)] : [])
  ]
};

export default { db, jwt, cors };