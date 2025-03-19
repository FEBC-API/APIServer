import userModel from "#models/user/user.model.js";

const CLIENT_ID = 'openmarket';

describe('회원 관리', () => {
  it('회원 가입', async () => {
    const user = {
      email: 'test@gmail.com',
      password: '11111111',
    }
    const result = await userModel.create(CLIENT_ID, user);
    console.log(result);
    expect(result).toMatchObject(user);
  });

})
