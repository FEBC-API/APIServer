/**
 * 북마크/좋아요 관련 타입 정의
 */

import type { ProductListItem } from './product.js';
import type { PostListItem } from './post.js';
import type { UserListItem } from './user.js';

/**
 * 북마크/좋아요 타입
 */
export type BookmarkType = 'product' | 'post' | 'user';

/**
 * 북마크/좋아요 정보 (기본 타입 - 모든 속성 포함)
 */
export interface Bookmark {
  _id: number;
  user_id: number;
  target_id: number;
  type: BookmarkType;
  is_like?: boolean;
  memo?: string;
  extra?: Record<string, any>;
  createdAt: string;
  product?: ProductListItem;
  post?: PostListItem;
  user?: UserListItem;
}

/**
 * 북마크/좋아요 목록 조회용 (기본 타입과 동일)
 */
export interface BookmarkListItem extends Bookmark {
  // 목록과 상세가 동일한 구조
}

/**
 * 북마크/좋아요 상세 정보 (기본 타입과 동일)
 */
export interface BookmarkDetail extends Bookmark {
  // 목록과 상세가 동일한 구조
}

/**
 * 북마크/좋아요 생성 요청
 */
export interface CreateBookmarkRequest {
  target_id: number;
  type: BookmarkType;
  is_like?: boolean;
  memo?: string;
  extra?: Record<string, any>;
}

/**
 * 북마크/좋아요 목록 조회 응답
 */
export interface BookmarkListResponse {
  byUser: Array<{
    _id: number;
    is_like?: boolean;
    memo?: string;
    extra?: Record<string, any>;
    createdAt: string;
  }>;
  user: BookmarkListItem[];
  product: BookmarkListItem[];
  post: BookmarkListItem[];
}

