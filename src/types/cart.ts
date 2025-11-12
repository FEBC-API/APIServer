/**
 * 장바구니 관련 타입 정의
 */

import type { OrderCost } from './order.js';
import type { Product } from './product.js';

/**
 * 장바구니의 상품 정보 (Product에서 필요한 필드만 선택)
 */
export type CartProduct = Pick<Product, '_id' | 'name' | 'price' | 'seller_id' | 'quantity' | 'buyQuantity' | 'extra'> & {
  image?: string; // mainImages[0]에서 추출
};

/**
 * 장바구니 상품 정보 (기본 타입 - 모든 속성 포함)
 */
export interface CartItem {
  _id: number;
  product_id: number;
  quantity: number;
  size?: string;
  color?: string;
  product: CartProduct;
  createdAt: string;
  updatedAt: string;
}

/**
 * 장바구니 목록 (로그인 상태)
 */
export interface CartList extends Array<CartItem> {
  cost?: OrderCost;
}

/**
 * 로컬 장바구니의 상품 정보 (Product에서 필요한 필드만 선택)
 */
export type LocalCartProduct = Pick<Product, '_id' | 'name' | 'price' | 'seller_id' | 'quantity' | 'extra'> & {
  image?: string; // mainImages[0]에서 추출
  quantityInStock: number; // 재고 수량 (quantity와 동일)
};

/**
 * 장바구니 목록 (비로그인 상태)
 */
export interface LocalCartList {
  products: LocalCartProduct[];
  cost: OrderCost;
}

/**
 * 장바구니 추가 요청
 */
export interface AddCartRequest {
  product_id: number;
  quantity: number;
  size?: string;
  color?: string;
}

/**
 * 장바구니 수량 수정 요청
 */
export interface UpdateCartRequest {
  quantity: number;
}

/**
 * 장바구니 합치기 요청
 */
export interface MergeCartRequest {
  products: Array<{
    _id: number;
    quantity: number;
    size?: string;
    color?: string;
  }>;
  discount?: number;
}

