/**
 * 파일 관련 타입 정의
 */

/**
 * 파일 업로드 응답
 */
export interface FileUploadResponse {
  ok: 1;
  item: {
    filename: string;
    url: string;
    size?: number;
    mimetype?: string;
  };
}

