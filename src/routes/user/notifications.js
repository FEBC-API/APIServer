import express from 'express';
import { query, body } from 'express-validator';

import validator from '#middlewares/validator.js';
import jwtAuth from '#middlewares/jwtAuth.js';
import notificationServer from '#bin/notificationServer.js';
import logger from '#utils/logger.js';
import { getClientId } from '#utils/dbUtil.js';
import notificationModel from '#models/user/notification.model.js';

const router = express.Router();

// 알림 등록
router.post('/', jwtAuth.auth('user'), [
  // body('type').trim().notEmpty().withMessage('type은 필수로 전달해야 합니다.'),
  body('target_id').isInt().withMessage('target_id는 정수로 전달해야 합니다.'),
  body('content').trim().notEmpty().withMessage('content는 필수로 전달해야 합니다.'),
  body('extra').optional().isObject().withMessage('extra 데이터는 객체로 전달해야 합니다.'),
], validator.checkResult, async function(req, res, next) {
/*
    #swagger.tags = ['알림 메세지']
    #swagger.summary  = '알림 메세지 등록'
    #swagger.description = `알림 메세지를 등록합니다.<br>
      알림 메세지를 등록한 후 등록된 정보를 반환합니다.`
    
    #swagger.security = [{
      "Client ID": []
    }]

    #swagger.requestBody = {
      description: `알림 메세지가 저장된 객체입니다.<br>
        target_id: (필수) 대상 회원 ID<br>
        content: (필수) 알림 메세지<br>
        type: (선택) 알림 종류를 구분하는 값<br>
        channel: (선택) 알림을 전달하는 방법, none, websocket, email, sms, slack, discord ... 등의 방법을 지정(추후 지원)<br>
        extra: (선택) 추가 데이터, 추가하고 싶은 아무 속성이나 지정`,
      required: true,
      content: {
        "application/json": {
          schema: { $ref: '#components/schemas/createNotification' },
          examples: {
            "샘플": { $ref: "#/components/examples/createNotification" },
          }
        }
      }
    }
    #swagger.responses[201] = {
      description: '성공',
      content: {
        "application/json": {
          examples: {
            "샘플": { $ref: "#/components/examples/createNotificationRes" },
          }
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
    const user = {};
    if(req.user){
      user._id = req.user._id;
      user.name = req.user.name;
      user.email = req.user.email;
      user.image = req.user.image;
    }

    const notification = { ...req.body, user };
    const item = await notificationModel.create(clientId, notification);
    const list = await notificationModel.find(clientId, { userId: req.body.target_id });

    notificationServer.sendMsg(req.clientId, req.body.target_id, { newNoti: item, list });
    res.status(201).json({ok: 1, item});
  } catch(err) {
    next(err);
  }
});


// 내 알림 목록 조회
router.get('/', jwtAuth.auth('user'), [
  query('custom').optional().isJSON().withMessage('custom 값은 JSON 형식의 문자열이어야 합니다.'),
  query('sort').optional().isJSON().withMessage('sort 값은 JSON 형식의 문자열이어야 합니다.')
], validator.checkResult, async function(req, res, next) {
/*
    #swagger.tags = ['알림 메세지']
    #swagger.summary  = '내 알림 목록 조회'
    #swagger.description = `읽지 않은 나의 알림 목록을 조회합니다.<br>`
    
    #swagger.security = [{
      "Access Token": [],
      "Client ID": []
    }]

    #swagger.parameters['custom'] = {
      description: "custom 검색 조건(type이 qna인 메세지 조회 예시)",
      in: 'query',
      type: 'string',
      example: '{\"type\": \"qna\"}'
    }
    #swagger.parameters['page'] = {
      description: "페이지",
      in: 'query',
      type: 'number',
      example: 2
    }
    #swagger.parameters['limit'] = {
      description: "한 페이지당 항목 수",
      in: 'query',
      type: 'number',
      example: 10
    }
    #swagger.parameters['sort'] = {
      description: "정렬(내림차순: -1, 오름차순: 1)",
      in: 'query',
      type: 'string',
      example: '{\"createdAt\": 1}',
      default: '{\"_id\": -1}'
    }

    #swagger.responses[200] = {
      description: '성공',
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/notificationListRes" }
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
  try{
    const clientId = getClientId(req);
    // 목록을 조회한 후 바로 읽음 상태로 처리했는데 StrictMode에서 두번 요청하면서 두번째 응답에 데이터가 없는 문제가 발생해서 setRead 추가
    const item = await notificationModel.find(clientId, { userId: req.user._id, setRead: false });
    
    res.json({ ok: 1, item });
  }catch(err){
    next(err);
  }
});

// 내 알림 목록 읽음 상태로 수정
router.patch('/read', jwtAuth.auth('user'), async function(req, res, next) {

  /*
    #swagger.tags = ['알림 메세지']
    #swagger.summary  = '내 알림 상태 수정'
    #swagger.description = '내 알림 목록을 읽음 상태로 수정합니다.'
    
    #swagger.security = [{
      "Access Token": [],
      "Client ID": []
    }]
    
    #swagger.responses[200] = {
      description: '성공',
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/simpleOK" }
        }
      }
    },
    #swagger.responses[401] = {
      description: '인증 실패',
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/error401" }
        }
      }
    },
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
    await notificationModel.updateAllReadState(clientId, { userId: req.user._id });
    res.json({ ok: 1 });
  }catch(err){
    next(err);
  }
});

// 알림 읽음 처리
router.patch('/:_id/read', jwtAuth.auth('user'), async function(req, res, next) {

  /*
    #swagger.tags = ['알림']
    #swagger.summary  = '알림 읽음 처리'
    #swagger.description = '지정한 알림 한 건을 읽음 처리합니다.'
    
    #swagger.security = [{
      "Access Token": [],
      "Client ID": []
    }]

    #swagger.parameters['_id'] = {
      description: "알림 id",
      in: 'path',
      type: 'number',
      example: 4
    }

    #swagger.responses[200] = {
      description: '성공',
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/simpleOK" }
        }
      }
    }
    #swagger.responses[401] = {
      description: '인증 실패',
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/error401" }
        }
      }
    }
    #swagger.responses[404] = {
      description: '본인의 알림 id가 아니거나 존재하지 않는 알림 id',
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/error404" }
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
    const _id = Number(req.params._id);
    const item = await notificationModel.findById(clientId, _id);
    if(item && item.user_id === req.user._id){
      await notificationModel.updateReadState(clientId, _id);
      res.json({ ok: 1 });
    }else{
      next();
    }
  } catch(err) {
    next(err);
  }
});
export default router;
