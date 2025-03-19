/** @type {import('jest').Config} */


export default {
  // Jest가 ESM을 지원하도록 설정
  // extensionsToTreatAsEsm: ['.js'],
  
  // Node 환경에서 실행
  // testEnvironment: 'node',

  // Babel을 사용하여 변환 (필요 시 추가)
  // transform: {
  //   '^.+\\.js$': 'babel-jest',
  // },

  // ES 모듈을 사용하는 패키지 변환 (필요 시 추가)
  // transformIgnorePatterns: [
  //   '/node_modules/(?!your-esm-package).+\\.js$',
  // ],

  // 각 테스트 파일의 실행전이나 실행후에 처리할 작업을 등록
  setupFilesAfterEnv: ['<rootDir>/tests/setup/setupFilesAfterEnv.js'],

  globalSetup: '<rootDir>/tests/setup/globalSetup.js',
  globalTeardown: '<rootDir>/tests/setup/globalTeardown.js',

  testPathIgnorePatterns: [
    '<rootDir>/tests/models/',  // 특정 폴더 제외
    // '<rootDir>/tests/models/user/user.model.test.js', // 특정 파일 제외
    // '<rootDir>/tests/sample/',
  ],

  

};
