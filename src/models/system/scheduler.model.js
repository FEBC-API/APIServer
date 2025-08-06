import moment from 'moment-timezone';

import logger from '#utils/logger.js';
import { getDb } from '#utils/dbUtil.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore.js';

// dayjs 플러그인 설정
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);

const schedulerModel = {
  // 스케줄러 생성
  async create(clientId, schedulerInfo) {
    logger.trace(arguments);
    const db = await getDb(clientId);

    try {
      schedulerInfo._id = await db.nextSeq('scheduler');
      schedulerInfo.state = 'scheduled'; // scheduled, completed, missed, failed
      schedulerInfo.extra = schedulerInfo.extra || null;
      schedulerInfo.createdAt = moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss');
      schedulerInfo.updatedAt = moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss');

      if (!schedulerInfo.dryRun) {
        await db.collection('scheduler').insertOne(schedulerInfo);
      }
      return schedulerInfo;
    } catch (err) {
      logger.error(err);
      throw err;
    }
  },

  // 스케줄러 목록 조회
  async find(clientId) {
    logger.trace(arguments);
    const db = await getDb(clientId);

    // scheduled 상태이면서 실행 시간이 지난 스케줄러를 missed로 업데이트
    await this.updateMissedSchedulers(clientId);

    const list = await db.collection('scheduler').find({}).sort({ createdAt: -1 }).toArray();
    return list;
  },

  // 스케줄러 한건 조회
  async findById(clientId, _id) {
    logger.trace(arguments);
    const db = await getDb(clientId);
    
    // scheduled 상태이면서 실행 시간이 지난 스케줄러를 missed로 업데이트
    await this.updateMissedSchedulers(clientId);
    
    const item = await db.collection('scheduler').findOne({ _id: Number(_id) });
    logger.debug(item);
    return item;
  },

  // 스케줄러 수정
  async update(clientId, _id, scheduler) {
    logger.trace(arguments);
    const db = await getDb(clientId);

    const updateData = {
      ...scheduler,
      updatedAt: moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss')
    };

    const result = await db.collection('scheduler').updateOne(
      { _id: Number(_id) },
      { $set: updateData }
    );
    logger.debug(result);

    const item = { _id: Number(_id), ...updateData };
    return item;
  },

  // 스케줄러 삭제
  async delete(clientId, _id) {
    logger.trace(arguments);
    const db = await getDb(clientId);
    const result = await db.collection('scheduler').deleteOne({ _id: Number(_id) });
    logger.debug(result);
    return result;
  },

  // scheduled 상태이면서 실행 시간이 지난 스케줄러를 missed로 업데이트
  async updateMissedSchedulers(clientId) {
    try {
      const db = await getDb(clientId);
      const now = dayjs().tz('Asia/Seoul');
      
      // scheduled 상태인 스케줄러 중에서 실행 시간이 지난 것들을 찾아서 missed로 업데이트
      const scheduledSchedulers = await db.collection('scheduler').find({ 
        state: 'scheduled' 
      }).toArray();

      for (const scheduler of scheduledSchedulers) {
        // 클라이언트에서 전달된 시간은 한국 시간이므로 UTC로 변환
        const scheduledTime = dayjs(scheduler.time).tz('Asia/Seoul');
        
        if (scheduledTime.isSameOrBefore(now)) {
          await db.collection('scheduler').updateOne(
            { _id: scheduler._id },
            { 
              $set: {
                state: 'missed',
                executionResult: {
                  success: false,
                  error: '실행 시간이 이미 지났습니다',
                },
                updatedAt: moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss')
              }
            }
          );
          logger.info(`Client ${clientId} - 스케줄러 ${scheduler._id} (${scheduler.name}) 상태를 missed로 업데이트`);
        }
      }
    } catch (error) {
      logger.error(`Client ${clientId} - missed 스케줄러 업데이트 중 오류:`, error);
    }
  }
};

export default schedulerModel; 