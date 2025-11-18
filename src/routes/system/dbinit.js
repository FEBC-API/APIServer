import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import logger from '#utils/logger.js';
import { getClientId, getDb } from '#utils/dbUtil.js';
import { cleanupFiles } from '#utils/uploadUtil.js';
import moment from 'moment-timezone';

const router = express.Router();

// multer 설정 (대용량 파일 업로드 최적화)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 파일 하나당 10MB
    files: 500, // 최대 500개 파일 허용
    fieldSize: 10 * 1024 * 1024 // 텍스트 필드 크기 제한
  }
});

// 전체 DB 초기화 (파일 정리 포함) - 분할 업로드 지원
router.post('/init', upload.any(), async function (req, res, next) {
  /*
    #swagger.tags = ['시스템']
    #swagger.summary  = 'DB 초기화'
    #swagger.description = `데이터베이스를 초기화합니다.<br>
      파일을 여러번 나눠서 업로드 해도 이전에 업로드한 파일은 삭제되지 않습니다.<br>
      먼저 초기화할 데이터와 업로드할 파일을 같이 전달해서 초기화 작업을 수행해 보고 응답받은 업로드 결과에 파일 수가 일치하지 않거나 업로드할 파일이 많아서 502번 에러가 발생하면 파일을 나눠서 먼저 업로드한 후 파일 업로드가 끝나면 initData만 전달해서 초기화를 수행하면 됩니다.<br>
      
      1. 파일 먼저 업로드: 파일을 여러번에 나누어서 업로드(한번에 업로드하는 크기는 대략 10MB 정도)<br>
      2. 데이터 초기화: 데이터의 이미지 경로를 클라우드 기반 url로 수정하고 데이터 초기화<br>
      3. 파일과 데이터 초기화: 파일을 먼저 업로드한 후 데이터 초기화<br><br>
      bruno나 postman으로 호출하세요.<br>
      body의 타입은 [Multipart Form]으로 지정하고 [Add File]을 클릭하여 파일을 추가할 수 있습니다.<br>
      Key: initData, Value: api/dbinit/서비스/data.json 파일을 추가하세요.(선택)<br>
      Key: attach, Value: api/dbinit/서비스/uploadFiles 폴더에 있는 파일들을 추가하세요.(선택)`
    
    #swagger.security = [{
      "Client ID": []
    }]
    
    #swagger.requestBody = {
      required: false,
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            properties: {
              initData: {
                type: "string",
                format: "binary",
                description: "JSON 형태의 초기 데이터 파일(선택, api/dbinit/team/data.json 파일)"
              },
              attach: {
                type: "string",
                format: "binary",
                description: "업로드할 파일들(선택, 여러 개 가능, initData에서 참조하는 파일들, api/dbinit/team/uploadFiles 폴더에 있는 파일들)"
              }
            }
          }
        }
      }
    }
    
    #swagger.responses[200] = {
      description: '성공',
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/dbInitRes" }
        }
      }
    }
    #swagger.responses[500] = {
      description: '서버 에러',
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/error500' }
        }
      }
    }
  */

  try {
    const clientId = getClientId(req);

    // FormData에서 데이터 추출
    const files = req.files || [];
    logger.debug('클라이언트에서 업로드된 파일 수:', files.length);
    
    // initData와 일반 파일 분리
    const dataJsFile = files.find(file => file.fieldname === 'initData');
    const uploadFiles = files.filter(file => file.fieldname !== 'initData');
    
    let initData = null;
    
    // initData 파싱 (있는 경우에만)
    if (dataJsFile) {
      try {
        const dataJsContent = dataJsFile.buffer.toString('utf8');
        initData = JSON.parse(dataJsContent);
        logger.info('initData 파싱 성공');
      } catch (parseError) {
        logger.error('initData 파싱 실패:', parseError);
        return res.status(400).json({
          ok: 0,
          message: 'initData를 파싱할 수 없습니다: ' + parseError.message
        });
      }
    }

    // 케이스 판별
    const hasInitData = !!initData;
    const hasFiles = uploadFiles.length > 0;
    
    logger.info(`=== 업로드 케이스 판별 ===`);
    logger.info(`initData 존재: ${hasInitData}`);
    logger.info(`업로드 파일 수: ${uploadFiles.length}개`);
    
    // 아무것도 없으면 에러
    if (!hasInitData && !hasFiles) {
      return res.status(400).json({
        ok: 0,
        message: 'initData 또는 업로드 파일 중 최소 하나는 필요합니다.'
      });
    }

    // 파일 내용과 크기를 객체로 변환
    const fileContents = {};
    const fileSizes = {};
    uploadFiles.forEach(file => {
      fileContents[file.originalname] = file.buffer;
      fileSizes[file.originalname] = file.buffer.length;
    });

    logger.info(`받은 업로드 파일 수: ${uploadFiles.length}개`);
    logger.info(`파일 내용 키: ${Object.keys(fileContents).join(', ')}`)

    const db = await getDb(clientId);
    
    let result = {};
    
    // 케이스별 처리
    if (!hasInitData && hasFiles) {
      // 케이스 1: 파일만 업로드 (해시 체크해서 중복 파일은 업로드하지 않고 원본 파일명이 다르다면 DB에 추가)
      logger.info('=== 케이스 1: 파일만 업로드 ===');
      result = await handleFilesOnlyUpload(uploadFiles, clientId, fileContents, fileSizes, db);
      
    } else if (hasInitData && !hasFiles) {
      // 케이스 2: initData만 있으면 DB 정보를 기반으로 initData의 파일 경로를 cloudinary로 수정하고 파일을 제외한 나머지 컬렉션 초기화
      logger.info('=== 케이스 2: initData만 업로드 ===');
      result = await handleInitDataOnlyUpload(initData, db);
      
    } else if (hasInitData && hasFiles) {
      // 케이스 3: initData와 파일이 같이 있으면 1번 작업 후 2번 작업
      logger.info('=== 케이스 3: initData + 파일 업로드 ===');
      result = await handleBothInitDataAndFilesUpload(initData, uploadFiles, clientId, fileContents, fileSizes, db);
    }

    res.json(result);

  } catch (err) {
    logger.error('DB 초기화 실패:', err);
    next(err);
  }
});

