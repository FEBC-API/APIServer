import codeUtil from '#utils/codeUtil.js';
import express from 'express';
import { getClientId } from '#utils/dbUtil.js';
import configModel from '#models/system/config.model.js';
const router = express.Router();

// 설정 목록 조회
router.get('/', async function(req, res, next) {
  /*
    #swagger.auto = false

    #swagger.tags = ['설정 조회']
    #swagger.summary  = '설정값 목록 조회'
    #swagger.description = '설정값 목록을 조회한다.'

    #swagger.security = [{
      "Client ID": []
    }]

    #swagger.responses[200] = {
      description: '성공',
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/configListRes" }
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
    const item = await configModel.find(clientId);
    res.json({ ok: 1, item: codeUtil.arrayToObject(item) });
  }catch(err){
    next(err);
  }
});

// 설정 한건 조회
router.get('/:_id', async function(req, res, next) {
  /*
    #swagger.tags = ['설정 조회']
    #swagger.summary  = '설정값 한건 조회'
    #swagger.description = '설정값 한건을 조회한다.'

    #swagger.security = [{
      "Client ID": []
    }]
      
    #swagger.parameters['_id'] = {
      description: "설정 id",
      in: 'path',
      type: 'string',
      example: 'shippingFees'
    }

    #swagger.responses[200] = {
      description: '성공',
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/configInfoRes" }
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

  try{  
    const clientId = getClientId(req);
    let item = await configModel.findById(clientId, req.params._id);
    
    res.json({ ok: 1, item });
  }catch(err){
    next(err);
  }
});


export default router;
