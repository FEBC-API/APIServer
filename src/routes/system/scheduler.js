import express from 'express';
import { body } from 'express-validator';
import validator from '#middlewares/validator.js';
import logger from '#utils/logger.js';
import schedulerModel from '#models/system/scheduler.model.js';
import { getClientId } from '#utils/dbUtil.js';
import schedulerServer from '#bin/schedulerServer.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// dayjs 플러그인 설정
dayjs.extend(utc);
dayjs.extend(timezone);

const router = express.Router();

// 스케줄러 목록 조회
router.get('/', async (req, res, next) => {
  /*
    #swagger.tags = ['스케줄러']
    #swagger.summary = '스케줄러 목록 조회'
    #swagger.description = '등록된 스케줄러 목록을 조회합니다.'

    #swagger.security = [{
      "Client ID": []
    }]

    #swagger.responses[200] = {
      description: '성공',
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/schedulerListRes' }
        }
      }
    }
    #swagger.responses[500] = {
      description: '서버 에러',
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/error500' }
        }
      }
    }
  */

  try {
    const clientId = getClientId(req);
    const item = await schedulerModel.find(clientId);
    res.json({ ok: 1, item });
  } catch (err) {
    next(err);
  }
});

// 스케줄러 등록
router.post('/', [
  body('name').notEmpty().withMessage('스케줄러 이름은 필수입니다'),
  body('endpoint').notEmpty().withMessage('엔드포인트는 필수입니다'),
  body('time').notEmpty().withMessage('실행 시간은 필수입니다')
    .matches(/^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}$/).withMessage('시간 형식이 올바르지 않습니다 (YYYY.MM.DD HH:mm:ss)'),
  validator.checkResult
], async (req, res, next) => {
  /*
    #swagger.tags = ['스케줄러']
    #swagger.summary = '스케줄러 등록'
    #swagger.description = '새로운 스케줄러를 등록합니다.<br>
      스케줄러가 등록되면 지정된 시간에 해당 엔드포인트를 자동으로 호출합니다.<br>'

    #swagger.security = [{
      "Client ID": []
    }]

    #swagger.requestBody = {
      description: "<p>스케줄러 정보가 저장된 객체입니다.</p>
      <ul>
        <li><b>*name</b>: 스케줄러 이름</li>
        <li><b>*endpoint</b>: 실행할 엔드포인트</li>
        <li><b>*time</b>: 실행 시간 (YYYY.MM.DD HH:mm:ss 형식)</li>
        <li>description: 스케줄러 설명</li>
        <li>extra: 추가 데이터 (객체)</li>
      </ul>",
      required: true,
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/scheduler' }
        }
      }
    }

    #swagger.responses[201] = {
      description: '성공',
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/schedulerDetailResScheduled' }
        }
      }
    }
    #swagger.responses[422] = {
      description: '입력값 검증 오류',
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/error422' }
        }
      }
    }
    #swagger.responses[500] = {
      description: '서버 에러',
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/error500' }
        }
      }
    }
  */

  try {
    const clientId = getClientId(req);
    const { name, description, endpoint, time, extra } = req.body;

    // 미래 시간 체크 - 클라이언트에서 전달된 시간은 한국 시간이므로 UTC로 변환
    const scheduledTime = dayjs(time).tz('Asia/Seoul').toISOString();
    console.log('클라이언트에서 전달된 시간:', time);
    console.log('변환된 UTC 시간:', scheduledTime);
    console.log('현재 UTC 시간:', dayjs().tz('Asia/Seoul').toISOString());
    
    const now = dayjs().tz('Asia/Seoul');
    if (dayjs(scheduledTime).isSameOrBefore(now)) {
      return next(new Error('실행 시간은 미래 시간이어야 합니다'));
    }

    const item = await schedulerModel.create(clientId, {
      name,
      description,
      endpoint,
      time,
      extra
    });

    // 해당 clientId의 스케줄러만 재시작
    try {
      await schedulerServer.restartClientJobs(clientId);
    } catch (error) {
      logger.error(`Client ${clientId} 스케줄러 재시작 실패:`, error);
    }

    res.status(201).json({ ok: 1, item });
  } catch (err) {
    logger.error(err);
    next(err);
  }
});

// 스케줄러 상세 조회
router.get('/:_id', async (req, res, next) => {
  /*
    #swagger.tags = ['스케줄러']
    #swagger.summary = '스케줄러 상세 조회'
    #swagger.description = '특정 스케줄러의 상세 정보를 조회합니다.'

    #swagger.security = [{
      "Client ID": []
    }]

    #swagger.parameters['_id'] = {
      description: '스케줄러 id',
      in: 'path',
      required: true,
      type: 'number',
      example: 1
    }

    #swagger.responses[200] = {
      description: '성공',
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/schedulerDetailResScheduled' },
          examples: {
            "등록된 경우": { $ref: "#/components/examples/schedulerDetailResScheduled" },
            "실행 성공": { $ref: "#/components/examples/schedulerDetailResCompleted" },
            "실행 에러": { $ref: "#/components/examples/schedulerDetailResFailed" },
            "실행 누락": { $ref: "#/components/examples/schedulerDetailResMissed" }
          }
        }
      }
    }
    #swagger.responses[404] = {
      description: '스케줄러를 찾을 수 없음',
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/error404' }
        }
      }
    }
    #swagger.responses[500] = {
      description: '서버 에러',
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/error500' }
        }
      }
    }
  */

  try {
    const clientId = getClientId(req);
    const { _id } = req.params;

    const item = await schedulerModel.findById(clientId, _id);
    if (!item) {
      return next();
    }

    res.json({ ok: 1, item });
  } catch (err) {
    next(err);
  }
});

