import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// swagger.js 파일 경로 (프로젝트 루트)
const SWAGGER_PATH = join(__dirname, '../../../swagger.js');

// Swagger.js 파일 읽기
function loadSwaggerSource() {
  try {
    return readFileSync(SWAGGER_PATH, 'utf-8');
  } catch (error) {
    console.error('swagger.js 로드 실패:', error.message);
    return null;
  }
}

// MCP 서버 생성
function createMCPServer() {
  const server = new Server(
    {
      name: 'febc-api-helper',
      version: '1.0.0',
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  // Resources 목록 제공
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'febc://swagger-definition',
          name: 'FEBC API 전체 정의',
          description: '오픈마켓 API의 전체 정의 (swagger.js)',
          mimeType: 'application/javascript',
        },
      ],
    };
  });

  // Resource 읽기 처리
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    switch (uri) {
      case 'febc://swagger-definition': {
        const swaggerSource = loadSwaggerSource();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/javascript',
              text: swaggerSource || 'swagger.js를 로드할 수 없습니다.',
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  });

  // Tools 목록 제공
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'search_api',
          description: '키워드로 API를 검색합니다',
          inputSchema: {
            type: 'object',
            properties: {
              keyword: {
                type: 'string',
                description: '검색할 키워드',
              },
            },
            required: ['keyword'],
          },
        },
      ],
    };
  });

  // Tool 실행 처리
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'search_api') {
      const { keyword } = args || {};
      const swaggerSource = loadSwaggerSource();

      if (!swaggerSource) {
        return {
          content: [
            {
              type: 'text',
              text: 'swagger.js를 로드할 수 없습니다.',
            },
          ],
          isError: true,
        };
      }

      // 키워드로 검색
      const lines = swaggerSource.split('\n');
      const matches = lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) =>
          line.toLowerCase().includes(keyword.toLowerCase())
        )
        .slice(0, 30)
        .map(({ line, index }) => `Line ${index + 1}: ${line}`)
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text:
              matches ||
              `"${keyword}"에 대한 검색 결과가 없습니다.`,
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  return server;
}

// MCP 서버 인스턴스 생성 (전역으로 한 번만 생성)
const mcpServer = createMCPServer();

// StreamableHTTP Transport 생성
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
  onsessioninitialized: (sessionId) => {
    console.log(`MCP session initialized: ${sessionId}`);
  },
  onsessionclosed: (sessionId) => {
    console.log(`MCP session closed: ${sessionId}`);
  },
});

// Transport와 서버 연결
mcpServer.connect(transport);

// 모든 HTTP 메서드 처리 (GET, POST, DELETE 등)
router.all('*', async (req, res) => {
  console.log(`MCP request: ${req.method} ${req.path}`);

  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // OPTIONS 요청 처리
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // StreamableHTTP Transport가 요청 처리
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP request error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

export default router;

