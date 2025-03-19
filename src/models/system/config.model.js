import createError from 'http-errors';

import logger from '#utils/logger.js';
import { getDb } from '#utils/dbUtil.js';

const configModel={
  // 설정 등록
  async create(clientId, configInfo){
    logger.trace(arguments);
    const db = await getDb(clientId);

    try{
      if(!configInfo.dryRun){
        await db.collection('config').insertOne(configInfo);
        return configInfo;
      }
    }catch(err){
      logger.error(err);
      if(err.code === 11000){
        throw createError(409, '이미 등록된 설정값입니다.', { cause: err });
      }else{
        throw err;
      }
    }
  },

  // 전체 설정 목록 조회
  async find(clientId){
    logger.trace(arguments);
    const db = await getDb(clientId);

    const list = await db.collection('config').find().toArray();    

    return list;
  },

  // 설정 상세 조회
  async findById(clientId, _id){
    logger.trace(arguments);
    const db = await getDb(clientId);
    let item = await db.collection('config').findOne({_id});  
    logger.debug(item);
    return item;
  },

  // 설정 수정
  async update(clientId, _id, config){
    logger.trace(arguments);
    const db = await getDb(clientId);
    const result = await db.collection('config').updateOne({_id}, { $set: config });
    logger.debug(result);
    const item = { _id, ...config };
    return item;
  },

  // 설정 삭제
  async delete(clientId, _id){
    logger.trace(arguments);
    const db = await getDb(clientId);
    const result = await db.collection('config').deleteOne({_id});
    logger.debug(result);
    return result;
  }
}

export default configModel;