import dotenv from 'dotenv';

// 기본 .env 파일 로딩(package.json에서 로딩함)
// dotenv.config({ path: '.env' });
// 환경별 .env 파일 로딩
console.info('NODE_ENV', process.env.NODE_ENV);
if (process.env.NODE_ENV) {
  dotenv.config({ override: true, path: `.env.${process.env.NODE_ENV}` });
}

import swaggerAutogen from 'swagger-autogen';
import moment from 'moment';

function getTime(days = 0, hours = 0) {
  return moment().add(days, 'd').add(hours, 'h').format('YYYY.MM.DD HH:mm:ss');
}

const doc = {
  info: {
    title: 'TODO List API', 
    description: `할일 목록 API Server입니다.`, 
    version: '1.0.0',
  },
  host: process.env.API_HOST,
  basePath: '/todo',
  schemes: ['http', 'https'],
  tags: [
    {
      name: 'Todo List',
      description: '할일 목록 관리',
    },
  ],
  definitions: {
    Error422: {
      ok: 0, 
      error: {
        message: '"title" 항목은 필수입니다.'
      }
    },
    Error404: {
      ok: 0, 
      error: {
        message: '/api/todolist/{_id} 리소스를 찾을 수 없습니다.'
      }
    },
    Error500: {
      ok: 0, 
      error: {
        message: '서버 오류'
      }
    },
    ItemRequest: {
      title: 'TodoList 프로젝트 UI 완성',
      content: '이번주에 진핼할 수업 내용을 잘 따라하자.'
    },
    DBInitRequest: {
      pwd: 'adminpassword',
    },
    ItemUpdateRequest: {
      title: 'TodoList 프로젝트 기능 완성',
      content: '이번주 과제로 나올지도...',
      done: true
    },
    ItemResponse: {
      ok: 1,
      item: {
        _id: 5,
        title: 'Javascript 공부',
        content: '열심히 하자',
        done: false,
        createdAt: getTime(),
        updatedAt: getTime(),
      }
    },
    ListResponse: {
      ok: 1,
      items: [
        {
          _id: 3,
          title: 'Promise 복습',
          done: false,
          createdAt: getTime(-2, 1),
          updatedAt: getTime(-2, 5),
        }
      ],
      pagination: {
        page: 2,
        limit: 2,
        total: 5,
        totalPages: 3
      }
    },
    ListWithoutPaginationResponse: {
      ok: 1,
      items: [
        {
          _id: 3,
          title: 'Promise 복습',
          done: false,
          createdAt: getTime(-2, 1),
          updatedAt: getTime(-2, 5),
        }
      ],
      pagination: {}
    },
  }
};
const outputFile = './swagger-todo-output.json' 
const endpointsFiles = ['./src/routes/todo/index.js'] 

swaggerAutogen()(outputFile, endpointsFiles, doc);