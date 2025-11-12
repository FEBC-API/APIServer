/**
 * 이메일 관련 타입 정의
 */

/**
 * 일반 이메일 전송 요청
 */
export interface SendEmailRequest {
  to: string;
  serviceName: string;
  subject: string;
  content: string;
}

/**
 * 인증 이메일 전송 요청
 */
export interface SendEmailVerifyRequest {
  to: string;
  serviceName: string;
  serviceUrl: string;
  subject?: string;
  content?: string;
  expiresIn?: string; // 예: "1h", "30m", "10s", "2d"
}

/**
 * 이메일 전송 응답
 */
export interface SendEmailResponse {
  ok: 1;
  item: {
    accepted: string[];
    rejected: string[];
    ehlo?: string[];
    envelopeTime?: number;
    messageTime?: number;
    messageSize?: number;
    response?: string;
    envelope?: {
      from: string;
      to: string[];
    };
    messageId?: string;
  };
}

