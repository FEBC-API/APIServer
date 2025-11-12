/**
 * 후기 관련 타입 정의
 */

import type { UserBasic } from './user.js';
import type { Product } from './product.js';

/**
 * 후기의 사용자 정보 (UserBasic에서 필요한 필드만 선택)
 */
export type ReviewUser = Pick<UserBasic, '_id' | 'name' | 'image'>;

/**
 * 후기의 상품 정보 (Product에서 필요한 필드만 선택)
 */
export type ReviewProduct = Pick<Product, '_id' | 'name'> & {
  image?: string; // mainImages[0]에서 추출
};

/**
 * 후기 정보 (기본 타입 - 모든 속성 포함)
 */
export interface Review {
  _id: number;
  user_id: number;
  order_id: number;
  product_id: number;
  rating: number;
  content: string;
  extra?: Record<string, any>;
  createdAt: string;
  updatedAt?: string;
  product?: ReviewProduct;
  user?: ReviewUser;
}

/**
 * 후기 목록 조회용 (기본 타입과 동일)
 */
export interface ReviewListItem extends Review {
  // 목록과 상세가 동일한 구조
}

/**
 * 후기 상세 정보 (기본 타입과 동일)
 */
export interface ReviewDetail extends Review {
  // 목록과 상세가 동일한 구조
}

/**
 * 후기 수정 응답 (상세 정보와 동일)
 */
export interface ReviewUpdateResponse extends ReviewDetail {
  // 수정 응답은 상세 조회와 동일한 구조
}

/**
 * 후기 생성 요청
 */
export interface CreateReviewRequest {
  order_id: number;
  product_id: number;
  rating: number;
  content: string;
  extra?: Record<string, any>;
}

/**
 * 후기 수정 요청
 */
export interface UpdateReviewRequest {
  rating?: number;
  content?: string;
  extra?: Record<string, any>;
}

