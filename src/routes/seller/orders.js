import _ from 'lodash';
import moment from 'moment';
import express from 'express';
import { param, query, body } from 'express-validator';

import logger from '#utils/logger.js';
import validator from '#middlewares/validator.js';
import { getClientId } from '#utils/dbUtil.js';
import sellerOrderModel from '#models/seller/order.model.js';
import orderModel from '#models/user/order.model.js';
import productModel from '#models/user/product.model.js';
import createError from 'http-errors';

const router = express.Router();

// 상품의 주문 내역 조회
router.get('/', [
  query('custom').optional().isJSON().withMessage('custom 값은 JSON 형식의 문자열이어야 합니다.'),
  query('sort').optional().isJSON().withMessage('sort 값은 JSON 형식의 문자열이어야 합니다.')
], validator.checkResult, async function (req, res, next) {

  /*
    #swagger.tags = ['주문 관리']
    #swagger.summary  = '주문 목록 조회'
    #swagger.description = '나에게 주문한 내역을 조회합니다.'
    
    #swagger.security = [{
      "Access Token": [],
      "Client ID": []
    }]

    #swagger.parameters['user_id'] = {
      description: "주문한 회원 id",
      in: 'query',
      type: 'number',
      example: 4
    }
    #swagger.parameters['state'] = {
      description: "주문 상태",
      in: 'query',
      type: 'string',
      example: 'OS020'
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
      default: '{\"createdAt\": -1}'
    }
    
    #swagger.responses[200] = {
      description: '성공',
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/orderListRes" }
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
    logger.trace(req.query);

    // 검색 옵션
    let search = {};
    const state = req.query.state;
    const user_id = Number(req.query.user_id);
    const custom = req.query.custom;

    if (state) {
      search['state'] = state;
    }

    if (user_id) {
      search['user_id'] = user_id;
    }

    if (custom) {
      search = { ...search, ...JSON.parse(custom) };
    }

    // 정렬 옵션
    let sortBy = JSON.parse(req.query.sort || '{}');

    // 기본 정렬 옵션은 구매일의 내림차순
    sortBy['createdAt'] = sortBy['createdAt'] || -1;

    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 0);

    const result = await sellerOrderModel.findBy(clientId, { seller_id: req.user._id, search, sortBy, page, limit });
    res.json({ ok: 1, ...result });

  } catch (err) {
    next(err);
  }
});

// 주문 상세 조회
router.get('/:_id', [
  param('_id').isInt().withMessage('주문 id는 정수만 지정 가능합니다.'),
], validator.checkResult, async function (req, res, next) {

  /*
   #swagger.tags = ['주문 관리']
   #swagger.summary  = '주문 상세 조회'
   #swagger.description = '주문 상세 내역을 조회합니다.'
   
   #swagger.security = [{
     "Access Token": [],
     "Client ID": []
   }]
   
   #swagger.parameters['_id'] = {
     description: '주문 id',
     in: 'path',
     required: true,
     type: 'number',
     example: '2'
   }

   #swagger.responses[200] = {
     description: '성공',
     content: {
       "application/json": {
         schema: { $ref: "#/components/schemas/orderInfoSellerRes" }
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
    const item = await sellerOrderModel.findById(clientId, Number(req.params._id), req.user._id);
    if (item) {
      res.json({ ok: 1, item });
    } else {
      next();
    }
  } catch (err) {
    next(err);
  }
});

// 주문 정보 수정
router.patch('/:_id', [
  body('products').optional().isArray().withMessage('상품 목록은 배열로 전달해야 합니다.'),
  body('products.*._id').optional().isInt().withMessage('상품 id는 정수만 입력 가능합니다.'),
], validator.checkResult, async function (req, res, next) {

  /*
    #swagger.tags = ['주문 관리']
    #swagger.summary  = '주문 정보 수정'
    #swagger.description = '주문 정보를 수정합니다.'
    
    #swagger.security = [{
      "Access Token": [],
      "Client ID": []
    }]
    
    #swagger.parameters['_id'] = {
      description: "주문 id",
      in: 'path',
      type: 'number',
      example: 2
    }
    #swagger.requestBody = {
      description: `
        수정할 주문 정보가 저장된 객체입니다.<br>
        state 속성이 지정된 경우 구매 상태의 변경 내역을 기록하기 위에 history 배열이 자동으로 추가됩니다.<br>
        주문한 상품 정보를 수정할 경우 products 속성 배열에 수정할 상품 정보를 지정합니다.<br>
        user_id(구매자), cost(결제금액), products.*.name(상품명), products.*.price(상품 가격) 등의 정보는 자동으로 생성된 데이터이므로 전달하더라도 무시됩니다.`,
      required: true,
      content: {
        "application/json": {
          examples: {
            "주문 상태 수정": { $ref: "#/components/examples/updateOrderStateBySeller" },
            "주문 내역 수정": { $ref: "#/components/examples/updateOrderBySeller" },    
          }
        }
      }
    },

    #swagger.responses[200] = {
      description: '성공',
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/orderInfoRes" },
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
    const _id = Number(req.params._id);
    
    let order;
    if (req.user.type === 'admin') {
      order = await orderModel.findById(clientId, _id);
    } else {
      order = await sellerOrderModel.findById(clientId, _id, req.user._id);
    }

    if (order) {
      if (req.user.type !== 'admin') {
        // 일반 판매자일 경우 본인이 판매하는 상품 ID만 추출
        const myProductIds = order.products
          .filter(p => p.seller_id === req.user._id)
          .map(p => p._id);

        // 수정 요청된 상품이 본인 상품인지 검증
        if (req.body.products) {
          const isAllMine = req.body.products.every(p => myProductIds.includes(Number(p._id)));
          if (!isAllMine) {
            throw createError(403, '본인이 판매하는 상품만 수정 가능합니다.');
          }
        }
      }

      const history = {
        actor: req.user._id,
        updated: { ...req.body },
        createdAt: moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss')
      };
      const result = await orderModel.update(clientId, _id, req.body, history);
      res.json({ ok: 1, item: result });
    } else {
      next();
    }


  } catch (err) {
    next(err);
  }
});

// 지정한 구매자의 상품 구매 처리
router.post('/', [
  body('user_id').isInt().withMessage('구매자 id는 정수만 입력 가능합니다.'),
  body('product_id').isInt().withMessage('상품 id는 정수만 입력 가능합니다.'),
  body('quantity').isInt().withMessage('구매 수량은 정수만 입력 가능합니다.'),
], validator.checkResult, async function (req, res, next) {

  /*
    #swagger.auto = false

    #swagger.tags = ['주문 관리']
    #swagger.summary  = '판매자에 의한 상품 구매 처리'
    #swagger.description = '판매자가 구매자의 상품 구매를 처리 합니다.<br>
    구매자가 직접 구매를 하지 않고 판매자의 재량에 의해서 구매처리를 해야 할 경우에 사용합니다.<br>
    주로 중고거래 시스템에서 거래가 완료되면 판매자가 완료처리를 해야 할 경우에 사용합니다.<br>
    본인이 판매하고 있는 제품에 한해서 구매 처리가 가능합니다.'

    #swagger.security = [{
      "Access Token": [],
      "Client ID": []
    }]
    
    #swagger.requestBody = {
      description: "<p>구매 정보가 저장된 객체입니다.</p>
      <ul>
        <li><b>*user_id</b>: 구매자 id</li>
        <li><b>*product_id</b>: 상품 id</li>
        <li><b>*quantity</b>: 구매 수량</li>
        <li>이외의 추가 속성은 자유롭게 지정하면 됩니다.</li>
      </ul>",
      required: true,
      content: {
        "application/json": {
          schema: { $ref: '#components/schemas/createSellerOrder' },
        }
      }
    },
    #swagger.responses[201] = {
      description: '성공',
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/createSellerOrderRes" },
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

    #swagger.responses[403] = {
      description: '리소스 접근 권한 없음',
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/error403Resource" }
        }
      }
    }

    #swagger.responses[404] = {
      description: '상품이 존재하지 않음',
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/error404" }
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
    req.body.state = req.body.state || 'OS020'; // 결제 완료 상태로 주문
    const clientId = getClientId(req);
    // 로그인한 사용자의 판매 상품인지 확인
    const product = await productModel.findById(clientId, { _id: req.body.product_id });
    if (product?.seller_id === req.user._id) { // 본인이 판매중인 상품일 경우
      const products = [{
        _id: req.body.product_id,
        quantity: req.body.quantity,
      }];
      const item = await orderModel.create(clientId, { ...req.body, products });
      res.status(201).json({ ok: 1, item });
    } else {
      throw createError(403, `본인이 판매중인 상품만 구매 처리가 가능합니다.`);
    }
  } catch (err) {
    next(err);
  }
});


export default router;
