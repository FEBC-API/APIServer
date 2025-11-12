/**
 * 공통 타입 정의
 */

/**
 * API 응답 기본 구조
 */
export interface ApiResponse<T = any> {
  ok: 0 | 1;
  message?: string;
  item?: T;
  items?: T[];
  pagination?: Pagination;
  [key: string]: any;
}

/**
 * 페이지네이션 정보
 */
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * 에러 응답
 */
export interface ErrorResponse {
  ok: 0;
  message: string;
  errors?: Record<string, {
    type: string;
    value: any;
    msg: string;
    location: string;
  }>;
}

/**
 * 상품 이미지
 */
export interface ProductImage {
  url: string;
  name?: string;
}