// 케이스 1: 파일만 업로드 처리
async function handleFilesOnlyUpload(uploadFiles, clientId, fileContents, fileSizes, db) {
  logger.info('파일만 업로드 처리 시작');
  
  // 업로드된 파일 목록
  const uploadFileNames = Object.keys(fileContents);
  
  // 각 파일에 대해 중복 체크 후 업로드 또는 기존 파일 정보 사용
  const processedFiles = [];
  const skippedFiles = [];
  const newFiles = [];
  
  for (const filename of uploadFileNames) {
    const fileBuffer = fileContents[filename];
    const fileSize = fileSizes[filename] || 0;
    
    if (!fileBuffer || fileSize === 0) {
      logger.warn(`빈 파일 제외: ${filename}`);
      continue;
    }
    
    // 파일 해시 계산
    const fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex');
    
    // DB에서 동일한 해시와 파일명을 가진 파일 검색
    const exactMatch = await db.collection('file_uploads').findOne({
      file_hash: fileHash,
      filename: filename
    });
    
    if (exactMatch) {
      // 완전히 동일한 파일이면 스킵
      logger.info(`완전 동일 파일 스킵: ${filename} (해시: ${fileHash.substring(0, 8)}...)`);
      skippedFiles.push({
        filename: filename,
        reason: '동일한 해시와 파일명',
        existing_url: exactMatch.cloudinary_url
      });
      continue;
    }
    
    // 동일한 해시를 가진 다른 파일명의 파일 검색
    const sameHashFile = await db.collection('file_uploads').findOne({
      file_hash: fileHash
    });
    
    if (sameHashFile) {
      // 같은 내용이지만 다른 파일명 - 새 DB 레코드 생성하되 Cloudinary URL 재사용
      logger.info(`같은 내용 다른 파일명: ${filename} -> URL 재사용: ${sameHashFile.cloudinary_url}`);
      
      try {
        const newId = await db.nextSeq('file_uploads');
        await db.collection('file_uploads').insertOne({
          _id: newId,
          file_hash: fileHash,
          public_id: sameHashFile.public_id,
          cloudinary_url: sameHashFile.cloudinary_url,
          filename: filename,
          file_size: fileSize,
          createdAt: moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss'),
          updatedAt: moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss')
        });
        
        processedFiles.push({
          filename: filename,
          cloudinary_url: sameHashFile.cloudinary_url,
          method: 'url_reused'
        });
        
        // logger.info(`파일 정보 저장 완료 (URL 재사용): ${filename}`);
      } catch (error) {
        logger.error(`파일 정보 저장 실패 (URL 재사용): ${filename}`, error);
      }
    } else {
      // 완전히 새로운 파일 - Cloudinary 업로드 필요
      newFiles.push({
        filename: filename,
        fileBuffer: fileBuffer,
        fileHash: fileHash,
        fileSize: fileSize
      });
    }
  }
  
  // 새로운 파일들을 Cloudinary에 업로드
  if (newFiles.length > 0) {
    logger.info(`새 파일 업로드 시작: ${newFiles.length}개`);
    
    try {
      // uploadMultipleFiles 함수 사용
      const { uploadMultipleFiles } = await import('#utils/uploadUtil.js');
      const uploadResult = await uploadMultipleFiles(newFiles, clientId);
      
      // 업로드 성공한 파일들을 DB에 저장
      for (const file of uploadResult.successful) {
        try {
          const newId = await db.nextSeq('file_uploads');
          await db.collection('file_uploads').insertOne({
            _id: newId,
            file_hash: file.fileHash,
            public_id: file.cloudinaryInfo.public_id,
            cloudinary_url: file.cloudinaryInfo.secure_url,
            filename: file.filename,
            file_size: fileSizes[file.filename] || 0,
            createdAt: moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss'),
            updatedAt: moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss')
          });
          
          processedFiles.push({
            filename: file.filename,
            cloudinary_url: file.cloudinaryInfo.secure_url,
            method: 'newly_uploaded'
          });
          
          // logger.info(`새 파일 DB 저장 완료: ${file.filename}`);
        } catch (dbError) {
          logger.error(`새 파일 DB 저장 실패: ${file.filename}`, dbError);
        }
      }
      
      if (uploadResult.failed.length > 0) {
        logger.warn(`업로드 실패한 파일들: ${uploadResult.failed.length}개`);
        uploadResult.failed.forEach(fail => {
          logger.error(`  - ${fail.filename}: ${fail.error.message || fail.error}`);
        });
      }
      
      // logger.info(`새 파일 업로드 완료: 성공 ${uploadResult.successful.length}개, 실패 ${uploadResult.failed.length}개`);
    } catch (error) {
      logger.error('새 파일 업로드 실패:', error);
    }
  }

  return {
    ok: 1,
    message: '파일 업로드 처리 완료',
    files: {
      count: processedFiles.length + skippedFiles.length,
      details: [
        ...processedFiles.map(file => ({
          filename: file.filename,
          url: file.cloudinary_url
        })),
        ...skippedFiles.map(file => ({
          filename: file.filename,
          url: file.existing_url
        }))
      ]
    }
  };
}