// 스케줄러 수정
router.patch('/:_id', [
  body('time').optional()
    .matches(/^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}$/).withMessage('시간 형식이 올바르지 않습니다 (YYYY.MM.DD HH:mm:ss)'),
  validator.checkResult
], async (req, res, next) => {
  /*
    #swagger.tags = ['스케줄러']
    #swagger.summary = '스케줄러 수정'
    #swagger.description = '기존 스케줄러를 수정합니다. 전달된 속성만 수정됩니다.'

    #swagger.security = [{
      "Client ID": []
    }]

    #swagger.parameters['_id'] = {
      description: '스케줄러 id',
      in: 'path',
      required: true,
      type: 'number',
      example: 1
    }

    #swagger.requestBody = {
      description: "<p>수정할 스케줄러 정보가 저장된 객체입니다. 전달된 속성만 수정됩니다.</p>
      <ul>
        <li>name: 스케줄러 이름 (선택)</li>
        <li>description: 스케줄러 설명 (선택)</li>
        <li>endpoint: 실행할 엔드포인트 (선택)</li>
        <li>time: 실행 시간 (YYYY.MM.DD HH:mm:ss 형식, 선택)</li>
        <li>extra: 추가 데이터 (객체, 선택)</li>
      </ul>",
      required: true,
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/scheduler' }
        }
      }
    }

    #swagger.responses[200] = {
      description: '성공',
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/schedulerDetailResScheduled' }
        }
      }
    }
    #swagger.responses[404] = {
      description: '스케줄러를 찾을 수 없음',
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/error404' }
        }
      }
    }
    #swagger.responses[422] = {
      description: '입력값 검증 오류',
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/error422' }
        }
      }
    }
    #swagger.responses[500] = {
      description: '서버 에러',
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/error500' }
        }
      }
    }
  */

  try {
    const clientId = getClientId(req);
    const { _id } = req.params;
    const updateData = req.body;

    // 기존 스케줄러 확인
    const existing = await schedulerModel.findById(clientId, _id);
    if (!existing) {
      return next();
    }

    // 미래 시간 체크 (time이 제공된 경우)
    if (updateData.time) {
      // 클라이언트에서 전달된 시간은 한국 시간이므로 UTC로 변환
      const scheduledTime = dayjs(updateData.time).tz('Asia/Seoul').toISOString();
      const now = dayjs().tz('Asia/Seoul');
      if (dayjs(scheduledTime).isSameOrBefore(now)) {
        return next(new Error('실행 시간은 미래 시간이어야 합니다'));
      }
    }

    const item = await schedulerModel.update(clientId, _id, updateData);

    // 해당 clientId의 스케줄러만 재시작
    try {
      await schedulerServer.restartClientJobs(clientId);
    } catch (error) {
      logger.error(`Client ${clientId} 스케줄러 재시작 실패:`, error);
    }

    res.json({ ok: 1, item });
  } catch (err) {
    next(err);
  }
});

// 스케줄러 삭제
router.delete('/:_id', async (req, res, next) => {
  /*
    #swagger.tags = ['스케줄러']
    #swagger.summary = '스케줄러 삭제'
    #swagger.description = '스케줄러를 삭제합니다.'

    #swagger.security = [{
      "Client ID": []
    }]

    #swagger.parameters['_id'] = {
      description: '스케줄러 id',
      in: 'path',
      required: true,
      type: 'number',
      example: 1
    }

    #swagger.responses[200] = {
      description: '성공',
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/simpleOK' }
        }
      }
    }
    #swagger.responses[404] = {
      description: '스케줄러를 찾을 수 없음',
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/error404' }
        }
      }
    }
    #swagger.responses[500] = {
      description: '서버 에러',
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/error500' }
        }
      }
    }
  */

  try {
    const clientId = getClientId(req);
    const { _id } = req.params;

    const result = await schedulerModel.delete(clientId, _id);
    if (result.deletedCount === 0) {
      return next();
    }

    // 해당 clientId의 스케줄러만 재시작
    try {
      await schedulerServer.restartClientJobs(clientId);
    } catch (error) {
      logger.error(`Client ${clientId} 스케줄러 재시작 실패:`, error);
    }

    res.json({ ok: 1 });
  } catch (err) {
    next(err);
  }
});

export default router;
