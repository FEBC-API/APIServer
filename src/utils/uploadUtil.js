import path from 'node:path';
import crypto from 'crypto';
import { Readable } from 'node:stream';
import { v2 as cloudinary } from 'cloudinary';
import shortid from 'shortid';
import logger from '#utils/logger.js';
import { getClientId, getDb } from '#utils/dbUtil.js';

// 파일 스트림에서 해시 생성
function generateFileHash(fileStream) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const chunks = [];

    fileStream.on('data', (chunk) => {
      hash.update(chunk);
      chunks.push(chunk);
    });

    fileStream.on('end', () => {
      resolve({
        hash: hash.digest('hex'),
        buffer: Buffer.concat(chunks)
      });
    });

    fileStream.on('error', reject);
  });
}

// DB에서 기존 파일 검색 (해시 + 원본명으로 정확한 중복 검사)
async function findExistingFile(fileHash, filename, clientId) {
  try {
    const db = await getDb(clientId);
    const result = await db.collection('file_uploads').findOne({
      file_hash: fileHash,
      filename
    });
    return result;
  } catch (error) {
    logger.error('기존 파일 검색 오류:', error);
    return null;
  }
}

// 같은 내용의 파일이 있는지 검색 (Cloudinary URL 재사용을 위해)
async function findSameContentFile(fileHash, clientId) {
  try {
    const db = await getDb(clientId);
    const result = await db.collection('file_uploads').findOne({
      file_hash: fileHash
    });
    return result;
  } catch (error) {
    logger.error('동일 내용 파일 검색 오류:', error);
    return null;
  }
}

// DB에 파일 정보 저장
async function saveFileInfo(fileData) {
  try {
    logger.info(`파일 정보 저장 시작: ${fileData.filename}`);
    const db = await getDb(fileData.clientId);

    // nextSeq 호출
    const nextId = await db.nextSeq('file_uploads');
    logger.info(`다음 시퀀스 ID: ${nextId}`);

    const document = {
      _id: nextId,
      file_hash: fileData.fileHash,
      public_id: fileData.publicId,
      cloudinary_url: fileData.cloudinaryUrl,
      filename: fileData.filename,
      file_size: fileData.fileSize,
      created_at: new Date()
    };

    logger.info(`저장할 문서:`, document);

    const result = await db.collection('file_uploads').insertOne(document);
    logger.info(`파일 정보 저장 완료: ${fileData.filename}, 삽입된 ID: ${result.insertedId}`);
  } catch (error) {
    logger.error('파일 정보 저장 오류:', error);
    throw error; // 에러를 다시 던져서 상위에서 처리할 수 있도록
  }
}

// Cloudinary Storage Engine for Multer
class CloudinaryStorage {
  constructor(options) {
    this.options = options;
  }

  async _handleFile(req, file, cb) {
    const clientId = getClientId(req);
    const ext = path.extname(file.originalname);
    const filename = Buffer.from(file.originalname, 'latin1').toString('utf8');

    try {
      // 1. 파일 해시 생성 시도
      const { hash: fileHash, buffer } = await generateFileHash(file.stream);

      // 2. 정확히 같은 파일 검색 (해시 + 원본명)
      const exactMatch = await findExistingFile(fileHash, filename, clientId);

      if (exactMatch) {
        // 3. 정확히 같은 파일이면 그대로 반환 (DB 저장도 안함)
        logger.info(`완전 동일 파일 재사용: ${fileHash.substring(0, 8)}... (${filename}) -> ${exactMatch.cloudinary_url}`);
        return cb(null, {
          filename: exactMatch.filename,
          contentType: file.mimetype,
          cloudinary_url: exactMatch.cloudinary_url,
          public_id: exactMatch.public_id,
          isExisting: true
        });
      }

      // 4. 같은 내용의 파일 검색 (Cloudinary URL 재사용을 위해)
      const sameContentFile = await findSameContentFile(fileHash, clientId);

      if (sameContentFile) {
        // 5. 같은 내용이지만 다른 원본명 -> 새 DB 레코드 생성하되 Cloudinary URL 재사용
        logger.info(`같은 내용 다른 원본명: ${fileHash.substring(0, 8)}... (${filename}) -> URL 재사용: ${sameContentFile.cloudinary_url}`);
        await this._saveFileWithExistingUrl(sameContentFile, fileHash, filename, file.mimetype, clientId, buffer.length, cb);
        return;
      }

      // 6. 완전히 새 파일 업로드
      await this._uploadNewFile(buffer, fileHash, filename, file.mimetype, clientId, ext, cb);

    } catch (hashError) {
      // 해시 생성이나 DB 검색 실패 시 기존 방식으로 fallback
      logger.warn(`중복 검사 실패, 기존 방식으로 업로드: ${hashError.message}`);
      await this._uploadWithoutDuplicateCheck(file, filename, clientId, ext, cb);
    }
  }

