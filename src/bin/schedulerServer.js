// 2024-12-19 작성
// 스케줄러 서버 - 1회 실행 스케줄 관리

import logger from '#utils/logger.js';
import { getDb } from '#utils/dbUtil.js';
import axios from 'axios';
import moment from 'moment-timezone';
import { db } from '#config/index.js';

const jobs = new Map(); // clientId별로 timeoutId 저장

// 서버 시작시 모든 스케줄러 로드 및 시작
async function start() {
  logger.info('1회 실행 스케줄 관리 서버 시작');
  await loadAndStartJobs();
}

// 모든 스케줄러 로드 및 시작
async function loadAndStartJobs() {
  try {
    // 모든 clientId의 스케줄러를 가져와서 시작
    const clientIds = await getAllClientIds();

    for (const clientId of clientIds) {
      await loadAndStartClientJobs(clientId);
    }

    // 팀별 스케줄러 상태 통계 출력
    await logSchedulerStatistics();

    logger.info('모든 스케줄러 로드 완료');
  } catch (error) {
    logger.error('스케줄러 로드 중 오류:', error);
  }
}

// 파트별 스케줄러 상태 통계 로그 출력
async function logSchedulerStatistics() {
  try {
    const clientIds = await getAllClientIds();

    for (const clientId of clientIds) {
      const db = await getDb(clientId);
      const schedulers = await db.collection('scheduler').find({}).toArray();

      // 스케줄러가 하나도 없는 클라이언트는 제외
      if (schedulers.length === 0) {
        continue;
      }

      const stats = {
        scheduled: 0,
        completed: 0,
        failed: 0,
        missed: 0,
        total: schedulers.length
      };

      schedulers.forEach(scheduler => {
        if (Object.prototype.hasOwnProperty.call(stats, scheduler.state)) {
          stats[scheduler.state]++;
        }
      });

      logger.info(`Client ${clientId} 스케줄러 통계 - 총 ${stats.total}건 (예정: ${stats.scheduled}, 완료: ${stats.completed}, 실패: ${stats.failed}, 누락: ${stats.missed})`);
    }
  } catch (error) {
    logger.error('스케줄러 통계 출력 중 오류:', error);
  }
}

// 특정 clientId의 스케줄러만 재시작
async function restartClientJobs(clientId) {
  logger.info(`Client ${clientId} 스케줄러 재시작`);
  await stopClientJobs(clientId);
  await loadAndStartClientJobs(clientId);
}

// 특정 clientId의 스케줄러 로드 및 시작
async function loadAndStartClientJobs(clientId) {
  try {
    const db = await getDb(clientId);
    const schedulers = await db.collection('scheduler').find({}).toArray();

    for (const scheduler of schedulers) {
      await startJob(clientId, scheduler);
    }
  } catch (error) {
    logger.error(`Client ${clientId} 스케줄러 로드 중 오류:`, error);
  }
}

// 개별 스케줄러 시작
async function startJob(clientId, scheduler) {
  try {
    const scheduledTime = new Date(scheduler.time.replace(/\./g, '-').replace(' ', 'T') + '+09:00');
    const now = new Date();
    const delay = scheduledTime.getTime() - now.getTime();

    if (delay <= 0) {
      logger.warn(`Client ${clientId} - 스케줄러 ${scheduler._id} (${scheduler.name})는 이미 실행 시간이 지났습니다`);

      // 과거 시간이면 missed 상태로 업데이트
      await updateExecutionResult(clientId, scheduler._id, {
        state: 'missed',
        executionResult: {
          success: false,
          error: '실행 시간이 이미 지났습니다',
          executedAt: moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss')
        }
      });
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        await executeJob(scheduler, clientId);
        // 실행 후 job map에서 제거
        const clientJobs = jobs.get(clientId) || new Map();
        clientJobs.delete(scheduler._id);
        jobs.set(clientId, clientJobs);
      } catch (error) {
        logger.error(`Client ${clientId} - 스케줄러 ${scheduler._id} 실행 중 오류:`, error);
      }
    }, delay);

    // job map에 저장
    const clientJobs = jobs.get(clientId) || new Map();
    clientJobs.set(scheduler._id, timeoutId);
    jobs.set(clientId, clientJobs);

    logger.info(`Client ${clientId} - 스케줄러 ${scheduler._id} (${scheduler.name}) 등록 완료 - ${scheduler.time}에 실행 예정`);
  } catch (error) {
    logger.error(`Client ${clientId} - 스케줄러 ${scheduler._id} 시작 중 오류:`, error);
  }
}

