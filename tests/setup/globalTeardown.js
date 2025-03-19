import { disconnect } from '#utils/dbUtil.js';

export default async () => {
  console.log('전체 테스트 종료 후 호출');
  await disconnect();
};