// 케이스 2: initData만 업로드 처리
async function handleInitDataOnlyUpload(initData, db) {
  logger.info('initData만 업로드 처리 시작');
  
  // 기존 DB에서 file_uploads 정보 가져오기
  const existingFiles = await db.collection('file_uploads').find({}).toArray();
  
  // initData의 파일 경로를 기존 DB의 cloudinary URL로 교체
  const updatedInitData = replacePathsWithCloudinaryUrlsFromDB(initData, existingFiles);
  
  // 기존 데이터 삭제 (file_uploads 제외)
  const collections = await db.listCollections().toArray();
  const dataCollections = collections.filter(col => col.name !== 'file_uploads');

  for (const collection of dataCollections) {
    try {
      await db.dropCollection(collection.name);
    } catch (error) {
      logger.warn(`컬렉션 삭제 실패: ${collection.name}`, error.message);
    }
  }

  // 새 데이터 삽입 (file_uploads 제외)
  let totalInserted = 0;
  const insertStats = {};

  for (const [collectionName, documents] of Object.entries(updatedInitData)) {
    if (collectionName === 'file_uploads' || !documents || !Array.isArray(documents) || documents.length === 0) {
      continue;
    }

    try {
      const documentsWithNewIds = [];
      for(let i=0; i<documents.length; i++){
        const doc = documents[i];
        const newId = await db.nextSeq(collectionName);
        documentsWithNewIds.push({
          _id: newId,
          createdAt: moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss'),
          updatedAt: moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss'),
          ...doc,
        });

        // 하위 데이터 중 replies 배열의 경우 각 데이터에 _id 추가
        if (doc.replies && Array.isArray(doc.replies)) {
          for(let j=0; j<doc.replies.length; j++){
            const newId = await db.nextSeq('reply');
            const reply = doc.replies[j];
            reply._id = newId;
            reply.createdAt = moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss');
            reply.updatedAt = moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss');
          }
        }
      }
      
      // 컬렉션이 새로 생성되므로 setSeq로 다음 ID 설정 (file_uploads 제외)
      // if (collectionName !== 'file_uploads') {
      //   db.setSeq(collectionName, documents.length + 1);
      // }

      const result = await db.collection(collectionName).insertMany(documentsWithNewIds);
      const insertedCount = result.insertedCount;
      totalInserted += insertedCount;
      insertStats[collectionName] = insertedCount;

      logger.info(`${collectionName}: ${insertedCount}건 등록 완료`);
    } catch (error) {
      logger.error(`${collectionName} 등록 실패:`, error);
      insertStats[collectionName] = 0;
    }
  }

  // file_uploads의 seq를 현재 최대 ID 기준으로 설정
  try {
    const maxIdDoc = await db.collection('file_uploads').findOne({}, { sort: { _id: -1 } });
    const currentMaxId = maxIdDoc ? maxIdDoc._id : 0;
    db.setSeq('file_uploads', currentMaxId + 1);
    logger.info(`file_uploads seq를 ${currentMaxId + 1}로 설정`);
  } catch (error) {
    logger.warn('file_uploads seq 설정 실패:', error.message);
  }

  return {
    ok: 1,
    message: 'initData 기반 DB 초기화 완료 (파일 제외)',
    data: {
      insertedData: totalInserted,
      details: insertStats
    }
  };
}

