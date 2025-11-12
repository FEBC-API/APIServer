/**
 * 스케줄러 관련 타입 정의
 */

/**
 * 스케줄러 상태
 */
export type SchedulerState = 'scheduled' | 'completed' | 'failed' | 'missed';

/**
 * 실행 결과 (성공)
 */
export interface ExecutionResultSuccess {
  success: true;
  status: number;
  responseMessage?: any;
}

/**
 * 실행 결과 (실패)
 */
export interface ExecutionResultFailure {
  success: false;
  errorMessage?: string;
  status?: number;
}

/**
 * 실행 결과
 */
export type ExecutionResult = ExecutionResultSuccess | ExecutionResultFailure;

/**
 * 스케줄러 정보
 */
export interface Scheduler {
  _id: number;
  name: string;
  description?: string;
  endpoint: string;
  time: string; // YYYY.MM.DD HH:mm:ss 형식
  extra?: Record<string, any>;
  state: SchedulerState;
  executionResult?: ExecutionResult;
  createdAt: string;
  updatedAt: string;
}

/**
 * 스케줄러 생성 요청
 */
export interface CreateSchedulerRequest {
  name: string;
  endpoint: string;
  time: string; // YYYY.MM.DD HH:mm:ss 형식
  description?: string;
  extra?: Record<string, any>;
}

/**
 * 스케줄러 수정 요청
 */
export interface UpdateSchedulerRequest {
  name?: string;
  description?: string;
  endpoint?: string;
  time?: string; // YYYY.MM.DD HH:mm:ss 형식
  extra?: Record<string, any>;
}

/**
 * 스케줄러 목록 응답
 */
export interface SchedulerListResponse {
  ok: 1;
  item: Scheduler[];
}

/**
 * 스케줄러 상세 응답
 */
export interface SchedulerDetailResponse {
  ok: 1;
  item: Scheduler;
}

