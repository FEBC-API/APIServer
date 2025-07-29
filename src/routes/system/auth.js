import express from 'express';
import authService from '#services/auth.service.js';
import { getClientId } from '#utils/dbUtil.js';
import userModel from '#models/user/user.model.js';
const router = express.Router();

// Access Token 재발행
router.get('/refresh', async (req, res, next) => {
  /*
    #swagger.tags = ['인증']
    #swagger.summary  = 'Access 토큰 재발행'
    #swagger.description = 'Authorization 헤더에 Bearer 방식의 Refresh Token을 보내서 Access Token을 재발급 합니다.'

    #swagger.security = [{
      "Refresh Token": [],
      "Client ID": []
    }]

    #swagger.parameters['authorization'] = {
      description: "Refresh Token<br>화면 우측 상단의 자물쇠 버튼을 눌러 refreshToken을 먼저 등록하세요.<br>refreshToken은 로그인 후 발급 받을 수 있습니다.",
      in: 'header',
      example: '비워두세요'
    }

    #swagger.responses[200] = {
      description: '성공',
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/accessTokenRes" }
        }
      }
    }
    #swagger.responses[401] = {
      description: 'Refresh Token 인증 실패',
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/error401" }
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
    const refreshToken = req.headers.authorization && req.headers.authorization.split('Bearer ')[1];
    const clientId = getClientId(req);
    const accessToken = await authService.refresh(clientId, refreshToken);
  
    res.json({ ok: 1, accessToken });
  }catch(err){
    next(err);
  }
});

// 이메일 인증
router.get('/email', async (req, res, next) => {
  /*
    #swagger.auto = false
    #swagger.tags = ['인증']
    #swagger.summary = '이메일 인증'
    #swagger.description = '이메일로 전송된 토큰을 검증하여 이메일 인증을 완료하고, 사용자의 이메일 인증 상태를 업데이트한 후 결과 페이지로 리다이렉트합니다.'
  */
  try {
    const { token } = req.query;
    
    if (!token) {
      // 실패 페이지로 리다이렉트
      const failureParams = new URLSearchParams({
        error: '올바른 인증 링크를 사용해주세요.',
        redirectUrl: '',
        serviceName: '멋쟁이 용처럼'
      });
      return res.redirect(`/market/email-failure.html?${failureParams.toString()}`);
    }

    const result = await authService.verifyEmailToken(token);

    // 이메일로 회원 정보 조회
    const user = await userModel.findBy(result.clientId, { email: result.email });

    if(user){
      // 이메일 인증 완료
      await userModel.update(result.clientId, user._id, { extra: { emailConfirm: true } });
          
      // 성공 페이지로 리다이렉트
      const successParams = new URLSearchParams({
        message: result.serviceUrl ? result.message : '개발자가 이동할 서비스의 링크를 보내지 않았어요. 사실 쿠팡이 더 싸요.',
        email: result.email,
        redirectUrl: result.serviceUrl || 'https://www.coupang.com',
        serviceName: result.serviceUrl ? result.serviceName : '쿠팡'
      });
      res.redirect(`/market/email-success.html?${successParams.toString()}`);
    }else{
      throw Error(`${result.email} 이메일로 등록된 회원 정보가 없습니다.`);
    }
    
    
  } catch (err) {
    // 실패 페이지로 리다이렉트
    const failureParams = new URLSearchParams({
      error: err.message || '인증 중 오류가 발생했습니다. 이건 개발자 잘못이예요. 사실 쿠팡이 더 싸요.',
      redirectUrl: 'https://www.coupang.com',
      serviceName: '쿠팡'
    });
    res.redirect(`/market/email-failure.html?${failureParams.toString()}`);
  }
});

export default router;
