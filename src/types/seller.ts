/**
 * 판매자 관련 타입 정의
 */

import type { ProductListItem, ProductDetail } from './product.js';
import type { OrderListItem, OrderDetail } from './order.js';

/**
 * 판매자 상품 목록 정보 (목록 조회용)
 */
export interface SellerProductListItem extends ProductListItem {
  orders?: number; // 주문 수
  ordersQuantity?: number; // 주문 수량 합계
}

/**
 * 판매자 상품 상세 정보 (상세 조회용)
 */
export interface SellerProductDetail extends ProductDetail {
  orders?: any[]; // 주문 목록
}

/**
 * 판매자 주문 목록 정보 (목록 조회용)
 */
export interface SellerOrderListItem extends OrderListItem {
  // 판매자 전용 필드
}

/**
 * 판매자 주문 상세 정보 (상세 조회용)
 */
export interface SellerOrderDetail extends OrderDetail {
  // 판매자 전용 필드
}

