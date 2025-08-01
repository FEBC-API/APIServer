import path from 'node:path';
import crypto from 'crypto';
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
        
        logger.info(`새 파일 업로드 완료: ${filename} -> ${result.secure_url}`);
        
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
        
        logger.info(`파일 업로드 완료 (중복검사 없음): ${filename} -> ${result.secure_url}`);
        
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
    // cloudinary에서 파일 삭제
    if (file.public_id) {
      cloudinary.uploader.destroy(file.public_id, (error) => {
        cb(error);
      });
    } else {
      cb();
    }
  }
}

// 파일 삭제 유틸리티 함수들
export async function deleteCloudinaryFile(publicId) {
  try {
    await cloudinary.uploader.destroy(publicId);
    logger.info(`Cloudinary 파일 삭제 성공: ${publicId}`);
  } catch (error) {
    logger.error(`Cloudinary 파일 삭제 실패: ${publicId}`, error);
    throw error;
  }
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
    
    // Cloudinary에서 파일 삭제
    try {
      if (fileInfo.public_id) {
        await deleteCloudinaryFile(fileInfo.public_id);
      }
    } catch (cloudinaryError) {
      logger.warn(`Cloudinary 파일 삭제 실패하였지만 DB에서는 제거합니다: ${cloudinaryError.message}`);
    }
    
    // DB에서 파일 정보 삭제
    await db.collection('file_uploads').deleteOne({
      filename: filename
    });
    
    return { success: true, filename };
  } catch (error) {
    logger.error(`파일 삭제 실패: ${filename}`, error);
    throw error;
  }
}

