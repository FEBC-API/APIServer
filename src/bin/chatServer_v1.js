import logger from '#utils/logger.js';
import shortid from "shortid";

const server = io => {
  // 채팅룸 목록
  io.roomList = new Map();

  // 채팅룸 목록 반환
  const getRooms = () => Object.fromEntries(io.roomList);

  // 채팅룸 멤버 목록 반환
  const getMembers = roomId => {
    if(!roomId) return {};
    const roomInfo = io.roomList.get(roomId);
    if(!roomInfo) return {};
    return Object.fromEntries(roomInfo.memberList);
  }

  // 채팅룸 정보 반환
  const getRoomInfo = roomId => {
    if(!roomId) return {};
    const roomInfo = io.roomList.get(roomId);
    if(!roomInfo) return {};
    console.log('채팅룸 정보', roomId, getMembers(roomId));
    return { ...roomInfo, memberList: getMembers(roomId) };
  }

  io.of('/febc13-chat').on('connection', function(socket){
    console.log('클라이언트 접속', socket.id);

    // 룸 생성

    socket.on('createRoom', function ({ roomId, user_id, hostName, roomName }, callback) {
      const newRoomId = roomId || shortid.generate();

      if(!user_id.trim()){
        user_id = socket.id;
      }
      if(!hostName.trim()){
        hostName = '용쌤';
      }


      const memberList = new Map();
      memberList.guestNo = 0;

      const roomInfo = {
        roomId: newRoomId,
        user_id,
        hostName,
        roomName,
        memberList,
      };

      const res = {};

      if(io.roomList.has(newRoomId)){
        res.ok = 0;
        res.message = `${newRoomId}는 이미 존재하는 roomId 입니다.`;
        // socket.disconnect();
      }else{
        io.roomList.set(newRoomId, roomInfo);
        res.ok = 1;
        res.message = `${newRoomId} 채팅방 생성 완료`;
        res.roomInfo = roomInfo;
        // 모든 클라이언트에 생성된 룸 정보 전송
        socket.nsp.emit('rooms', getRooms());
      }

      callback(res);
    });

    // 채팅룸에 입장
    const joinRoom = ({ roomId, user_id, nickName }, callback) => {
      console.info(roomId, user_id, nickName);

      const res = {};

      const roomInfo = io.roomList.get(roomId);
      if(roomInfo){
        // user_id가 채팅방에 존재하는지 확인
        if(roomInfo.memberList.has(user_id)){
          res.ok = 0;
          res.message = `${user_id}는 이미 채팅방에 참여중입니다.`;
        }else{
          res.ok = 1;
          res.message = `${roomId} 채팅방 입장 완료`;
          res.roomInfo = roomInfo;

          socket.roomId = roomId;
          socket.user_id = user_id;
          socket.nickName = nickName || '게스트' + (++roomInfo.memberList.guestNo);
          roomInfo.memberList.set(user_id, { nickName: socket.nickName, joinTime: new Date() });

          socket.join(roomId);

          console.log(roomInfo.memberList);

          broadcastMsg('시스템', `${socket.nickName}님이 대화에 참여했습니다.`);
          sendMembers(roomId);
        }

      }else{
        res.ok = 0;
        res.message = `${roomId} 채팅방이 존재하지 않습니다.`;
      }

      callback?.(res);
    };

    // 채팅룸에서 나가기
    const leaveRoom = () => {
      const myRoom = io.roomList.get(socket.roomId);
      if(myRoom){
        myRoom.memberList.delete(socket.user_id);
        broadcastMsg('시스템', `${socket.nickName}님이 대화에서 나갔습니다.`);
        socket.leave(socket.roomId);
        sendMembers(socket.roomId);
      }
    };

    // 채팅룸에 있는 모든 클라이언트에 메시지 전송
    const broadcastMsg = (sender, msg) => {
      // socket.to(socket.roomId).emit('message', { nickName: sender, msg }); // 자기 자신을 제외
      socket.nsp.to(socket.roomId).emit('message', { nickName: sender, msg }); // 자기 자신을 포함
    };

    

    // 채팅룸에 있는 모든 클라이언트에 멤버 목록 전송
    const sendMembers = roomId => {
      console.log(roomId, getMembers(roomId));
      socket.nsp.to(roomId).emit('members', getMembers(roomId));
    };

    // 클라이언트에 메시지 전송(콜백 방식으로 응답하므로 더이상 사용하지 않음)
    // const sendMsg = (sender, msg) => {
    //   socket.emit('message', { nickName: sender, msg });
    // };

    // 클라이언트 접속 종료시
    socket.on('disconnect', function(){
      leaveRoom();
    });

    // 채팅방 정보 반환
    socket.on('roomInfo', (roomId, callback) => callback(getRoomInfo(roomId)));

    // 생성된 모든 룸의 목록 반환
    socket.on('rooms', callback => callback(getRooms()));

    // 룸에 참여
    socket.on('joinRoom', joinRoom);

    // 룸에서 나가기
    socket.on('leaveRoom', leaveRoom);

    // 클라이언트로부터 채팅 메세지 도착
    socket.on('message', msg => {
      broadcastMsg(socket.nickName, msg);
    });
  });
};

export default server;