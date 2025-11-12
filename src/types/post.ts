/**
 * 게시글 관련 타입 정의
 */

import type { UserBasic } from './user.js';
import type { Product } from './product.js';

/**
 * 게시글 작성자 정보 (UserBasic에서 필요한 필드만 선택)
 */
export type PostUser = Pick<UserBasic, '_id' | 'name' | 'email' | 'image' | 'type'>;

/**
 * 댓글 작성자 정보 (익명일 경우 _id 없음)
 */
export type ReplyUser = Pick<UserBasic, 'name' | 'email' | 'image'> & {
  _id?: number; // 익명일 경우 없음
};

/**
 * 게시글의 상품 정보 (Product에서 필요한 필드만 선택)
 */
export type PostProduct = Pick<Product, 'name'> & {
  image?: string; // mainImages[0]에서 추출
};

/**
 * 댓글 정보 (기본 타입 - 모든 속성 포함)
 */
export interface Reply {
  _id: number;
  user: ReplyUser;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 게시글 정보 (기본 타입 - 모든 속성 포함)
 */
export interface Post {
  _id: number;
  type: string;
  product_id?: number;
  seller_id?: number;
  user: PostUser;
  title: string;
  content: string;
  image?: string[];
  extra?: Record<string, any>;
  views: number;
  tag?: string[];
  private?: boolean;
  share?: number[];
  bookmarks?: number;
  likes?: number;
  myBookmarkId?: number;
  myLikeId?: number;
  repliesCount?: number;
  product?: PostProduct;
  replies?: Reply[];
  createdAt: string;
  updatedAt: string;
}

/**
 * 게시글 목록 조회용 (replies 제외)
 */
export interface PostListItem extends Omit<Post, 'replies'> {
  // replies 필드는 목록 조회에서 제외됨
}

/**
 * 게시글 상세 정보 (replies 포함)
 */
export interface PostDetail extends Post {
  // 상세 조회에서는 replies 포함
}

/**
 * 게시글 수정 응답 (상세 정보와 동일)
 */
export interface PostUpdateResponse extends PostDetail {
  // 수정 응답은 상세 조회와 동일한 구조
}

/**
 * 게시글 생성 요청
 */
export interface CreatePostRequest {
  type?: string;
  product_id?: number;
  title: string;
  content: string;
  image?: string[];
  extra?: Record<string, any>;
  tag?: string[];
  private?: boolean;
  share?: number[];
}

/**
 * 게시글 수정 요청
 */
export interface UpdatePostRequest {
  title?: string;
  content?: string;
  image?: string[];
  extra?: Record<string, any>;
  tag?: string[];
  private?: boolean;
  share?: number[];
}

/**
 * 댓글 생성 요청
 */
export interface CreateReplyRequest {
  comment: string;
}

/**
 * 댓글 수정 요청
 */
export interface UpdateReplyRequest {
  comment: string;
}

