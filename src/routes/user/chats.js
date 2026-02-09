import express from 'express';
import jwtAuth from '#middlewares/jwtAuth.js';
import { getClientId } from '#utils/dbUtil.js';
import chatModel from '#models/user/chat.model.js';

const router = express.Router();

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

export default router;
