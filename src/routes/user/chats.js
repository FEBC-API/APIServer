import express from 'express';
import { body } from 'express-validator';
import jwtAuth from '#middlewares/jwtAuth.js';
import validator from '#middlewares/validator.js';
import { getClientId } from '#utils/dbUtil.js';
import chatModel from '#models/user/chat.model.js';

const router = express.Router();

// 채팅방 생성
router.post('/', jwtAuth.auth('user'), [
  body('roomId').trim().notEmpty().withMessage('roomId는 필수입니다.'),
  body('members').isArray().withMessage('members는 배열이어야 합니다.')
], validator.checkResult, async function (req, res, next) {
  /*
    #swagger.tags = ['채팅']
    #swagger.summary  = '채팅방 생성'
    #swagger.description = '채팅방을 생성합니다. 이미 존재하는 roomId라면 해당 채팅방 정보를 반환합니다.'
    #swagger.security = [{
      "Access Token": []
    }]
    #swagger.requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              roomId: { type: "string", example: "chat_post_1_2_3" },
              members: { 
                type: "array", 
                items: { 
                  type: "object",
                  properties: {
                    _id: { type: "number" },
                    name: { type: "string" },
                    email: { type: "string" },
                    image: { type: "string" }
                  }
                },
                example: [{_id: 2, name: "용쌤"}, {_id: 3, name: "어피치"}]
              }
            }
          }
        }
      }
    }
  */
  try {
    const clientId = getClientId(req);
    const item = await chatModel.create(clientId, req.body);
    res.status(201).json({ ok: 1, item });
  } catch (err) {
    next(err);
  }
});

// 내 채팅방 목록 조회
router.get('/', jwtAuth.auth('user'), async function (req, res, next) {
  /*
    #swagger.tags = ['채팅']
    #swagger.summary  = '내 채팅방 목록 조회'
    #swagger.description = '내가 속한 채팅방 목록을 조회합니다.'
    #swagger.security = [{
      "Access Token": []
    }]
  */
  try {
    const clientId = getClientId(req);
    const list = await chatModel.find(clientId, Number(req.user._id));
    res.json({ ok: 1, item: list });
  } catch (err) {
    next(err);
  }
});

// 리소스 종류별 채팅방 상세 조회(없을 경우 생성해서 반환)
router.get('/:resource_type/:_id', jwtAuth.auth('user'), async function (req, res, next) {
  /*
    #swagger.tags = ['채팅']
    #swagger.summary  = '채팅방 상세 조회 및 생성'
    #swagger.description = '대상 리소스에 대한 채팅방 상세 정보를 조회합니다.<br>대상 채팅방이 없을 경우 새로운 채팅방을 생성해서 반환합니다.'
    #swagger.security = [{
      "Access Token": []
    }]
    #swagger.parameters['resource_type'] = {
      description: `조회 방식 혹은 리소스 타입<br>
        room: 채팅방 ID(_id)로 직접 조회 (생성 안함)<br>
        user: 지정한 사용자와의 1:1 채팅방 조회/생성<br>
        post: 특정 게시글에 대한 채팅방 조회/생성<br>
        product: 특정 상품에 대한 채팅방 조회/생성`,
      in: 'path',
      type: 'string',
      example: 'post'
    }
    #swagger.parameters['_id'] = {
      description: '채팅방 ID 혹은 리소스(user, post, product 등)의 ID',
      in: 'path',
      type: 'string',
      example: '1'
    }
  */
  try {
    const clientId = getClientId(req);
    const resourceType = req.params.resource_type;
    const resourceId = Number(req.params._id);

    let item;
    if (resourceType === 'room') {
      // 1. 채팅방 ID로 직접 조회
      item = await chatModel.findById(clientId, resourceId, Number(req.user._id));
      
      // 채팅방 멤버가 아닌 경우 접근 불가
      if (!item || !item.members.some(m => m._id === Number(req.user._id))) {
        return next();
      }
    } else {
      // 2. 리소스 기반 조회 (없으면 생성)
      item = await chatModel.findBySourceId(clientId, resourceType, resourceId, req.user);
    }

    res.json({ ok: 1, item });
  } catch (err) {
    next(err);
  }
});

// 메시지 전송 (저장)
router.post('/:roomId/messages', jwtAuth.auth('user'), [
  body('content').trim().notEmpty().withMessage('내용을 입력해주세요.')
], validator.checkResult, async function (req, res, next) {
  /*
    #swagger.tags = ['채팅']
    #swagger.summary  = '메시지 전송(저장)'
    #swagger.description = '채팅방에 메시지를 저장합니다.'
    #swagger.security = [{
      "Access Token": []
    }]
    #swagger.parameters['roomId'] = {
      description: "채팅방 ID",
      in: 'path',
      type: 'string',
      example: 'chat_post_1_2_3'
    }
    #swagger.requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              content: { type: "string", example: "안녕하세요" },
              senderId: { type: "number", example: 2 }
            }
          }
        }
      }
    }
  */
  try {
    const clientId = getClientId(req);
    const roomId = req.params.roomId;
    
    // 메시지 객체 생성
    const message = {
      _id: Date.now(), // 또는 별도 ID 생성 로직 사용 가능
      senderId: req.user._id, // 토큰 기반 senderId 설정 (보안 강화)
      content: req.body.content,
      isRead: false
    };

    await chatModel.addMessage(clientId, roomId, message);
    res.json({ ok: 1, item: message });
  } catch (err) {
    next(err);
  }
});

// 채팅방 입장
router.post('/:roomId/join', jwtAuth.auth('user'), async function (req, res, next) {
  /*
    #swagger.tags = ['채팅']
    #swagger.summary  = '채팅방 입장'
    #swagger.description = '채팅방 멤버로 참여합니다.'
    #swagger.security = [{
      "Access Token": []
    }]
  */
  try {
    const clientId = getClientId(req);
    const roomId = req.params.roomId;
    
    // 사용자 정보 구성
    const user = {
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      image: req.user.image
    };

    // 1:1 채팅에서는 방 생성 시 멤버가 확정되므로 명시적 join은 필요 없음
    res.status(405).json({ ok: 0, message: '1:1 채팅에서는 명시적 입장이 지원되지 않습니다.' });
  } catch (err) {
    next(err);
  }
});

// 채팅방 퇴장
router.post('/:roomId/leave', jwtAuth.auth('user'), async function (req, res, next) {
  /*
    #swagger.tags = ['채팅']
    #swagger.summary  = '채팅방 퇴장'
    #swagger.description = '채팅방에서 나갑니다.'
    #swagger.security = [{
      "Access Token": []
    }]
  */
  try {
    const clientId = getClientId(req);
    const roomId = req.params.roomId;
    await chatModel.leave(clientId, roomId, Number(req.user._id));
    res.json({ ok: 1 });
  } catch (err) {
    next(err);
  }
});

export default router;