// 스케줄러 실행
async function executeJob(scheduler, clientId) {
  try {
    logger.info(`Client ${clientId} - 스케줄러 ${scheduler._id} (${scheduler.name}) 실행 시작`);

    const response = await axios.get(scheduler.endpoint, {
      timeout: 30000 // 30초 타임아웃
    });

    // 응답 데이터 처리
    let responseMessage;
    const contentType = response.headers['content-type'] || '';

    if (contentType.includes('application/json')) {
      // JSON 응답인 경우
      responseMessage = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    } else {
      // 일반 텍스트 응답인 경우
      responseMessage = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    }

    // 실행 결과 저장
    await updateExecutionResult(clientId, scheduler._id, {
      state: 'completed',
      executionResult: {
        success: true,
        status: response.status,
        executedAt: moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss'),
        responseMessage: responseMessage
      }
    });

    logger.info(`Client ${clientId} - 스케줄러 ${scheduler._id} (${scheduler.name}) 실행 완료 - 상태: ${response.status}`);
  } catch (error) {
    logger.error(`Client ${clientId} - 스케줄러 ${scheduler._id} (${scheduler.name}) 실행 실패:`, error.message);

    // 에러 응답 데이터 처리
    let errorMessage;
    if (error.response && error.response.data) {
      errorMessage = error.response.data;
    } else {
      errorMessage = error.message;
    }

    // 실패 결과 저장 (endpoint 호출 실패)
    await updateExecutionResult(clientId, scheduler._id, {
      state: 'failed',
      executionResult: {
        success: false,
        errorMessage: errorMessage,
        status: error.response?.status || null,
        executedAt: moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss')
      }
    });
  }
}

// 실행 결과 업데이트
async function updateExecutionResult(clientId, schedulerId, result) {
  try {
    const db = await getDb(clientId);
    await db.collection('scheduler').updateOne(
      { _id: schedulerId },
      {
        $set: {
          ...result,
          updatedAt: moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss')
        }
      }
    );
  } catch (error) {
    logger.error(`Client ${clientId} - 실행 결과 저장 실패 - 스케줄러 ${schedulerId}:`, error);
  }
}

// 특정 스케줄러 중지
function stopJob(clientId, schedulerId) {
  const clientJobs = jobs.get(clientId);
  if (clientJobs && clientJobs.has(schedulerId)) {
    const timeoutId = clientJobs.get(schedulerId);
    clearTimeout(timeoutId);
    clientJobs.delete(schedulerId);
    logger.info(`Client ${clientId} - 스케줄러 ${schedulerId} 중지됨`);
  }
}

// 특정 clientId의 모든 스케줄러 중지
function stopClientJobs(clientId) {
  const clientJobs = jobs.get(clientId);
  if (clientJobs) {
    for (const [schedulerId, timeoutId] of clientJobs) {
      clearTimeout(timeoutId);
    }
    jobs.delete(clientId);
    logger.info(`Client ${clientId}의 모든 스케줄러 중지됨`);
  }
}

// 모든 스케줄러 중지
function stopAllJobs() {
  for (const [clientId, clientJobs] of jobs) {
    for (const [schedulerId, timeoutId] of clientJobs) {
      clearTimeout(timeoutId);
    }
  }
  jobs.clear();
  logger.info('모든 스케줄러 중지됨');
}

// 모든 clientId 조회
async function getAllClientIds() {
  return db.clientIds;
}

const schedulerServer = {
  start,
  loadAndStartJobs,
  restartClientJobs,
  loadAndStartClientJobs,
  startJob,
  executeJob,
  updateExecutionResult,
  stopJob,
  stopClientJobs,
  stopAllJobs,
  getAllClientIds,
  logSchedulerStatistics
};

export default schedulerServer;
