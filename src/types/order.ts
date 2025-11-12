/**
 * 주문 관련 타입 정의
 */

import type { Review } from './review.js';
import type { Product } from './product.js';

/**
 * 주문 비용 정보
 */
export interface OrderCost {
  productsPrice: number;
  shippingFees: number;
  totalPrice: number;
  discount?: {
    productsPrice?: number;
    shippingFees?: number;
    totalPrice?: number;
  };
}

/**
 * 주문 이력
 */
export interface OrderHistory {
  state: string;
  createdAt: string;
  message?: string;
}

/**
 * 주문 상품 정보 (Product에서 필요한 필드만 선택)
 */
export type OrderProductInfo = Pick<Product, '_id' | 'name' | 'price' | 'seller_id' | 'extra'> & {
  image?: string; // mainImages[0]에서 추출
  quantity: number; // 주문 수량
  size?: string;
  color?: string;
  state?: string;
  delivery?: {
    company?: string;
    trackingNumber?: string;
  };
  review_id?: number;
  review?: Review;
  history?: OrderHistory[];
};

/**
 * 주문 상품 정보 (기본 타입 - 모든 속성 포함)
 */
export interface OrderProduct extends OrderProductInfo {
  // OrderProductInfo를 기반으로 정의
}

/**
 * 주문 정보 (기본 타입 - 모든 속성 포함)
 */
export interface Order {
  _id: number;
  user_id: number;
  products: OrderProduct[];
  cost: OrderCost;
  state: string;
  delivery?: {
    company?: string;
    trackingNumber?: string;
  };
  type?: 'cart' | 'direct';
  history?: OrderHistory[];
  createdAt: string;
  updatedAt: string;
}

/**
 * 주문 목록 조회용 (기본 타입과 동일)
 */
export interface OrderListItem extends Order {
  // 목록과 상세가 동일한 구조
}

/**
 * 주문 상세 정보 (모든 속성 포함)
 */
export interface OrderDetail extends Order {
  // 상세 조회에서는 모든 속성 포함
}

/**
 * 주문 수정 응답 (상세 정보와 동일)
 */
export interface OrderUpdateResponse extends OrderDetail {
  // 수정 응답은 상세 조회와 동일한 구조
}

/**
 * 주문 생성 요청
 */
export interface CreateOrderRequest {
  products: Array<{
    _id: number;
    quantity: number;
    size?: string;
    color?: string;
  }>;
  discount?: number;
  type?: 'cart' | 'direct';
}

/**
 * 주문 상태 수정 요청
 */
export interface UpdateOrderStateRequest {
  state: string;
  delivery?: {
    company?: string;
    trackingNumber?: string;
  };
}

