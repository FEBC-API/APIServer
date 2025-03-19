import _ from 'lodash';
import createError from 'http-errors';

import logger from '#utils/logger.js';
import { getDb } from '#utils/dbUtil.js';

const codeModel={
  // 코드 한세트 등록
  async create(clientId, codeInfo){
    logger.trace(arguments);
    const db = await getDb(clientId);

    try{
      if(!codeInfo.dryRun){
        await db.collection('code').insertOne(codeInfo);
        return codeInfo;
      }
    }catch(err){
      logger.error(err);
      if(err.code === 11000){
        throw createError(409, '이미 등록된 코드입니다.', { cause: err });
      }else{
        throw err;
      }
    }
  },

  // 전체 코드 목록 조회
  async find(clientId){
    logger.trace(arguments);
    const db = await getDb(clientId);

    const list = await db.collection('code').find().toArray();
    list.forEach(code => _.sortBy(code.codes, 'sort'));

    return list;
  },

  // 코드 한세트 상세 조회
  async findById(clientId, _id, search){
    logger.trace(arguments);
    const db = await getDb(clientId);
    let item = await db.collection('code').findOne({_id});
    if(item){
      // 검색 속성이 문자열일 경우 숫자로 변환
      // 숫자로 변환할 수 없는 문자열은 그대로 사용
      search = Object.keys(search).reduce((acc, key) => ({ ...acc, [key]: isNaN(Number(search[key])) ? search[key] : Number(search[key]) }), {});
      item.codes = _.chain(item.codes).filter(search).sortBy(['sort']).value();
    }

    logger.debug(item);
    return item;
  },

  // 코드 한건 조회
  async findByCode(clientId, code){
    logger.trace(arguments);
    const db = await getDb(clientId);
    let item = await db.collection('code').findOne(
      { 'codes.code': code },
      { projection: { codes: { $elemMatch: { code: code } } } }
    );

    if(item && item.codes && item.codes.length > 0){
      item = item.codes[0];
    }else{
      item = null;
    }

    logger.debug(item);
    return item;
  },

  // 코드 수정
  async update(clientId, _id, code){
    logger.trace(arguments);
    const db = await getDb(clientId);
    const result = await db.collection('code').updateOne({_id}, { $set: code });
    logger.debug(result);
    const item = { _id, ...code };
    return item;
  },

  // 코드 삭제
  async delete(clientId, _id){
    logger.trace(arguments);
    const db = await getDb(clientId);
    const result = await db.collection('code').deleteOne({_id});
    logger.debug(result);
    return result;
  }
}

export default codeModel;