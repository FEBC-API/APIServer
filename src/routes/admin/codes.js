import express from 'express';
import CodeModel from '#models/system/code.model.js';
import { getClientId } from '#utils/dbUtil.js';

const router = express.Router();

// 코드 등록
router.post('/', async function(req, res, next) {
  /*
    #swagger.tags = ['코드 관리']
    #swagger.summary  = '코드 등록'
    #swagger.description = '코드를 등록합니다.<br>코드 등록을 완료한 후 코드 정보를 반환합니다.'

    #swagger.security = [{
      "Access Token": [],
      "Client ID": []
    }]

    #swagger.requestBody = {
      description: "코드 정보",
      required: true,
      content: {
        "application/json": {
          schema: { $ref: '#components/schemas/createCode' },
          examples: {
            "판매 회원 승인 코드": { $ref: "#/components/examples/createSellerConfirmBody" },
          }
        }
      }
    }
    #swagger.responses[201] = {
      description: '성공',
      content: {
        "application/json": {
          examples: {
            "판매 회원 승인 코드": { $ref: "#/components/examples/createCodeRes" }
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
    #swagger.responses[409] = {
      description: '이미 등록된 리소스',
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

  try{
    const clientId = getClientId(req);
    const item = await CodeModel.create(clientId, req.body);    
    res.status(201).json({ok: 1, item});
  }catch(err){
    next(err);
  }
});

// 코드 수정
router.put('/:_id', async function(req, res, next) {
  /*
    #swagger.tags = ['코드 관리']
    #swagger.summary  = '코드 수정'
    #swagger.description = '코드를 수정합니다.'

    #swagger.security = [{
      "Access Token": [],
      "Client ID": []
    }]

    #swagger.parameters['_id'] = {
      description: "코드 id",
      in: 'path',
      type: 'string',
      example: 'membershipClass'
    }

    #swagger.requestBody = {
      description: "수정할 코드 정보",
      required: true,
      content: {
        "application/json": {
          examples: {
            "회원 등급에 VVIP 추가": { $ref: "#/components/examples/updateMembershipClassCode" }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: '성공',
      content: {
        "application/json": {
          examples: {
            "회원 등급에 VVIP 추가": { $ref: "#/components/examples/updateMembershipClassCodeRes" }
          }
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
    #swagger.responses[404] = {
      description: '코드가 존재하지 않음',
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/error404" }
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
  try{
    const clientId = getClientId(req);
    const result = await CodeModel.update(clientId, req.params._id, req.body);
    if(result){
      res.json({ok: 1, updated: result});  
    }else{
      next();
    }
  }catch(err){
    next(err);
  }
});

// 코드 삭제
router.delete('/:_id', async function(req, res, next) {
  /*
    #swagger.tags = ['코드 관리']
    #swagger.summary  = '코드 삭제'
    #swagger.description = '코드를 삭제합니다.'

    #swagger.security = [{
      "Access Token": [],
      "Client ID": []
    }]

    #swagger.parameters['_id'] = {
      description: "코드 id",
      in: 'path',
      type: 'string',
      example: 'membershipClass'
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
      description: '삭제할 코드가 존재하지 않음',
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
  try{
    const clientId = getClientId(req);
    const result = await CodeModel.delete(clientId, req.params._id);
    if(result.deletedCount){
      res.json({ok: 1});
    }else{
      next();
    }
  }catch(err){
    next(err);
  }
});

export default router;