  async _saveFileWithExistingUrl(existingFile, fileHash, filename, mimetype, clientId, fileSize, cb) {
    try {
      // 원본명으로 DB에 레코드 저장 (Cloudinary URL은 기존 것 재사용)
      await saveFileInfo({
        fileHash,
        publicId: existingFile.public_id,
        cloudinaryUrl: existingFile.cloudinary_url,
        filename: filename,
        contentType: mimetype,
        clientId,
        fileSize
      });

      logger.info(`기존 URL 재사용하여 새 레코드 저장: ${filename} -> ${existingFile.cloudinary_url}`);

      cb(null, {
        filename: filename,
        contentType: mimetype,
        cloudinary_url: existingFile.cloudinary_url,
        public_id: existingFile.public_id,
        isExisting: false // 새로운 레코드이므로 false
      });

    } catch (dbError) {
      logger.warn(`기존 URL 재사용 중 DB 저장 실패: ${dbError.message}`);
      // DB 저장 실패해도 기존 파일 정보로 응답
      cb(null, {
        filename: existingFile.filename,
        contentType: mimetype,
        cloudinary_url: existingFile.cloudinary_url,
        public_id: existingFile.public_id,
        isExisting: true
      });
    }
  }

  async _uploadNewFile(buffer, fileHash, filename, mimetype, clientId, ext, cb) {
    const uniqueId = shortid.generate();

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: uniqueId,
        folder: clientId,
        resource_type: 'auto',
        context: {
          original_name: filename,
          uploaded_by: clientId,
          upload_date: new Date().toISOString(),
          file_hash: fileHash
        }
      },
      async (error, result) => {
        if (error) {
          return cb(error);
        }

        try {
          // DB에 파일 정보 저장 시도
          await saveFileInfo({
            fileHash,
            publicId: result.public_id,
            cloudinaryUrl: result.secure_url,
            filename: filename,
            contentType: mimetype,
            clientId,
            fileSize: buffer.length
          });
        } catch (dbError) {
          // DB 저장 실패해도 업로드 자체는 성공으로 처리
          logger.warn(`파일 정보 DB 저장 실패: ${dbError.message}`);
        }

        // logger.info(`새 파일 업로드 완료: ${filename} -> ${result.secure_url}`);

        cb(null, {
          filename: filename,
          contentType: mimetype,
          cloudinary_url: result.secure_url,
          public_id: result.public_id,
          isExisting: false
        });
      }
    );

    // Buffer를 스트림으로 변환하여 업로드
    const { Readable } = await import('stream');
    const bufferStream = new Readable();
    bufferStream.push(buffer);
    bufferStream.push(null);
    bufferStream.pipe(uploadStream);
  }

  async _uploadWithoutDuplicateCheck(file, filename, clientId, ext, cb) {
    const uniqueId = shortid.generate();

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: uniqueId,
        folder: clientId,
        resource_type: 'auto',
        context: {
          original_name: filename,
          uploaded_by: clientId,
          upload_date: new Date().toISOString(),
          fallback_reason: 'duplicate_check_failed'
        }
      },
      (error, result) => {
        if (error) {
          return cb(error);
        }

        // logger.info(`파일 업로드 완료 (중복검사 없음): ${filename} -> ${result.secure_url}`);

        cb(null, {
          filename: filename,
          contentType: file.mimetype,
          cloudinary_url: result.secure_url,
          public_id: result.public_id,
          isExisting: false
        });
      }
    );

    // 파일 스트림을 cloudinary로 파이프 (기존 방식)
    file.stream.pipe(uploadStream);
  }

  _removeFile(req, file, cb) {
    // Cloudinary 파일 삭제 기능 비활성화
    logger.info(`Cloudinary 파일 삭제 기능 비활성화: ${file.public_id || 'unknown'} (파일 유지)`);
    cb(); // 에러 없이 완료 처리
  }
}