// 케이스 3: initData와 파일 모두 업로드 처리
async function handleBothInitDataAndFilesUpload(initData, uploadFiles, clientId, fileContents, fileSizes, db) {
  logger.info('initData + 파일 업로드 처리 시작');
  
  // 1단계: 파일 업로드 처리
  const uploadFileNames = Object.keys(fileContents);

  logger.info(`업로드 파일: ${uploadFileNames.length}개`);

  // 파일 정리 및 업로드 - 모든 업로드 파일 처리 (비교 제한 없음)
  let finalFiles = [];
  let fileUploadsData = [];
  
  if (uploadFileNames.length > 0) {
    // 모든 업로드된 파일을 처리 (initData 참조 여부와 관계없이)
    const cleanupResult = await cleanupFiles(uploadFileNames, clientId, fileContents, db);
    finalFiles = cleanupResult.files;
    fileUploadsData = cleanupResult.dbData;
  }

  // 2단계: initData 처리 - 기존 DB 파일 + 새 업로드 파일 모두로 URL 교체
  // 먼저 기존 DB의 모든 파일 정보 가져오기
  const existingFiles = await db.collection('file_uploads').find({}).toArray();
  
  // 기존 DB 파일들로 먼저 URL 교체
  let updatedInitData = replacePathsWithCloudinaryUrlsFromDB(initData, existingFiles);
  
  // 새로 업로드한 파일들로 추가 URL 교체 (덮어쓰기)
  updatedInitData = replacePathsWithCloudinaryUrls(updatedInitData, finalFiles);

  // file_uploads 데이터를 initData에 추가 (cleanupFiles에서 새 파일만 처리됨)
  logger.info(`fileUploadsData 길이: ${fileUploadsData.length}`);
  if (fileUploadsData.length > 0) {
    logger.info(`fileUploadsData 파일들: ${fileUploadsData.map(f => f.filename).join(', ')}`);
    const updatedFileUploadsData = fileUploadsData.map(fileInfo => {
      const fileSize = fileSizes[fileInfo.filename] || 0;
      return {
        ...fileInfo,
        file_size: fileSize
      };
    });

    updatedInitData.file_uploads = updatedFileUploadsData;
    logger.info(`updatedInitData.file_uploads 설정 완료: ${updatedFileUploadsData.length}개`);
  } else {
    logger.info('fileUploadsData가 비어있어서 DB에 추가할 파일이 없음');
  }

  // 기존 데이터 삭제 (file_uploads 컬렉션 제외)
  const collections = await db.listCollections().toArray();

  for (const collection of collections) {
    if (collection.name !== 'file_uploads') {
      try {
        await db.dropCollection(collection.name);
      } catch (error) {
        logger.warn(`컬렉션 삭제 실패: ${collection.name}`, error.message);
      }
    }
  }

  // 새 데이터 삽입 (file_uploads는 기존 데이터에 추가)
  let totalInserted = 0;
  const insertStats = {};

  // file_uploads의 seq를 현재 최대 ID 기준으로 설정 (저장 작업 전에)
  try {
    const maxIdDoc = await db.collection('file_uploads').findOne({}, { sort: { _id: -1 } });
    const currentMaxId = maxIdDoc ? maxIdDoc._id : 0;
    db.setSeq('file_uploads', currentMaxId + 1);
    logger.info(`file_uploads seq를 ${currentMaxId + 1}로 설정`);
  } catch (error) {
    logger.warn('file_uploads seq 설정 실패:', error.message);
  }

  for (const [collectionName, documents] of Object.entries(updatedInitData)) {
    logger.info(`처리 중인 컬렉션: ${collectionName}, 문서 수: ${documents ? documents.length : 0}`);
    
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      logger.info(`${collectionName} 스킵: 문서가 없음`);
      continue;
    }

    try {
      const documentsWithNewIds = [];
      for(let i=0; i<documents.length; i++){
        const doc = documents[i];
        
        if (collectionName === 'file_uploads') {
          // file_uploads는 기존 컬렉션에 추가
          logger.info(`file_uploads 문서 처리 중: ${doc.filename}`);
          const newId = await db.nextSeq('file_uploads');
          documentsWithNewIds.push({
            _id: newId,
            createdAt: moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss'),
            updatedAt: moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss'),
            ...doc,
          });
        } else {
          // 다른 컬렉션들은 새로 생성
          const newId = await db.nextSeq(collectionName);
          documentsWithNewIds.push({
            _id: newId,
            createdAt: moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss'),
            updatedAt: moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss'),
            ...doc,
          });

          // 하위 데이터 중 replies 배열의 경우 각 데이터에 _id 추가
          if (doc.replies && Array.isArray(doc.replies)) {
            for(let j=0; j<doc.replies.length; j++){
              const reply = doc.replies[j];
              const newId = await db.nextSeq('reply');
              reply._id = newId;
              reply.createdAt = moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss');
              reply.updatedAt = moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss');
            }
          }
        }
      }
      
      // 새 컬렉션은 setSeq로 다음 ID 설정
      // if (collectionName !== 'file_uploads') {
      //   db.setSeq(collectionName, documents.length + 1);
      // }

      const result = await db.collection(collectionName).insertMany(documentsWithNewIds);
      const insertedCount = result.insertedCount;
      totalInserted += insertedCount;
      insertStats[collectionName] = insertedCount;

      if (collectionName === 'file_uploads') {
        logger.info(`${collectionName}: ${insertedCount}건 추가 완료 (기존 데이터 유지)`);
      } else {
        logger.info(`${collectionName}: ${insertedCount}건 등록 완료`);
      }
    } catch (error) {
      logger.error(`${collectionName} 등록 실패:`, error);
      insertStats[collectionName] = 0;
    }
  }

  return {
    ok: 1,
    message: 'initData + 파일 업로드 완료',
    data: {
      insertedData: totalInserted,
      details: insertStats
    },
    files: {
      count: finalFiles.length,
      details: finalFiles.map(file => ({
        filename: file.filename,
        url: file.cloudinary_url
      }))
    }
  };
}

