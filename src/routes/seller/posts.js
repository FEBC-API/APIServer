import express from 'express';
import _ from 'lodash';
import { query, body } from 'express-validator';
import validator from '#middlewares/validator.js';
import { getClientId } from '#utils/dbUtil.js';
import postModel from '#models/user/post.model.js';

const router = express.Router();

// 판매자의 상품에 등록된 게시글 목록 조회
router.get('/', [
  query('custom').optional().isJSON().withMessage('custom 값은 JSON 형식의 문자열이어야 합니다.'),
  query('sort').optional().isJSON().withMessage('sort 값은 JSON 형식의 문자열이어야 합니다.')
], validator.checkResult, async function (req, res, next) {

  /*
    #swagger.tags = ['게시판']
    #swagger.summary  = '판매자의 상품에 등록된 게시글 목록'
    #swagger.description = '판매자의 상품에 등록된 게시글 목록을 조회합니다.'
    
    #swagger.security = [{
      "Client ID": []
    }]
      
    #swagger.parameters['_id'] = {
      description: "판매자 id",
      in: 'path',
      type: 'number',
      example: 2
    }
    #swagger.parameters['product_id'] = {
      description: "상품 id",
      in: 'query',
      type: 'number',
      example: 1
    }
    #swagger.parameters['type'] = {
      description: "게시판 종류",
      in: 'query',
      type: 'string',
      default: 'post',
      example: 'qna'
    }
    #swagger.parameters['keyword'] = {
      description: "검색어<br>제목과 내용 검색에 사용되는 키워드",
      in: 'query',
      type: 'string',
      example: '배송'
    }
    #swagger.parameters['custom'] = {
      description: "custom 검색 조건",
      in: 'query',
      type: 'string',
      example: '{\"createdAt\": {\"$gte\": \"2024.04\", \"$lt\": \"2024.05\"}}'
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
          schema: { $ref: "#/components/schemas/postListRes" }
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
    const sellerId = Number(req.params.sellerId);
    const productId = Number(req.query.product_id);
    // if(req.user.type === 'seller' && sellerId === req.user._id){

    let search = { seller_id: sellerId };
    const keyword = req.query.keyword;
    const custom = req.query.custom;

    if (productId) {
      search.product_id = productId;
    }

    if (keyword) {
      const regex = new RegExp(keyword, 'i');
      search['$or'] = [{ title: regex }, { content: regex }];
    }

    if (custom) {
      search = { ...search, ...JSON.parse(custom) };
    }

    // 정렬 옵션
    let sortBy = JSON.parse(req.query.sort || '{}');
    // 기본 정렬 옵션은 _id의 내림차순
    sortBy['_id'] = sortBy['_id'] || -1; // 내림차순

    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 0);

    const item = await postModel.find(clientId, { type: req.query.type, search, sortBy, page, limit });
    res.json({ ok: 1, ...item });
    // }else{
    //   next();
    // }
  } catch (err) {
    next(err);
  }
});

export default router;
