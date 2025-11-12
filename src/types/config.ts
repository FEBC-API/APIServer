/**
 * 설정 관련 타입 정의
 */

/**
 * 설정 정보
 */
export interface Config {
  _id: number;
  key: string;
  value: any;
  extra?: Record<string, any>;
}
