import express from 'express';
import multer from 'multer';
import logger from '#utils/logger.js';
import { getClientId, getDb } from '#utils/dbUtil.js';
import { cleanupFiles } from '#utils/uploadUtil.js';
import moment from 'moment-timezone';

const router = express.Router();

// multer 설정
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  }
});

// 전체 DB 초기화 (파일 정리 포함)
router.post('/init', upload.any(), async function (req, res, next) {
  /*
    #swagger.tags = ['시스템']
    #swagger.summary  = 'DB 전체 초기화'
    #swagger.description = `데이터베이스를 완전히 초기화하고 파일 정리 후 새로운 데이터를 등록합니다.<br>
      기존 모든 데이터를 삭제한 후 제공된 초기 데이터로 다시 구성합니다<br><br>
      bruno나 postman으로 호출하세요.<br>
      body의 타입은 [Multipart Form]으로 지정하고 [Add File]을 클릭하여 파일을 추가할 수 있습니다.<br>
      Key: initData, Value: api/dbinit/team/data.json 파일을 추가하세요.<br>
      Key: attach, Value: api/dbinit/team/uploadFiles 폴더에 있는 파일들을 추가하세요.`
    
    #swagger.security = [{
      "Client ID": []
    }]
    
    #swagger.requestBody = {
      required: true,
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            properties: {
              initData: {
                type: "string",
                format: "binary",
                description: "JSON 형태의 초기 데이터 파일(필수, api/dbinit/team/data.json 파일)"
              },
              attach: {
                type: "string",
                format: "binary",
                description: "업로드할 파일들(여러 개 가능, initData에서 참조하는 파일들, api/dbinit/team/uploadFiles 폴더에 있는 파일들)"
              }
            },
            required: ["initData"]
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
    let initData;
    try {
      // initData를 첨부파일에서 찾기
      const dataJsFile = files.find(file => file.fieldname === 'initData');
      if (!dataJsFile) {
        return res.status(400).json({
          ok: 0,
          message: 'initData가 첨부되지 않았습니다.'
        });
      }

      // data.js 파일 내용을 문자열로 변환
      const dataJsContent = dataJsFile.buffer.toString('utf8');
      logger.info('initData 내용 로드 성공');

      // JSON으로 파싱하여 데이터 가져오기
      try {
        initData = JSON.parse(dataJsContent);
        logger.info('initData 파싱 성공');
      } catch (parseError) {
        throw new Error('initData 파싱 실패: ' + parseError.message);
      }

    } catch (error) {
      logger.error('initData 파싱 실패:', error);
      return res.status(400).json({
        ok: 0,
        message: 'initData를 파싱할 수 없습니다: ' + error.message
      });
    }

    // 파일 내용과 크기를 객체로 변환
    const fileContents = {};
    const fileSizes = {};
    files.forEach(file => {
      fileContents[file.originalname] = file.buffer; // blob 직접 저장
      fileSizes[file.originalname] = file.buffer.length; // blob에서 직접 크기 계산
    });

    logger.info(`받은 파일 수: ${files.length}개`);
    logger.info(`파일 내용 키: ${Object.keys(fileContents).join(', ')}`);

    if (!initData || typeof initData !== 'object') {
      return res.status(400).json({
        ok: 0,
        message: 'initData가 필요합니다.'
      });
    }

    const db = await getDb(clientId);

    // 1. data.js에서 uploadFiles/ 경로 추출
    const uploadPaths = extractUploadFilePaths(initData);
    const dataFiles = uploadPaths.map(path => path.replace('uploadFiles/', ''));

    // 2. 업로드된 파일 목록 추출 (initData와 data.json 제외)
    const uploadFiles = Object.keys(fileContents).filter(filename =>
      filename !== 'initData' && filename !== 'data.json'
    );

    // 3. data.js 파일과 업로드 파일 비교
    const commonFiles = dataFiles.filter(filename => uploadFiles.includes(filename));
    const missingFiles = dataFiles.filter(filename => !uploadFiles.includes(filename));
    const unusedFiles = uploadFiles.filter(filename => !dataFiles.includes(filename));

    logger.info(`initData: ${dataFiles.length}개`);
    logger.info(`업로드 파일: ${uploadFiles.length}개`);
    logger.info(`공통 파일: ${commonFiles.length}개`);

    if (missingFiles.length > 0) {
      logger.warn(`누락된 파일: ${missingFiles.join(', ')}`);
    }

    if (unusedFiles.length > 0) {
      logger.warn(`사용되지 않는 파일: ${unusedFiles.join(', ')}`);
    }

    // 3. 파일 정리 및 업로드 (공통 파일이 없어도 cleanupFiles 호출하여 기존 파일 삭제)
    let finalFiles = [];
    let fileUploadsData = [];
    logger.info(`=== 파일 정리 시작 (${commonFiles.length}개 파일) ===`);
    const cleanupResult = await cleanupFiles(commonFiles, clientId, fileContents);
    finalFiles = cleanupResult.files;
    fileUploadsData = cleanupResult.dbData;
    logger.info(`=== 파일 정리 완료 (${finalFiles.length}개 파일) ===`);

    // 4. initData 내부 코드의 파일 경로를 Cloudinary URL로 교체
    const updatedInitData = replacePathsWithCloudinaryUrls(initData, finalFiles);

    // 5. file_uploads 데이터를 initData에 추가 (cleanupFiles에서 받은 dbData 사용)
    if (fileUploadsData.length > 0) {
      // blob에서 직접 계산한 정확한 파일 크기로 업데이트
      const updatedFileUploadsData = fileUploadsData.map(fileInfo => {
        const fileSize = fileSizes[fileInfo.filename] || 0;
        return {
          ...fileInfo,
          file_size: fileSize
        };
      });

      // initData에 file_uploads 속성 추가
      updatedInitData.file_uploads = updatedFileUploadsData;
    }

    logger.info(`파일 업로드 완료: ${finalFiles.length}개 파일`);
    logger.info(`DB에 저장할 데이터: ${Object.keys(updatedInitData).length}개 컬렉션`);

    // 6. 기존 데이터 삭제 (모든 컬렉션)
    const collections = await db.listCollections().toArray();
    const dataCollections = collections;

    for (const collection of dataCollections) {
      try {
        await db.dropCollection(collection.name);
        logger.info(`컬렉션 삭제: ${collection.name}`);
      } catch (error) {
        logger.warn(`컬렉션 삭제 실패: ${collection.name}`, error.message);
        // 컬렉션이 없거나 삭제할 수 없는 경우 무시
      }
    }

    // 7. 새 데이터 삽입 (file_uploads 포함 모든 컬렉션)
    let totalInserted = 0;
    const insertStats = {};

    for (const [collectionName, documents] of Object.entries(updatedInitData)) {
      logger.debug(`${collectionName}: ${documents.length}건 등록 시작`);
      if (!documents || !Array.isArray(documents) || documents.length === 0) {
        continue;
      }

      try {
        // 각 문서에 nextSeq로 새로운 _id 할당
        const documentsWithNewIds = [];
        for(let i=0; i<documents.length; i++){
          const doc = documents[i];
        // for (const doc of documents) {
          const newId = i + 1;
          // const newId = await db.nextSeq(collectionName);
          logger.debug(collectionName, '_id', newId);
          documentsWithNewIds.push({
            _id: newId,
            ...doc,
            createdAt: moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss'),
            updatedAt: moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss')
          });

          db.setSeq(collectionName, newId + 1);
        }

        logger.info(`${collectionName}: ${documentsWithNewIds.length}건 등록 준비 완료`);

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

    res.json({
      ok: 1,
      data: {
        insertedData: totalInserted,
        details: insertStats
      },
      files: {
        count: finalFiles.length + missingFiles.length + unusedFiles.length,
        success: {
          count: finalFiles.length,
          details: finalFiles.map(file => file.filename)
        },
        missing: {
          reason: 'initData에서 사용하지만 첨부파일로 전송되지 않음',
          count: missingFiles.length,
          details: missingFiles
        },
        unused: {
          reason: '첨부파일에 있지만 initData에서 사용하지 않음',
          count: unusedFiles.length,
          details: unusedFiles
        }
      },

    });

  } catch (err) {
    logger.error('DB 초기화 실패:', err);
    next(err);
  }
});

// data.js에서 uploadFiles/로 시작하는 경로를 정규식으로 추출
function extractUploadFilePaths(data) {
  const jsonString = JSON.stringify(data);
  const uploadPaths = new Set();

  const matches = jsonString.match(/uploadFiles\/[^"\\]+/g);
  if (matches) {
    matches.forEach(match => {
      uploadPaths.add(match);
    });
  }

  return Array.from(uploadPaths);
}

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

export default router;