// 파일 삭제 유틸리티 함수들 (비활성화)
export async function deleteCloudinaryFile(publicId) {
  // Cloudinary 파일 삭제 기능 비활성화
  logger.info(`Cloudinary 파일 삭제 기능 비활성화: ${publicId} (파일 유지)`);
  return; // 실제 삭제하지 않음
}

export async function getFilesList(clientId) {
  try {
    const db = await getDb(clientId);
    const files = await db.collection('file_uploads')
      .find({})
      .sort({ uploaded_at: -1 })
      .toArray();

    return files.map(file => ({
      name: file.filename,
      originalName: file.original_filename,
      url: file.cloudinary_url,
      hash: file.file_hash,
      uploadedAt: file.uploaded_at,
      size: file.file_size,
      publicId: file.public_id
    }));
  } catch (error) {
    logger.error('파일 목록 조회 실패:', error);
    throw error;
  }
}

export async function deleteFileCompletely(filename, clientId) {
  try {
    const db = await getDb(clientId);

    // DB에서 파일 정보 조회
    const fileInfo = await db.collection('file_uploads').findOne({
      filename: filename
    });

    if (!fileInfo) {
      throw new Error('파일을 찾을 수 없습니다.');
    }

    // Cloudinary 파일 삭제 기능 비활성화 - Cloudinary 파일은 유지
    logger.info(`Cloudinary 파일 삭제 기능 비활성화: ${fileInfo.public_id} (파일 유지)`);

    // DB에서 파일 정보만 삭제
    await db.collection('file_uploads').deleteOne({
      filename: filename
    });

    logger.info(`DB에서 파일 정보 삭제 완료 (Cloudinary 파일은 유지): ${filename}`);
    return { success: true, filename };
  } catch (error) {
    logger.error(`파일 삭제 실패: ${filename}`, error);
    throw error;
  }
}

// 여러 파일을 한번에 업로드하는 함수
export async function uploadMultipleFiles(files, clientId) {
  try {
    logger.info(`다중 파일 업로드 시작: ${files.length}개 파일`);

    // 빈 파일 필터링 및 디버깅
    const validFiles = files.filter(fileInfo => {
      const { filename, fileBuffer } = fileInfo;
      const bufferSize = fileBuffer ? fileBuffer.length : 0;
      
      if (!fileBuffer || bufferSize === 0) {
        logger.warn(`빈 파일 제외: ${filename}`);
        return false;
      }
      return true;
    });

    logger.info(`유효한 파일 수: ${validFiles.length}개 (총 ${files.length}개 중)`);

    // 모든 파일을 한번에 업로드
    const successfulUploads = [];
    const failedUploads = [];

    // 모든 파일을 한번에 업로드 (Cloudinary bulk upload)
    try {
      logger.info(`한번에 업로드 시작: ${validFiles.length}개 파일`);
      
      // 모든 파일의 버퍼를 하나로 합치기
      const allBuffers = validFiles.map(fileInfo => ({
        filename: fileInfo.filename,
        fileBuffer: fileInfo.fileBuffer,
        fileHash: fileInfo.fileHash
      }));
      
      // Cloudinary bulk upload 사용
      const uploadPromises = allBuffers.map(async (fileData) => {
        const { filename, fileBuffer, fileHash } = fileData;
        const uniqueId = shortid.generate();
        
        return new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              public_id: uniqueId,
              folder: clientId,
              resource_type: 'auto',
              context: {
                original_name: filename,
                uploaded_by: clientId,
                upload_date: new Date().toISOString(),
                file_hash: fileHash
              }
            },
            (error, result) => {
              if (error) {
                logger.error(`파일 업로드 실패: ${filename}`, error);
                reject({ filename, error });
                return;
              }

              // logger.info(`파일 업로드 완료: ${filename} -> ${result.secure_url}`);
              resolve({
                filename: filename,
                fileHash: fileHash,
                cloudinaryInfo: {
                  public_id: result.public_id,
                  secure_url: result.secure_url,
                  original_name: filename
                }
              });
            }
          );

          // Buffer를 스트림으로 변환하여 업로드
          const bufferStream = new Readable();
          bufferStream.push(fileBuffer);
          bufferStream.push(null);
          bufferStream.pipe(uploadStream);
        });
      });

      // 모든 파일을 동시에 업로드 (진짜 한번에!)
      const results = await Promise.allSettled(uploadPromises);
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successfulUploads.push(result.value);
          // logger.info(`파일 업로드 성공: ${validFiles[index].filename}`);
        } else {
          failedUploads.push({
            filename: validFiles[index].filename,
            error: result.reason.error || result.reason
          });
          logger.error(`파일 업로드 실패: ${validFiles[index].filename}`, result.reason);
        }
      });

    } catch (error) {
      logger.error('한번에 업로드 실패:', error);
      // 모든 파일을 실패로 처리
      validFiles.forEach(fileInfo => {
        failedUploads.push({
          filename: fileInfo.filename,
          error: error
        });
      });
    }

    logger.info(`다중 파일 업로드 완료: 성공 ${successfulUploads.length}개, 실패 ${failedUploads.length}개`);

    return {
      successful: successfulUploads,
      failed: failedUploads
    };
  } catch (error) {
    logger.error('다중 파일 업로드 실패:', error);
    throw error;
  }
}

