/**
 * 회원 관련 타입 정의
 */

import type { Notification } from './notification.js';

/**
 * 회원 정보 (기본 타입 - 모든 속성 포함)
 */
export interface User {
  _id: number;
  email: string;
  name: string;
  image?: string;
  phone?: string;
  address?: string;
  type: 'user' | 'seller';
  loginType?: string;
  extra?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  posts?: number;
  postViews?: number;
  bookmark?: {
    products: number;
    users: number;
    posts: number;
  };
  like?: {
    products: number;
    users: number;
    posts: number;
  };
  bookmarkedBy?: {
    users: number;
  };
  likedBy?: {
    users: number;
  };
  totalSales?: number;
  notifications?: Notification[];
}

/**
 * 사용자 기본 정보 (User에서 기본 필드만 선택)
 */
export type UserBasic = Pick<User, '_id' | 'email' | 'name' | 'image' | 'phone' | 'address' | 'type' | 'loginType' | 'extra' | 'createdAt' | 'updatedAt'>;

/**
 * 회원 목록 조회용 (notifications 제외)
 */
export interface UserListItem extends Omit<User, 'notifications'> {
  // notifications 필드는 목록 조회에서 제외됨
}

/**
 * 회원 상세 정보 (모든 속성 포함)
 */
export interface UserDetail extends User {
  // 상세 조회에서는 모든 속성 포함
}

/**
 * 회원 수정 응답 (상세 정보와 동일)
 */
export interface UserUpdateResponse extends UserDetail {
  // 수정 응답은 상세 조회와 동일한 구조
}

/**
 * 회원 가입 요청
 */
export interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
  type: 'user' | 'seller';
  image?: string;
  phone?: string;
  address?: string;
  extra?: {
    emailConfirm?: boolean;
    adminConfirm?: boolean;
    [key: string]: any;
  };
}

/**
 * 회원 정보 수정 요청
 */
export interface UpdateUserRequest {
  name?: string;
  image?: string;
  phone?: string;
  address?: string;
  extra?: Record<string, any>;
}

