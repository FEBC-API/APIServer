/**
 * 알림 관련 타입 정의
 */

/**
 * 알림 채널 타입
 */
export type NotificationChannel = 'none' | 'websocket' | 'email' | 'sms' | 'slack' | 'discord';

/**
 * 알림 정보 (기본 타입 - 모든 속성 포함)
 */
export interface Notification {
  _id: number;
  target_id: number;
  channel: NotificationChannel;
  title: string;
  content: string;
  isRead: boolean;
  extra?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

/**
 * 알림 목록 조회용 (기본 타입과 동일)
 */
export interface NotificationListItem extends Notification {
  // 목록과 상세가 동일한 구조
}

/**
 * 알림 상세 정보 (기본 타입과 동일)
 */
export interface NotificationDetail extends Notification {
  // 목록과 상세가 동일한 구조
}

/**
 * 알림 생성 요청
 */
export interface CreateNotificationRequest {
  target_id: number;
  channel?: NotificationChannel;
  title: string;
  content: string;
  extra?: Record<string, any>;
}