// extractUploadFilePaths 함수 제거됨 - 파일 비교 로직 제거로 더 이상 불필요

// data.js의 경로를 실제 Cloudinary URL로 교체
function replacePathsWithCloudinaryUrls(data, files) {
  const urlMap = {};
  files.forEach(file => {
    urlMap[file.filename] = file.cloudinary_url;
  });

  function traverse(obj) {
    if (typeof obj === 'string') {
      if (obj.startsWith('uploadFiles/')) {
        const filename = obj.replace('uploadFiles/', '');
        const cloudinaryUrl = urlMap[filename];
        if (cloudinaryUrl) {
          return cloudinaryUrl;
        }
      }
      return obj;
    } else if (Array.isArray(obj)) {
      return obj.map(item => traverse(item));
    } else if (obj && typeof obj === 'object') {
      const newObj = {};
      for (const [key, value] of Object.entries(obj)) {
        newObj[key] = traverse(value);
      }
      return newObj;
    }
    return obj;
  }

  return traverse(data);
}

// DB에 있는 파일 정보를 기반으로 경로를 Cloudinary URL로 교체
function replacePathsWithCloudinaryUrlsFromDB(data, existingFiles) {
  const urlMap = {};
  existingFiles.forEach(file => {
    if (file.filename && file.cloudinary_url) {
      urlMap[file.filename] = file.cloudinary_url;
    }
  });

  function traverse(obj) {
    if (typeof obj === 'string') {
      if (obj.startsWith('uploadFiles/')) {
        const filename = obj.replace('uploadFiles/', '');
        const cloudinaryUrl = urlMap[filename];
        if (cloudinaryUrl) {
          return cloudinaryUrl;
        }
      }
      return obj;
    } else if (Array.isArray(obj)) {
      return obj.map(item => traverse(item));
    } else if (obj && typeof obj === 'object') {
      const newObj = {};
      for (const [key, value] of Object.entries(obj)) {
        newObj[key] = traverse(value);
      }
      return newObj;
    }
    return obj;
  }

  return traverse(data);
}

export default router;