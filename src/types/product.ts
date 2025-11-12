/**
 * 상품 관련 타입 정의
 */

import type { UserBasic } from './user.js';

/**
 * 상품의 판매자 정보 (UserBasic에서 필요한 필드만 선택)
 */
export type ProductSeller = Pick<UserBasic, '_id' | 'name' | 'email' | 'image' | 'type'>;

/**
 * 상품 정보 (기본 타입)
 */
export interface Product {
  _id: number;
  seller_id: number;
  seller?: ProductSeller;
  name: string;
  price: number;
  shippingFees: number;
  quantity: number;
  buyQuantity: number;
  mainImages: string[];
  content?: string;
  extra?: {
    depth?: number;
    parent?: number;
    isNew?: boolean;
    isBest?: boolean;
    category?: string;
    tags?: string[];
    [key: string]: any;
  };
  show?: boolean;
  active?: boolean;
  replies?: number; // 후기 수
  rating?: number; // 평균 평점
  bookmarks?: number; // 북마크 수
  likes?: number; // 좋아요 수
  myBookmarkId?: number; // 내가 북마크한 경우 북마크 ID
  myLikeId?: number; // 내가 좋아요한 경우 좋아요 ID
  options?: number; // 옵션 상품 수
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 상품 목록 조회용 (content 제외)
 */
export interface ProductListItem extends Omit<Product, 'content'> {
  // content 필드는 목록 조회에서 제외됨
}

/**
 * 상품 상세 정보 (content 포함, options는 상품 목록)
 */
export interface ProductDetail extends Omit<Product, 'options'> {
  options?: ProductListItem[]; // 옵션 상품 목록 (목록 형태)
}

/**
 * 상품 수정 응답 (상세 정보와 동일)
 */
export interface ProductUpdateResponse extends ProductDetail {
  // 수정 응답은 상세 조회와 동일한 구조
}

/**
 * 상품 검색 요청
 */
export interface ProductSearchRequest {
  minPrice?: number;
  maxPrice?: number;
  minShippingFees?: number;
  maxShippingFees?: number;
  keyword?: string;
  seller_id?: number;
  custom?: string; // JSON string
  page?: number;
  limit?: number;
  sort?: string; // JSON string
  showSoldOut?: boolean;
}