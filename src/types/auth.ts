/**
 * 인증 관련 타입 정의
 */

import type { User } from './user.js';

/**
 * 로그인 요청
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * 로그인 응답
 */
export interface LoginResponse {
  ok: 1;
  item: {
    user: User;
    accessToken: string;
    refreshToken?: string;
  };
}

/**
 * JWT 토큰 페이로드
 */
export interface JWTPayload {
  _id: number;
  email: string;
  type: 'user' | 'seller';
  iat?: number;
  exp?: number;
}

/**
 * 토큰 갱신 요청
 */
export interface RefreshTokenRequest {
  refreshToken: string;
}

/**
 * 토큰 갱신 응답
 */
export interface RefreshTokenResponse {
  ok: 1;
  item: {
    accessToken: string;
    refreshToken?: string;
  };
}

