// import logger from '#utils/logger.js';
import shortid from "shortid";

const server = io => {
  // 서비스별 룸 관리를 위한 Map
  const namespaceRooms = new Map();

  // 동적 네임스페이스 생성 및 관리 함수
  const handleNamespace = (namespace) => {
    // 이미 해당 네임스페이스가 생성되어 있다면 바로 반환
    if (namespaceRooms.has(namespace)) {
      return;
    }

    // 새로운 네임스페이스의 룸 목록 초기화
    namespaceRooms.set(namespace, new Map());
    
    // 네임스페이스별 룸 목록 가져오기
    const getRooms = () => {
      const rooms = Array.from(namespaceRooms.get(namespace).entries()).map(([roomId, roomInfo]) => {
        return [roomId, { ...roomInfo, memberList: getMembers(roomId) }]; 
      });
      return rooms ? Object.fromEntries(rooms) : {};
    };

    // 네임스페이스별 멤버 목록 가져오기
    const getMembers = roomId => {
      if(!roomId) return {};
      const rooms = namespaceRooms.get(namespace);
      const roomInfo = rooms?.get(roomId);
      if(!roomInfo) return {};
      return Object.fromEntries(roomInfo.memberList);
    };

    // 네임스페이스별 룸 정보 가져오기
    const getRoomInfo = roomId => {
      if(!roomId) return {};
      const rooms = namespaceRooms.get(namespace);
      const roomInfo = rooms?.get(roomId);
      if(!roomInfo) return {};
      return { ...roomInfo, memberList: getMembers(roomId) };
    };

    // 모든 방에 접속된 사용자 연결을 끊고 방 삭제
    const cleanRooms = () => {
      const rooms = namespaceRooms.get(namespace);
      if (!rooms) return;
      
      // 방에 있는 모든 사용자들의 roomId 초기화
      io.of(namespace).sockets.forEach(socket => {
        if (socket.roomId) {
          socket.leave(socket.roomId);
          socket.roomId = null;
          socket.user_id = null;
          socket.nickName = null;
        }
      });
      
      // 모든 방 정보 초기화
      rooms.clear();
      
      // 해당 네임스페이스의 모든 클라이언트에게 빈 방 목록 전송
      io.of(namespace).emit('rooms', getRooms());
    }

    io.of(namespace).on('connection', function(socket) {
      console.log(`[${namespace}] 클라이언트 접속`, socket.id);

      // 채팅룸에서 나가기
      const leaveRoom = () => {
        const rooms = namespaceRooms.get(namespace);
        const myRoom = rooms?.get(socket.roomId);
        
        if(myRoom) {
          myRoom.memberList.delete(socket.user_id);
          broadcastMsg('시스템', `${socket.nickName}님이 대화에서 나갔습니다.`);
          socket.leave(socket.roomId);
          sendMembers(socket.roomId);

          // 방 생성시 autoClose: true 지정했을 경우 방에 아무도 없으면 방 삭제
          if(myRoom.autoColse && myRoom.memberList.size === 0) {
            rooms.delete(socket.roomId);
            socket.nsp.emit('rooms', getRooms());
          }
          
        }
      };

      // 채팅룸에 있는 모든 클라이언트에 메시지 전송
      const broadcastMsg = (sender, msg) => {
        socket.nsp.to(socket.roomId).emit('message', { 
          nickName: sender, 
          msg,
          timestamp: new Date().toISOString()
        });
      };

      // 채팅룸에 있는 모든 클라이언트에 멤버 목록 전송
      const sendMembers = roomId => {
        socket.nsp.to(roomId).emit('members', getMembers(roomId));
      };

      // 룸 생성
      socket.on('createRoom', function ({ roomId, user_id, hostName, roomName, capacity=99, autoColse=false } = {}, callback) {
        // 필수 파라미터 검증
        if (!roomName) {
          return callback?.({
            ok: 0,
            message: '필수 파라미터가 누락되었습니다. (user_id, hostName, roomName은 필수입니다)'
          });
        }

        const newRoomId = roomId || shortid.generate();
        const rooms = namespaceRooms.get(namespace);

        if(!user_id?.trim()) {
          user_id = socket.id;
        }
        if(!hostName?.trim()) {
          hostName = '용쌤';
        }

        const memberList = new Map();
        memberList.guestNo = 0;

        const roomInfo = {
          roomId: newRoomId,
          user_id,
          hostName,
          roomName,
          capacity,
          autoColse,
          memberList,
          createdAt: new Date().toISOString()
        };

        const res = {};

        if(rooms.has(newRoomId)) {
          res.ok = 0;
          res.message = `${newRoomId}는 이미 존재하는 roomId 입니다.`;
        } else {
          rooms.set(newRoomId, roomInfo);
          res.ok = 1;
          res.message = `${newRoomId} 채팅방 생성 완료`;
          res.roomInfo = roomInfo;
          socket.nsp.emit('rooms', getRooms());
        }

        callback?.(res);
      });

      // 채팅룸 입장
      // const joinRoom = ({ roomId, user_id, nickName } = {}, callback) => {
      const joinRoom = (params = {}, callback) => {
        // 필수 파라미터 검증
        if (!params.roomId || !params.user_id) {
          return callback?.({
            ok: 0,
            message: '필수 파라미터가 누락되었습니다. (roomId와 user_id는 필수입니다)'
          });
        }

        const rooms = namespaceRooms.get(namespace);
        const res = {};

        const roomInfo = rooms.get(params.roomId);
        if(roomInfo) {
          if(roomInfo.memberList.size >= roomInfo.capacity ) {
            res.ok = 0;
            res.message = `정원 ${roomInfo.capacity}명이 다 찼습니다.`;
          } else if(roomInfo.memberList.has(params.user_id)) {
            res.ok = 0;
            res.message = `${params.user_id}는 이미 채팅방에 참여중입니다.`;
          } else {
            socket.roomId = params.roomId;
            socket.user_id = params.user_id;
            socket.nickName = params.nickName?.trim() || '게스트' + (++roomInfo.memberList.guestNo);

            roomInfo.memberList.set(params.user_id, { 
              nickName: socket.nickName, 
              joinTime: new Date().toISOString()
            });

            res.ok = 1;
            res.message = `${params.roomId} 채팅방 입장 완료`;
            res.roomInfo = getRoomInfo(params.roomId);

            socket.join(params.roomId);
            
            // broadcastMsg('시스템', `${socket.nickName}님이 대화에 참여했습니다.`);
            const message = {
              action: 'joinRoom',
              msg: `${socket.nickName}님이 대화에 참여했습니다.`,
              params,
            };
            broadcastMsg('시스템', message);
            sendMembers(params.roomId);
          }
        } else {
          res.ok = 0;
          res.message = `${params.roomId} 채팅방이 존재하지 않습니다.`;
        }

        callback?.(res);
      };

      // 이벤트 리스너 연결
      socket.on('disconnect', function() {
        leaveRoom();
      });

      socket.on('roomInfo', (roomId, callback) => callback(getRoomInfo(roomId)));
      socket.on('rooms', callback => callback(getRooms()));
      socket.on('joinRoom', joinRoom);
      socket.on('leaveRoom', leaveRoom);
      socket.on('message', msg => {
        broadcastMsg(socket.nickName, msg);
      });
      socket.on('cleanRooms', cleanRooms);
    });
  };

  // // URL 패턴 매칭을 통한 동적 네임스페이스 생성
  // io.engine.on('initial_headers', (headers, req) => {
  //   try {
  //     const path = new URL(req.headers.referer).pathname;
  //     console.log('Requested namespace:', path);
      
  //     if (!path.startsWith('/socket.io')) {
  //         handleNamespace(path);
  //     }
  //   } catch (error) {
  //       console.log('URL 파싱 실패:', error);
  //   }
  // });

  handleNamespace('/febc13-chat');
  handleNamespace('/febc13-chat/team01');
  handleNamespace('/febc13-chat/team02');
};



export default server;