// 파일 해시 계산 함수 (별도로 분리)
export function calculateFileHash(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

export async function cleanupFiles(keepFiles, clientId, fileContents = {}, db = null) {
  try {
    // 1. Cloudinary에서 모든 파일 조회 (메타데이터 포함)
    const cloudinaryFiles = await cloudinary.api.resources({
      type: 'upload',
      prefix: `${clientId}/`,
      max_results: 500,
      fields: 'public_id,secure_url,context,metadata,original_filename'
    });

    logger.info(`Cloudinary 실제 파일 수: ${cloudinaryFiles.resources.length}개`);

    // 2. Cloudinary 파일들의 해시 정보 수집 (해시별로 첫 번째 파일만 저장)
    const cloudinaryFileMap = new Map(); // 해시 -> 첫 번째 파일만
    const allCloudinaryFiles = []; // 모든 파일 정보 (삭제 판단용)

    cloudinaryFiles.resources.forEach(resource => {
      // 다양한 방법으로 메타데이터 추출 시도
      const originalName = resource.context?.custom?.original_name;
      const fileHash = resource.context?.custom?.file_hash;

      // 모든 파일 정보 저장 (삭제 판단용)
      allCloudinaryFiles.push({
        public_id: resource.public_id,
        secure_url: resource.secure_url,
        original_name: originalName,
        file_hash: fileHash,
        resource: resource
      });

      // 해시 기반 맵 (해시가 있는 경우만, 첫 번째 파일만 저장)
      if (fileHash && !cloudinaryFileMap.has(fileHash)) {
        cloudinaryFileMap.set(fileHash, {
          public_id: resource.public_id,
          secure_url: resource.secure_url,
          original_name: originalName,
          resource: resource
        });
      }
    });

    // 3. 요청된 파일들의 해시 계산 및 비교
    const keepFileHashes = new Set();
    const filesToUpload = [];
    const filesToKeep = [];

    for (const keepFile of keepFiles) {
      // 클라이언트에서 보낸 파일 내용 사용
      const fileBuffer = fileContents[keepFile];
      const bufferSize = fileBuffer ? fileBuffer.length : 0;
      // logger.info(`파일 ${keepFile} 버퍼 크기: ${bufferSize} bytes`);
      
      if (fileBuffer && bufferSize > 0) {
        const fileHash = calculateFileHash(fileBuffer);

        // Cloudinary에 같은 해시의 파일이 있는지 확인
        const existingCloudinaryFile = cloudinaryFileMap.get(fileHash);
        // logger.info(`파일 ${keepFile} (해시: ${fileHash.substring(0, 8)}...) 검사 중...`);

        if (existingCloudinaryFile) {
          // 같은 해시가 있으면 해당 파일을 사용 (업로드 제외, DB에는 저장)
          filesToKeep.push({
            filename: keepFile,
            fileHash: fileHash,
            cloudinaryInfo: existingCloudinaryFile
          });
          keepFileHashes.add(fileHash);
          // logger.info(`  ✅ 기존 파일 유지: ${keepFile} -> ${existingCloudinaryFile.public_id} (해시 기반, 업로드 제외)`);
        } else {
          // 해시가 다르면 새 파일로 업로드
          filesToUpload.push({
            filename: keepFile,
            fileBuffer: fileBuffer,
            fileHash: fileHash
          });
          // logger.info(`  ❌ 새 파일 업로드 예정: ${keepFile} - 새로운 파일`);
        }
      } else {
        logger.warn(`파일 내용이 없음: ${keepFile}`);
      }
    }

    // 4. 파일 삭제 기능 제거 - Cloudinary 파일은 삭제하지 않음
    logger.info(`Cloudinary 파일 삭제 기능 비활성화 - 기존 파일들 유지`);

    // 5. 새로운 파일들 한번에 업로드 (병렬 처리)
    let uploadedFiles = [];
    if (filesToUpload.length > 0) {
      // logger.info(`새 파일들 한번에 업로드 시작: ${filesToUpload.length}개`);
      
      const uploadResult = await uploadMultipleFiles(filesToUpload, clientId);
      uploadedFiles = uploadResult.successful;

      if (uploadResult.failed.length > 0) {
        logger.warn(`업로드 실패한 파일들: ${uploadResult.failed.length}개`);
        uploadResult.failed.forEach(fail => {
          logger.error(`  - ${fail.filename}: ${fail.error.message}`);
        });
      }
    }

    // 6. 최종 파일 목록 생성 (유지된 파일 + 업로드된 파일)
    const finalFiles = [...filesToKeep, ...uploadedFiles];

    // 7. 응답용 파일 목록 생성
    const responseFiles = finalFiles.map(fileInfo => ({
      filename: fileInfo.filename,
      cloudinary_url: fileInfo.cloudinaryInfo.secure_url,
      public_id: fileInfo.cloudinaryInfo.public_id,
      file_hash: fileInfo.fileHash
    }));

    // 8. DB 저장용 데이터 생성 (완전 동일 파일만 제외)
    let dbData = [];
    
    if (db) {
      // DB가 제공된 경우 완전 동일 파일(해시 + 파일명)만 제외
      for (const fileInfo of finalFiles) {
        // DB에서 동일한 해시와 파일명을 가진 파일 검색
        const exactMatch = await db.collection('file_uploads').findOne({
          file_hash: fileInfo.fileHash,
          filename: fileInfo.filename
        });
        
        if (exactMatch) {
          // 완전히 동일한 파일이면 DB 추가에서 제외
          logger.info(`완전 동일 파일 DB 추가 제외: ${fileInfo.filename} (해시: ${fileInfo.fileHash.substring(0, 8)}...)`);
          continue;
        }
        
        // 완전 동일하지 않으면 DB 추가 (같은 해시, 다른 파일명 포함)
        dbData.push({
          file_hash: fileInfo.fileHash,
          public_id: fileInfo.cloudinaryInfo.public_id,
          cloudinary_url: fileInfo.cloudinaryInfo.secure_url,
          filename: fileInfo.filename,
          file_size: 0, // 파일 크기는 알 수 없으므로 0으로 설정
          created_at: new Date()
        });
      }
    } else {
      // DB가 제공되지 않은 경우 기존 로직 (모든 파일 포함)
      dbData = finalFiles.map(fileInfo => ({
        file_hash: fileInfo.fileHash,
        public_id: fileInfo.cloudinaryInfo.public_id,
        cloudinary_url: fileInfo.cloudinaryInfo.secure_url,
        filename: fileInfo.filename,
        file_size: 0, // 파일 크기는 알 수 없으므로 0으로 설정
        created_at: new Date()
      }));
    }

    // 간단한 요약 로그 출력
    logger.info(`파일 처리 완료: 유지 ${filesToKeep.length}개, 업로드 ${uploadedFiles.length}개`);

    return {
      files: responseFiles,
      dbData: dbData
    };
  } catch (error) {
    logger.error('파일 일괄 정리 실패:', error);
    throw error;
  }
}

export default CloudinaryStorage;