import express from 'express';
import { body } from 'express-validator';
import { getClientId } from '#utils/dbUtil.js';
import mailService from '#services/mail.service.js';
import validator from '#middlewares/validator.js';
const router = express.Router();

// 일반 이메일 전송
router.post('/', [
  body('to').isEmail().withMessage('올바른 이메일 형식이 아닙니다.'),
  body('serviceName').trim().notEmpty().withMessage('서비스명을 입력해주세요.'),
  body('subject').trim().notEmpty().withMessage('이메일 제목을 입력해주세요.'),
  body('content').trim().notEmpty().withMessage('이메일 내용을 입력해주세요.'),
], validator.checkResult, async function(req, res, next) {
  /*
    #swagger.tags = ['이메일']
    #swagger.summary = '일반 이메일 전송'
    #swagger.description = '일반 이메일을 전송합니다.<br>
    회원 가입 축하, 배송 상태 변경 등 일반적인 정보를 제공하는 목적의 이메일을 보내고 싶을 때 사용합니다.<br>
    이메일을 통한 인증을 원한다면 "인증 이메일 전송" API를 사용하세요.'

    #swagger.security = [{
      "Client ID": []
    }]

    #swagger.requestBody = {
      description: "<p>전송할 이메일 정보가 저장된 객체입니다.</p>
      <ul>
        <li><b>*to</b>: 수신자 이메일 주소</li>
        <li><b>*serviceName</b>: 서비스명(송신자 이름으로 사용)</li>
        <li><b>*subject</b>: 이메일 제목</li>
        <li><b>*content</b>: 이메일 내용(스타일을 인라인으로 정의한 HTML 형식)</li>
      </ul>",
      required: true,
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/emailSend' }
        }
      }
    }

    #swagger.responses[200] = {
      description: '이메일 전송 성공',
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/emailSendRes' }
        }
      }
    }
    #swagger.responses[500] = {
      description: '이메일 전송 실패',
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/error500' }
        }
      }
    }
  */

  try{
    const clientId = getClientId(req);
    const result = await mailService.sendMail(clientId, req.body);
    res.json({ ok: 1, item: result });
  }catch(err){
    next(err);
  }
});


// 인증 이메일 전송
router.post('/verify', [
  body('to').isEmail().withMessage('올바른 이메일 형식이 아닙니다.'),
  body('serviceName').trim().notEmpty().withMessage('서비스명을 입력해주세요.'),
  body('serviceUrl').isURL({ require_tld: false }).withMessage('올바른 URL 형식이 아닙니다.'),
  body('subject').optional().trim(),
  body('content').optional().trim(),
  body('expiresIn').optional().matches(/^\d+[smhd]$/).withMessage('expiresIn은 숫자+단위(s,m,h,d) 형식이어야 합니다. 예: 1h, 30m, 10s'),
], validator.checkResult, async function(req, res, next) {
  /*
    #swagger.tags = ['이메일']
    #swagger.summary = '인증 이메일 전송'
    #swagger.description = '계정 인증용 이메일을 전송합니다.<br>
      이메일 인증 서비스는 지정한 사용자에게 인증 링크가 있는 이메일을 보내고 인증이 완료되면 회원 정보에 인증 정보를 추가하므로 회원 가입을 완료한 후에 요청해야 합니다.<br>
      회원 가입시 extra.emailConfirm 속성을 false로 지정하면 이메일을 인증하지 않은 사용자는 로그인을 할 수 없습니다.<br>
      이메일에 전달되는 "인증 완료" 버튼을 클릭하면 이메일을 인증한 후 extra.emailConfirm 속성을 true로 변경하고 인증 완료 페이지로 이동합니다.<br>
      이 모든 작업은 API 서버에서 처리되므로 이메일 인증을 하고 싶은 팀은 "회원 가입" 후에 "인증 이메일 전송"을 요청만하면 됩니다.<br>
      만약 회원 가입 도중에 이메일 인증을 먼저 하고 싶다면 자체적으로 인증 코드를 생성한 후 <a href="/market/apidocs/#/이메일/post_email_" target="_blank">일반 이메일 전송</a>을 요청해서 이메일 본문에 인증 코드를 보내고 사용자가 인증 코드를 입력하면 자체적으로 검증하도록 구현하면 됩니다.'
    #swagger.security = [{
      "Client ID": []
    }]

    #swagger.requestBody = {
      description: "<p>전송할 인증 이메일 정보가 저장된 객체입니다.</p>
      <ul>
        <li><b>*to</b>: 수신자 이메일 주소</li>
        <li><b>*serviceName</b>: 서비스명(송신자 이름으로 사용)</li>
        <li><b>*serviceUrl</b>: 인증 완료 페이지에서 서비스로 이동할 URL</li>
        <li>subject: 이메일 제목(생략 시 \"[${serviceName}] 인증 메일입니다.\" 라는 제목으로 발송)</li>
        <li>content: 이메일 내용(스타일을 인라인으로 정의한 HTML 형식, content가 전달되면 content + 인증 버튼을 포함하는 메세지 발송)</li>
        <li>expiresIn: 인증 토큰 만료 기간(생략시 1h, 1h: 1시간, 2h: 2시간, 5m: 5분, 10s: 10초)</li>
      </ul>",
      required: true,
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/emailVerifySend' }
        }
      }
    }

    #swagger.responses[200] = {
      description: '인증 이메일 전송 성공',
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/emailSendRes' }
        }
      }
    }
    #swagger.responses[500] = {
      description: '인증 이메일 전송 실패',
      content: {
        "application/json": {
          schema: { $ref: '#/components/schemas/error500' }
        }
      }
    }
  */

  try{
    const clientId = getClientId(req);
    const result = await mailService.sendMail(clientId, { ...req.body, forVerify: true });
    res.json({ ok: 1, item: result });
  }catch(err){
    next(err);
  }
});


export default router;
