import { createProxyMiddleware } from 'http-proxy-middleware';

// CORS 헤더 추가 함수
const addCorsHeaders = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Max-Age', 60*60*24*7); // preflight 요청 생략하는 캐시 시간 7일
  
  const requestedHeaders = req.headers['access-control-request-headers'];
  if (requestedHeaders) {
    res.setHeader('Access-Control-Allow-Headers', requestedHeaders);
  } else {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
};

// 프록시 미들웨어 생성
const proxyMiddleware = createProxyMiddleware({
  logger: console,
  router: (req) => {
    return req.headers['x-target-url'] || 'https://openapi.naver.com';
  },
  changeOrigin: true,
  cors: true,
  on: {
    proxyReq: (proxyReq, req, res) => {
      // x-target-url 헤더 삭제
      delete req.headers['x-target-url'];
    },
    proxyRes: (proxyRes, req, res) => {
      // 모든 응답에 CORS 헤더 추가
      addCorsHeaders(req, res);
    }
  }
});

// 커스텀 미들웨어 생성
const customProxy = (req, res, next) => {
  if (req.method === 'OPTIONS') {
    // CORS 헤더 추가
    addCorsHeaders(req, res);
    res.writeHead(204); // No Content
    res.end();
    return;
  }

  // OPTIONS가 아닌 요청은 프록시 미들웨어로 전달
  proxyMiddleware(req, res, next);
};

// 미들웨어로 내보내기
export default customProxy;