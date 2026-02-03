import express from 'express';
import { param, body, query } from 'express-validator';

import validator from '#middlewares/validator.js';
import { getClientId } from '#utils/dbUtil.js';
import bookmarkModel from '#models/user/bookmark.model.js';

const router = express.Router();

// 북마크/좋아요 추가
router.post('/:type', [
  param('type').matches(/^(product|post|user)$/).withMessage('북마크/좋아요 구분은 product, post, user 중 하나로 전달해야 합니다.'),
  body('target_id').isInt().withMessage('북마크/좋아요 대상 id는 정수만 입력 가능합니다.'),
  // equals(true)로 지정해도 문자열 'true'로 비교함
  body('is_like').optional().custom(value => value === true).withMessage('좋아요를 추가할 경우 is_like는 true로 전달해야합니다.'),
], validator.checkResult, async function (req, res, next) {

  /*
    #swagger.tags = ['북마크']
    #swagger.summary  = '북마크/좋아요 추가'
    #swagger.description = '상품 | 사용자 | 게시글에 북마크 또는 좋아요를 추가합니다.'
    
    #swagger.security = [{
      "Access Token": [],
      "Client ID": []
    }]
    
    #swagger.parameters['type'] = {
      description: `대상 구분<br>
        product: 상품<br>
        user: 사용자<br>
        post: 게시글<br>`,
      in: 'path',
      required: true,
      type: 'string',
      example: 'product'
    }

    #swagger.requestBody = {
      description: `target_id: (필수) 북마크/좋아요 대상 id (상품 id | 사용자 id | 게시글 id)<br>
        is_like: (선택) 좋아요일 경우 true (북마크일 경우 생략)<br>
        memo: (선택) 북마크/좋아요 메모<br>
        extra: (선택) 자유롭게 지정하는 추가 정보<br>`,
      required: true,
      content: {
        "application/json": {
          schema: { $ref: '#components/schemas/addBookmarkBody' },
        }
      }
    }

    #swagger.responses[201] = {
      description: '성공',
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/addBookmarkRes" }
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
    #swagger.responses[409] = {
      description: '이미 추가된 북마크이거나 좋아요',
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/error409' }
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
    console.log(req.body);
    const clientId = getClientId(req);
    const bookmarkInfo = {
      type: req.params.type,
      user_id: req.user._id,
      target_id: Number(req.body.target_id),
    };
    if(req.body.is_like === true){
      bookmarkInfo.is_like = true;
    }else{
      // 북마크만 조회하려면 is_like 필드가 존재하지 않는 문서를 찾아야 함
      bookmarkInfo.is_like = { $exists: false };
    }
    const bookmark = await bookmarkModel.findOneBy(clientId, bookmarkInfo);
    if (bookmark) {
      res.status(409).json({ ok: 0, _id: bookmark._id, message: '이미 등록되어 있습니다.' });
    } else {
      delete bookmarkInfo.is_like; // 북마크일 경우는 지정 안함
      bookmarkInfo.user = {
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        image: req.user.image
      }
      Object.assign(bookmarkInfo, req.body);
      const item = await bookmarkModel.create(clientId, bookmarkInfo);
      res.status(201).json({ ok: 1, item });
    }
  } catch (err) {
    next(err);
  }
});

// 내 북마크/좋아요 목록 조회
router.get('/:type', [
  param('type').matches(/^(product|post|user)$/).withMessage('북마크/좋아요 대상 구분은 product, post, user 중 하나로 전달해야 합니다.'),
  // 쿼리스트링은 문자열로 전달됨
  query('is_like').optional().equals('true').withMessage('좋아요를 조회할 경우 is_like는 true로 전달해야합니다.'),
], validator.checkResult, async function (req, res, next) {

  /*
    #swagger.tags = ['북마크']
    #swagger.summary  = '북마크/좋아요 목록 조회'
    #swagger.description = '사용자의 북마크 또는 좋아요 목록을 조회합니다.'
    
    #swagger.security = [{
      "Access Token": [],
      "Client ID": []
    }]
    
    #swagger.parameters['type'] = {
      description: '대상 구분 (product | user | post)',
      in: 'path',
      required: true,
      type: 'string',
      example: 'product'
    }

    #swagger.parameters['is_like'] = {
      description: '좋아요일 경우 true (북마크일 경우 생략)',
      in: 'query',
      required: false,
      type: 'string',
      example: 'true'
    }

    #swagger.responses[200] = {
      description: '성공',
      content: {
        "application/json": {
          schema: { $ref: '#components/schemas/bookmarkProductListRes' },
          examples: {
            "상품": { $ref: "#/components/examples/bookmarkProductListRes" },
            "사용자": { $ref: "#/components/examples/bookmarkUserListRes" },
            "게시글": { $ref: "#/components/examples/bookmarkPostListRes" }
          }
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
    
    const query = { user_id: req.user._id, type: req.params.type };
    if(req.query.is_like === 'true'){
      query.is_like = true;
    }else{
      // 북마크만 조회하려면 is_like 필드가 존재하지 않는 문서를 찾아야 함
      query.is_like = { $exists: false };
    }
    const result = await bookmarkModel.findBy(clientId, query);
    res.json({ ok: 1, item: result });
  } catch (err) {
    next(err);
  }
});

// 지정한 상품|사용자|게시글에 대한 나의 북마크/좋아요 한건 조회
router.get('/:type/:target_id', [
  param('type').matches(/^(product|post|user)$/).withMessage('북마크/좋아요 대상 구분은 product, post, user 중 하나로 전달해야 합니다.'),
  param('target_id').isInt().withMessage('대상 id는 정수만 입력 가능합니다.'),
], validator.checkResult, async function (req, res, next) {

  /*
    #swagger.tags = ['북마크']
    #swagger.summary  = '북마크/좋아요 한건 조회'
    #swagger.description = '지정한 상품|사용자|게시글에 대한 나의 북마크 또는 좋아요 정보를 조회합니다.'
    
    #swagger.security = [{
      "Access Token": [],
      "Client ID": []
    }]

    #swagger.parameters['type'] = {
      description: '대상 구분 (product | user | post)',
      in: 'path',
      required: true,
      type: 'string',
      example: 'product'
    }
    #swagger.parameters['target_id'] = {
      description: '대상 id (상품 id | 사용자 id | 게시글 id)',
      in: 'path',
      required: true,
      type: 'number',
      example: '2'
    }

    #swagger.responses[200] = {
      description: '성공',
      content: {
        "application/json": {
          schema: { $ref: '#components/schemas/bookmarkProductInfoRes' },
          examples: {
            "상품": { $ref: "#/components/examples/bookmarkProductInfoRes" },
            "사용자": { $ref: "#/components/examples/bookmarkUserInfoRes" },
            "게시글": { $ref: "#/components/examples/bookmarkPostInfoRes" }
          }
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
      description: '리소스가 존재하지 않음',
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
    const item = await bookmarkModel.findOneBy(clientId, { 
      user_id: req.user._id, 
      type: req.params.type, 
      target_id: Number(req.params.target_id) 
    });
    if (item) {
      res.json({ ok: 1, item });
    } else {
      next();
    }
  } catch (err) {
    next(err);
  }
});

// 북마크/좋아요 삭제
router.delete('/:_id', [
  param('_id').isInt().withMessage('북마크/좋아요 id는 정수만 입력 가능합니다.'),
], validator.checkResult, async function (req, res, next) {

  /*
    #swagger.tags = ['북마크']
    #swagger.summary  = '북마크/좋아요 삭제'
    #swagger.description = '북마크 또는 좋아요를 삭제합니다.'
    
    #swagger.security = [{
      "Access Token": [],
      "Client ID": []
    }]
    
    #swagger.parameters['_id'] = {
      description: '북마크/좋아요 id',
      in: 'path',
      required: true,
      type: 'number',
      example: '2'
    }

    #swagger.responses[200] = {
      description: '성공',
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/simpleOK" }
          }
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
      description: '리소스가 존재하지 않음',
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
    const result = await bookmarkModel.delete(clientId, { 
      user_id: req.user._id, 
      _id: Number(req.params._id) 
    });
    if (result.deletedCount) {
      return res.json({ ok: 1 });
    } else {
      next();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