export async function cleanupFiles(keepFiles, clientId, fileContents = {}) {
  try {
         // 1. Cloudinary에서 모든 파일 조회 (메타데이터 포함)
     const cloudinaryFiles = await cloudinary.api.resources({
       type: 'upload',
       prefix: `${clientId}/`,
       max_results: 500,
       fields: 'public_id,secure_url,context,metadata,original_filename'
     });
    
    logger.info(`Cloudinary 실제 파일 수: ${cloudinaryFiles.resources.length}개`);
    
         // 2. Cloudinary 파일들의 해시 정보 수집 (해시별로 모든 파일 저장)
     const cloudinaryFileMap = new Map(); // 해시 -> 파일 배열
     
          cloudinaryFiles.resources.forEach(resource => {
        logger.trace('resource', resource);
        
                // 다양한 방법으로 메타데이터 추출 시도
         const originalName = resource.context?.custom?.original_name;
         const fileHash = resource.context?.custom?.file_hash;
        
        logger.info(`Cloudinary 파일 처리: ${originalName} (해시: ${fileHash ? fileHash.substring(0, 8) + '...' : '없음'})`);
       
       // 해시 기반 맵 (해시가 있는 경우만)
       if (fileHash) {
         if (!cloudinaryFileMap.has(fileHash)) {
           cloudinaryFileMap.set(fileHash, []);
         }
         cloudinaryFileMap.get(fileHash).push({
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
      if (fileBuffer) {
        const fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex');
        
        // Cloudinary에 같은 해시의 파일이 있는지 확인
        const existingCloudinaryFiles = cloudinaryFileMap.get(fileHash);
        logger.info(`파일 ${keepFile} (해시: ${fileHash.substring(0, 8)}...) 검사 중...`);
        
                 if (existingCloudinaryFiles && existingCloudinaryFiles.length > 0) {
           logger.info(`  같은 해시의 파일 ${existingCloudinaryFiles.length}개 발견:`);
           existingCloudinaryFiles.forEach(file => {
             logger.info(`    - ${file.original_name} -> ${file.public_id}`);
           });
           
           // 같은 해시가 있으면 첫 번째 파일을 사용 (업로드 제외, DB에는 저장)
           const firstFile = existingCloudinaryFiles[0];
           filesToKeep.push({
             filename: keepFile,
             fileHash: fileHash,
             cloudinaryInfo: firstFile
           });
           keepFileHashes.add(fileHash);
           logger.info(`  ✅ 기존 파일 유지: ${keepFile} -> ${firstFile.public_id} (해시 기반, 업로드 제외)`);
         } else {
           // 해시가 다르면 새 파일로 업로드
           filesToUpload.push({
             filename: keepFile,
             fileBuffer: fileBuffer,
             fileHash: fileHash
           });
           logger.info(`  ❌ 새 파일 업로드 예정: ${keepFile} - 새로운 파일`);
         }
      } else {
        logger.warn(`파일 내용이 없음: ${keepFile}`);
      }
    }
    
         // 4. Cloudinary에서 삭제할 파일들 찾기 (해시값만으로 비교)
     const filesToDelete = [];
          cloudinaryFiles.resources.forEach(resource => {
        const fileHash = resource.context?.custom?.file_hash || resource.context?.file_hash;
       
        if (fileHash) {
          // 해당 해시의 파일이 유지 목록에 있는지 확인
          const keepFile = keepFiles.find(file => {
            const fileBuffer = fileContents[file];
            if (fileBuffer) {
              const hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
              return hash === fileHash;
            }
            return false;
          });
         
         // 유지 목록에 없으면 삭제 대상
         if (!keepFile) {
           filesToDelete.push(resource);
         }
       } else {
         // 해시가 없는 파일은 삭제 대상 (안전을 위해)
         logger.warn(`해시가 없는 파일 삭제: ${resource.public_id}`);
         filesToDelete.push(resource);
       }
     });
    
    // 5. 불필요한 파일들 삭제
    for (const resource of filesToDelete) {
      try {
        await deleteCloudinaryFile(resource.public_id);
        logger.info(`Cloudinary 파일 삭제: ${resource.public_id}`);
      } catch (deleteError) {
        logger.error(`Cloudinary 파일 삭제 실패: ${resource.public_id}`, deleteError);
      }
    }
    
    // 6. 새로운 파일들 업로드
    const uploadedFiles = [];
    for (const fileInfo of filesToUpload) {
      try {
        // Buffer를 스트림으로 변환하여 업로드
        const { Readable } = await import('stream');
        const bufferStream = new Readable();
        bufferStream.push(fileInfo.fileBuffer);
        bufferStream.push(null);
        
        // Promise로 감싸서 비동기 처리
        const uploadPromise = new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              public_id: shortid.generate(),
              folder: clientId,
              resource_type: 'auto',
              context: {
                original_name: fileInfo.filename,
                uploaded_by: clientId,
                upload_date: new Date().toISOString(),
                file_hash: fileInfo.fileHash
              }
            },
            (error, result) => {
              if (error) {
                logger.error(`새 파일 업로드 실패: ${fileInfo.filename}`, error);
                reject(error);
                return;
              }
              
              const uploadedFile = {
                filename: fileInfo.filename,
                fileHash: fileInfo.fileHash,
                cloudinaryInfo: {
                  public_id: result.public_id,
                  secure_url: result.secure_url,
                  original_name: fileInfo.filename
                }
              };
              
              uploadedFiles.push(uploadedFile);
              logger.info(`새 파일 업로드 완료: ${fileInfo.filename}`);
              resolve(uploadedFile);
            }
          );
          
          bufferStream.pipe(uploadStream);
        });
        
        await uploadPromise;
        
      } catch (uploadError) {
        logger.error(`새 파일 업로드 실패: ${fileInfo.filename}`, uploadError);
      }
    }
    
         // 7. 최종 파일 목록 생성 (유지된 파일 + 업로드된 파일)
     const finalFiles = [...filesToKeep, ...uploadedFiles];
     
     // 8. 응답용 파일 목록 생성
     const responseFiles = finalFiles.map(fileInfo => ({
       filename: fileInfo.filename,
       cloudinary_url: fileInfo.cloudinaryInfo.secure_url,
       public_id: fileInfo.cloudinaryInfo.public_id,
       file_hash: fileInfo.fileHash
     }));
     
           // 9. DB 저장용 데이터 생성
      const dbData = finalFiles.map(fileInfo => ({
        file_hash: fileInfo.fileHash,
        public_id: fileInfo.cloudinaryInfo.public_id,
        cloudinary_url: fileInfo.cloudinaryInfo.secure_url,
        filename: fileInfo.filename,
        file_size: 0, // 파일 크기는 알 수 없으므로 0으로 설정
        created_at: new Date()
      }));
    
    // 디버깅: 최종 결과 로그
    logger.info('=== 최종 파일 처리 결과 ===');
    logger.info(`유지된 파일: ${filesToKeep.length}개`);
    filesToKeep.forEach(file => {
      logger.info(`  유지: ${file.filename} -> ${file.cloudinaryInfo.public_id} (기존 파일)`);
    });
    
    logger.info(`새로 업로드된 파일: ${uploadedFiles.length}개`);
    uploadedFiles.forEach(file => {
      logger.info(`  업로드: ${file.filename} -> ${file.cloudinaryInfo.public_id} (새 파일)`);
    });
    
    logger.info(`최종 파일 목록: ${responseFiles.length}개`);
    responseFiles.forEach(file => {
      logger.info(`  ${file.filename} -> ${file.cloudinary_url}`);
    });
    
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