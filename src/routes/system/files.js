import express from 'express';
import multer from 'multer';

import logger from '#utils/logger.js';
import CloudinaryStorage from '#utils/uploadUtil.js';

const router = express.Router();

const multerUpload = async (req, res, next) => {
  (multer({
    storage: new CloudinaryStorage()
  }).array('attach', 10))(req, res, next);
};

// multer 에러 처리
const handleError = (err, req, res, next) => {
  logger.error(err);
  let message = '';
  if (err instanceof multer.MulterError) {
    if(err.code === 'LIMIT_UNEXPECTED_FILE') {
      if(err.field === 'attach'){
        message = '파일은 한번에 10개 까지만 업로드가 가능합니다.';
      }else{
        message = '첨부 파일 필드명은 attach로 지정해야 합니다.';
      }
    }
    res.status(422).json({ ok: 0, message: message || err.code});
  }else{
    next(err);
  }
};

// 파일 업로드
router.post('/', multerUpload, handleError, async function(req, res, next) {
  /*
    #swagger.tags = ['파일']
    #swagger.summary  = '파일 업로드'
    #swagger.description = `한번에 최대 10개 까지 파일을 업로드 합니다.<br>
      회원 가입시 프로필 이미지를 첨부하거나 상품의 이미지를 미리 업로드 한 후 응답 받은 파일 경로를 사용하면 업로드한 파일에 접근이 가능합니다.<br>
      파일 업로드 완료 후 파일명, 경로를 가진 객체 배열을 반환합니다.`
    
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
              attach: {
                description: '업로드할 파일',
                type: "array",
                items: {
                  type: "string",
                  format: "binary"
                }
              }
            }
          }            
        }
      }
    }
    #swagger.responses[201] = {
      description: '성공',
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/fileUploadRes" },
        }
      }
    }
    #swagger.responses[422] = {
      description: '입력값 검증 오류',
      content: {
        "application/json": {
          examples: {
            "필드명 오류": { $ref: "#/components/examples/fileUploadFieldError" },
            "최대 허용치 초과 ": { $ref: "#/components/examples/fileUploadLimitError" },
          }
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
  try{
    logger.debug(req.files);
    const result = { ok: 1 };

    result.item = req.files.map(file => ({
      name: file.filename,
      path: file.cloudinary_url,
    }));

    res.status(201).json(result);
  }catch(err){
    next(err);
  }
});

export default router;