import moment from 'moment-timezone';

import logger from '#utils/logger.js';
import { getDb } from '#utils/dbUtil.js';

const notificationModel = {
  // 알림 등록
  async create(clientId, notification){
    logger.trace(notification);
    const db = await getDb(clientId);

    notification._id = await db.nextSeq('notification');
    notification.channel = notification.channel || 'none'; // none, websocket, email, sms, slack, discode ...
    notification.isRead = false;
    notification.updatedAt = notification.createdAt = moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss');
    if(!notification.dryRun){
      await db.collection('notification').insertOne(notification);
    }
    return notification;
  },

  // 지정한 사용자의 읽지 않은 알림 목록 조회
  async find(clientId, { userId, setRead=false }){
    logger.trace(arguments);
    const db = await getDb(clientId);
    
    let query = { isRead: false, target_id: userId };
    
    const list = await db.collection('notification').find(query).toArray();

    if(setRead){ // 조회된 문서에 대해서 읽음 처리
      const updateResult = await db.collection('notification').updateMany({ _id: { $in: list.map(doc => doc._id) }}, { $set: { isRead: true } });
      logger.debug(updateResult);
    }
    logger.debug(list);
    return list;
  },

  // 알림 상세 조회
  async findById(clientId, _id){
    logger.trace(arguments);
    const db = await getDb(clientId);
    
    const item = await db.collection('notification').findOne({ _id });

    logger.debug(item);
    return item;
  },

  // 지정한 사용자의 모든 읽지 않은 알림을 읽음 처리
  async updateAllReadState(clientId, { userId }){
    logger.trace(arguments);
    const db = await getDb(clientId);
    let query = { target_id: userId };

    const updateResult = await db.collection('notification').updateMany(query, { $set: { isRead: true } });
    logger.debug(updateResult);
    return updateResult;
  },

  // 지정한 알림을 읽음 처리
  async updateReadState(clientId, _id){
    logger.trace(arguments);
    const db = await getDb(clientId);

    const updateResult = await db.collection('notification').updateOne({ _id }, { $set: { isRead: true } });
    logger.debug(updateResult);
    return updateResult;
  },

  // 읽지 않은 알림 수 조회
  // async getCount(clientId, userId){
  //   logger.trace(arguments);      
  //   const db = await getDb(clientId);
  //   let query = { isRead: false, target_id: userId };

  //   const totalCount = await db.collection('notification').countDocuments(query);

  //   logger.debug('읽지 않은 알림 수', totalCount);
  //   return totalCount;
  // }
}

export default notificationModel;