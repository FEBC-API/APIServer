import _ from 'lodash';
import moment from 'moment-timezone';

import logger from '#utils/logger.js';
import { getDb } from '#utils/dbUtil.js';

import userModel from '#models/user/user.model.js';
import productModel from '#models/user/product.model.js';
import postModel from '#models/user/post.model.js';

const chatModel = { 
  // 사용자의 채팅방 목록 조회 (최신 메시지 기준 필터링 및 정렬)
  async find(clientId, userId) {
    logger.trace(arguments);
    const db = await getDb(clientId);
    
    // 1. 내가 멤버로 포함된 모든 방 조회
    const allMyRooms = await db.collection('chat').find({
      'members._id': { $in: [ userId, Number(userId), String(userId) ] }
    }).sort({ updatedAt: -1 }).toArray();

    // 2. 필터링 로직: 나간 상태 체크 및 빈 방 숨기기 (상대방 보호)
    const filteredList = allMyRooms.filter(room => {
      const me = room.members.find(m => String(m._id) === String(userId));
      if (!me) return false;

      const isOwner = String(room.ownerId) === String(userId);
      const hasMessages = room.messages && room.messages.length > 0;

      // 이미 나간 방인 경우: 나간 시점 이후에 새로운 활동(메시지 등)이 있어야 함
      if (me.leftAt) {
        return room.updatedAt > me.leftAt;
      }

      // 나가지 않은 방인 경우:
      // 1) 내가 방을 만든 사람이면 빈 방이라도 목록에 유지 (내가 대화를 시작했으므로)
      // 2) 내가 초대받은 쪽(상대방)이라면 메시지가 하나라도 있어야 목록에 나타남
      return isOwner || hasMessages;
    });

    // 3. [추가] 리스트 반환 시 멤버 정보(이름, 이미지)가 없으면 실시간 보충
    const enrichedList = await Promise.all(filteredList.map(async (room) => {
      const needsEnrich = room.members.some(m => !m.name);
      if (needsEnrich) {
        const userIds = room.members.map(m => Number(m._id));
        const users = await db.collection('user').find({ _id: { $in: userIds } }).toArray();
        room.members = room.members.map(m => {
          const fullInfo = users.find(u => Number(u._id) === Number(m._id));
          return fullInfo ? { ...m, name: fullInfo.name, image: fullInfo.image } : m;
        });
      }
      return room;
    }));

    return enrichedList;
  },

  // 채팅방 상세 조회 (사용자의 leftAt 기준 메시지 필터링)
  async findById(clientId, _id, userId) {
    logger.trace(arguments);
    const db = await getDb(clientId);
    const item = await db.collection('chat').findOne({ _id });

    if (item && userId) {
      const member = item.members.find(m => m._id === userId);
      if (member && member.leftAt) {
        // 나간 시점(leftAt) 이후의 메시지만 필터링
        item.messages = item.messages.filter(msg => msg.createdAt > member.leftAt);
      }
    }
    return item;
  },

  // 지정한 리소스에 대한 채팅방 상세 조회 (사용자의 leftAt 기준 메시지 필터링)
  async findBySourceId(clientId, resourceType, resourceId, user) {
    logger.trace(arguments);
    const db = await getDb(clientId);

    // 1. 해당 리소스와 관련된 기존 채팅방이 있는지 조회
    const query = { resourceType };
    if (resourceType === 'user') {
      // 일반 채팅: resourceId 필드 값과 상관없이 두 명(나와 상대방)이 포함된 방을 찾음
      query['members._id'] = { $all: [resourceId, user._id] };
    } else {
      // 게시글/상품 등: 특정 리소스 ID와 내 아이디가 모두 일치해야 함
      query.resourceId = resourceId;
      query['members._id'] = user._id;
    }
    logger.debug(query)
    let item = await db.collection('chat').findOne(query);

    if(item){
      const member = item.members.find(member => member._id === user._id);
      if (member && member.leftAt) {
        // 메시지 필터링 (나간 시점 이후 것만 보여줌)
        item.messages = item.messages.filter(msg => msg.createdAt > member.leftAt);
      }
    }
    

    // 2. 없다면 서버에서 리소스 정보를 가져와서 채팅방 생성
    // 상대방 정보는 resourceType이 user일 경우 _id, name, image
    // 상대방 정보는 resourceType이 post일 경우 user._id, user.name, user.image
    // 상대방 정보는 resourceType이 product일 경우 seller._id, seller.name, seller.image
    let resource = null;
    let partner = null;
    let roomName = null;
    if (!item) {
      // 리소스의 작성자(소유자) ID 확인
      switch(resourceType){
        case 'user':
          resource = await userModel.findById(clientId, { _id: resourceId });
          partner = resource;
          break;
        case 'post':
          resource = await postModel.findById(clientId, { _id: resourceId });
          partner = resource.user;
          roomName = resource.title;
          break;
        case 'product':
          resource = await productModel.findById(clientId, { _id: resourceId });
          partner = resource.seller;
          roomName = resource.name;
          break;
      }
      
      // 새로운 채팅방 생성 요청
      item = {
        _id: await db.nextSeq('chat'),
        resourceType,
        resourceId,
        roomName,
        ownerId: user._id,
        members: [{ _id: user._id, name: user.name, image: user.image }, { _id: partner._id, name: partner.name, image: partner.image }],
        messages: [],
      };
      item.updatedAt = item.createdAt = moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss');
      await db.collection('chat').insertOne(item);
    }
    return item;
  },

  // 해당 클라이언트의 모든 채팅방 조회 (관리자용)
  async findByClientId(clientId) {
    logger.trace(arguments);
    const db = await getDb(clientId);
    const list = await db.collection('chat').find({
      messages: { $not: { $size: 0 } }
    }).sort({ updatedAt: -1 }).toArray();
    return list;
  },

  // 메시지 추가 및 룸 갱신
  async addMessage(clientId, roomId, message) {
    logger.trace(arguments);
    const db = await getDb(clientId);
    
    const now = moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss');
    message.createdAt = message.createdAt || now;
    message._id = message._id || Date.now();
    
    const result = await db.collection('chat').updateOne(
      { $or: [ { roomId: roomId }, { roomId: Number(roomId) }, { _id: Number(roomId) } ] },
      { 
        $push: { messages: message },
        $set: { updatedAt: now }
      }
    );
    return result;
  },

  // 채팅방 나가기 (논리 삭제: leftAt 기록)
  async leave(clientId, roomId, userId) {
    logger.trace(arguments);
    const db = await getDb(clientId);
    const now = moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss');

    // 사용자의 leftAt 시점을 현재로 업데이트
    await db.collection('chat').updateOne(
      { 
        $or: [ { roomId: roomId }, { roomId: Number(roomId) }, { _id: Number(roomId) } ],
        'members._id': { $in: [ userId, Number(userId), String(userId) ] }
      },
      { 
        $set: { 'members.$.leftAt': now } 
      }
    );

    // [추가 기능] 만약 모든 유저의 leftAt이 updatedAt보다 크다면(모두 나갔다면) 물리 삭제 검토 가능
    // 현재는 논리 삭제 상태만 유지
    return { ok: 1 };
  },

  // 채팅방 메시지 읽음 처리 (내 아이디를 모든 메시지의 readUserIds에 추가)
  async markAsRead(clientId, roomId, userId) {
    logger.trace(arguments);
    const db = await getDb(clientId);
    
    // roomId가 _id인 문서를 찾아, 모든 메시지 배열 요소 중 내 아이디가 없는 것들에 아이디 추가
    await db.collection('chat').updateOne(
      { _id: Number(roomId) },
      { $addToSet: { 'messages.$[elem].readUserIds': Number(userId) } },
      { 
        arrayFilters: [{ 'elem.readUserIds': { $ne: Number(userId) } }],
        multi: true // 여러 메시지 요소를 한 번에 업데이트
      }
    );
    return { ok: 1 };
  }
};

export default chatModel;
