/**
 * 통계 관련 타입 정의
 */

/**
 * 통계 정보
 */
export interface Statistics {
  users?: {
    total: number;
    user: number;
    seller: number;
  };
  products?: {
    total: number;
    active: number;
    soldOut: number;
  };
  orders?: {
    total: number;
    pending: number;
    completed: number;
  };
  [key: string]: any;
}

