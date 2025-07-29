import nodemailer from 'nodemailer';
import createError from 'http-errors';

import logger from '#utils/logger.js';

import authService from '#services/auth.service.js';

// expiresIn 값을 한국어 시간으로 변환
function convertExpiresInToKorean(expiresIn = '1h') {
  const timeValue = parseInt(expiresIn);
  const timeUnit = expiresIn.replace(/\d+/g, '');
  
  switch(timeUnit) {
    case 's':
      return `${timeValue}초`;
    case 'm':
      return `${timeValue}분`;
    case 'h':
      return `${timeValue}시간`;
    case 'd':
      return `${timeValue}일`;
    default:
      return '1시간';
  }
}

async function setMailOptions(clientId, body) {
  try{
    const forVerify = body.forVerify || false;
    
    const serviceName = body.serviceName || '멋쟁이 용처럼';
    const from = `${serviceName} <${process.env.MAIL_USER}>`;
    
    let subject = '';
    let html = '';
    if(forVerify){
      subject = body.subject || `[${serviceName}] 인증 메일입니다.`;
      const token = await authService.generateEmailToken(body.to, {
        serviceUrl: body.serviceUrl || '/',
        serviceName: body.serviceName || serviceName,
        clientId,
        expiresIn: body.expiresIn,
      });
      const verifyUrl = body.verifyUrl || `${process.env.API_URL}/market/auth/email?token=${token}`;
      html = `
        ${body.content || ''}
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; text-align: center;">
          <div style="margin-bottom: 20px;">
            ${body.content ? '' : `<h2 style="color: #333;">${from} 인증 메일</h2>`}
          </div>
          <p style="color: #666; font-size: 16px; line-height: 1.5;">
            인증 완료 버튼을 누르면 인증이 완료됩니다.
          </p>
          <div style="margin: 20px 0;">
            <a href="${verifyUrl}" style="
              background-color: #007bff;
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 5px;
              font-size: 16px;
              font-weight: bold;
              display: inline-block;
              box-shadow: 0 2px 4px rgba(0,123,255,0.3);
            ">인증 완료</a>
          </div>
          <p style="color: #888; font-size: 14px;">
            인증 링크는 ${convertExpiresInToKorean(body.expiresIn)} 후에 만료됩니다.
          </p>
        </div>
      `;
    }else{
      subject = body.subject || `요청 body에 subject 속성이 없습니다.`;
      html = body.content || '요청 body에 content 속성이 없습니다.';
    }
  
    const mailOptions = {
      from,
      to: body.to,
      subject,
      html
    };
  
    logger.debug(mailOptions);
    return mailOptions;
  }catch(err){
    logger.error(err);
    throw createError(500, `메일 전송 중 오류가 발생했습니다. ${err.message}`);
  }
  
}

const mailService = {
  // 메일 전송
  async sendMail(clientId, body){
    logger.trace(clientId, body);
    const options = await setMailOptions(clientId, body);
    
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      secure: true, // true for 465, false for other ports
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });

    const res = await transporter.sendMail(options);
    logger.debug("Message sent:", res.messageId);
    return res;
  },
};

export default mailService;
