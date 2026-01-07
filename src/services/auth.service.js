import jwt from 'jsonwebtoken';
import createError from 'http-errors';

import logger from '../utils/logger.js';
import { jwt as JWTConfig } from '../config/index.js';
import userModel from '#models/user/user.model.js';

const authService = {
  // JWT 토큰 생성
  async sign(payload, expiresIn) {
    const accessOptions = { ...JWTConfig.access.options };
    if(expiresIn){
      accessOptions.expiresIn = expiresIn;
    }
    
    const result = {
      accessToken: jwt.sign(
        payload,
        JWTConfig.access.secretKey,
        accessOptions,
      ),
      refreshToken: jwt.sign(
        {},
        JWTConfig.refresh.secretKey,
        JWTConfig.refresh.options,
      ),
    };
    return result;
  },

  // JWT 토큰 검증
  verifyToken(token, type='access') {
    logger.trace(arguments);
    if(!token){
      throw createError(401, 'authorization 헤더가 없습니다.', { errorName: 'EmptyAuthorization' });
    }

    try{
      const payload = jwt.verify(
        token,
        JWTConfig[type].secretKey,
        JWTConfig[type].configs,
      );
      return payload;
    }catch(err){
      // 인증 실패
      logger.log(err);
      // 유효시간이 초과된 경우
      if (err.name === 'TokenExpiredError') {
        err.message = '토큰이 만료되었습니다.';
      } else if (err.name === 'JsonWebTokenError') {
        // 토큰의 비밀키가 일치하지 않는 경우
        err.message = '유효하지 않은 토큰입니다.';
      } else {
        err.message = '토큰 인증에 실패했습니다.';
      }
      throw createError(401, err.message, { errorName: err.name });
    }
  },

  // AccessToken 재발행
  async refresh(clientId, refreshToken) {
    // 토큰 검증
    this.verifyToken(refreshToken, 'refresh');
    const user = await userModel.findBy(clientId, { refreshToken });
    if(user){
      // const token = await this.sign({ _id: user._id, type: user.type, name: user.name, email: user.email, image: user.image, loginType: user.loginType });
      const token = await this.sign({ _id: user._id, type: user.type });
      logger.log('token', token);
      return token;
    }else{
      throw createError(401, 'refreshToken과 일치하는 사용자가 없습니다.');
    }    
  },

  // 이메일 인증 번호 생성
  async generateEmailToken(email, options = {}) {
    const { 
      expiresIn = '1h', 
      serviceUrl,
      serviceName,
      clientId
    } = options;
    
    // 이메일 인증용 토큰은 기본 1시간 유효, 옵션으로 변경 가능
    const token = await this.sign({ 
      verifyEmail: email,
      serviceUrl,
      serviceName,
      clientId
    }, expiresIn);
    return token.accessToken;
  },

  // 이메일 인증 검증
  async verifyEmailToken(token) {
    // 토큰 검증 (만료시간, 서명 등 모든 검증 포함)
    const payload = this.verifyToken(token, 'access');
    
    // 이메일 인증용 토큰인지 확인 (verifyEmail 필드 존재 여부)
    if (!payload.verifyEmail) {
      throw createError(401, '유효하지 않은 링크입니다.', { errorName: 'JsonWebTokenError' });
    }
    
    return {
      verified: true,
      email: payload.verifyEmail,
      serviceUrl: payload.serviceUrl,
      serviceName: payload.serviceName,
      clientId: payload.clientId,
      message: '이메일 인증이 완료되었습니다.'
    };
  },
};

export default authService;
