/**
 * 시스템 관련 타입 정의
 */

/**
 * 코드 정보
 */
export interface Code {
  _id: number;
  group: string;
  code: string;
  name: string;
  value?: string;
  extra?: Record<string, any>;
  order?: number;
}

/**
 * 코드 목록 응답
 */
export interface CodeListResponse {
  ok: 1;
  item: {
    flatten: Record<string, Code>;
    nested: Record<string, any>;
  };
}

