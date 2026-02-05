import moment from 'moment-timezone';
import { db as DBConfig } from '#config/index.js';
import chatModel from '#models/user/chat.model.js';

const server = io => {
  // 동적 네임스페이스 생성 및 관리 함수
  const handleNamespace = (namespace) => {
    // 네임스페이스에서 clientId 추출 (/private-chat/client-id)
    const clientId = namespace.split('/').pop();

    // 네임스페이스별 사용자 소켓 매핑 관리(귓속말 기능을 위해)
    // 이 맵은 현재 연결된 소켓 인스턴스를 userId와 roomId로 찾아 귓속말을 보내기 위해 사용됩니다.
    // 이는 transient한 연결 상태이며, 영구적인 룸 상태를 저장하지 않습니다.
    const userSocketMap = new Map();

    io.of(namespace).on('connection', async function(socket) {
      console.log(`[${namespace}] 클라이언트 접속`, socket.id);

      // 사용자 등록 (접속 직후 호출 필요)
      socket.on('setUser', async ({ userId, nickName }) => {
        if (!userId) return;
        
        socket.userId = userId;
        socket.nickName = nickName;
        
        // 본인의 개인 채널에 입장 (알림 및 귓속말 수신용)
        const personalRoom = `user_${userId}`;
        socket.join(personalRoom);
        console.log(`[${namespace}] 사용자 ${userId} (${nickName}) 개인 채널 입장: ${personalRoom}`);
      });

      // 메시지 전송 및 라우팅 (1:1 기반)
      socket.on('message', async ({ roomId, targetUserId, content }) => {
        if (!socket.userId || !roomId) return;

        console.log(`[${namespace}] 메시지 전송: ${socket.userId} -> ${targetUserId} (Room: ${roomId})`);

        const dbMessage = {
          senderId: socket.userId,
          content,
          readUserIds: [socket.userId],
          createdAt: moment().tz('Asia/Seoul').format('YYYY.MM.DD HH:mm:ss')
        };

        // 상대방이 현재 이 방을 활성 상태로 보고 있는지 확인 (실시간 읽음 처리)
        // 네임스페이스 내의 모든 소켓을 순회하며 상대방 아이디와 방 아이디가 일치하는 소켓 탐색
        const nsSockets = await io.of(namespace).fetchSockets();
        const isTargetActive = nsSockets.some(s => 
          String(s.userId) === String(targetUserId) && String(s.roomId) === String(roomId)
        );

        if (isTargetActive) {
          dbMessage.readUserIds.push(Number(targetUserId));
        }

        try {
          // 1. DB 저장
          await chatModel.addMessage(clientId, roomId, dbMessage);

          // 2. 라우팅: 발신자와 수신자 모두에게 전달
          const msgPayload = {
            _id: dbMessage._id,
            roomId,
            senderId: socket.userId,
            content, // msg -> content
            createdAt: dbMessage.createdAt, // timestamp -> createdAt
            readUserIds: dbMessage.readUserIds // 수정됨: 실시간 읽음 체크 결과 반영
          };

          // 발신자에게 전달 (본인 채널)
          socket.nsp.to(`user_${socket.userId}`).emit('message', msgPayload);
          
          // 수신자에게 전달 (상대방 채널)
          if (targetUserId && String(targetUserId) !== String(socket.userId)) {
            socket.nsp.to(`user_${targetUserId}`).emit('message', msgPayload);
          }

        } catch (err) {
          console.error('Message routing/save error:', err);
        }
      });

      // 현재 활성화된 방 설정 (읽음 처리/알림 제어용)
      socket.on('setActiveRoomId', async (roomId) => {
        socket.roomId = roomId;
        console.log(`[${namespace}] 사용자 ${socket.userId}의 활성 방 설정: ${roomId}`);
        
        // 1. DB 모든 메시지 읽음 처리
        if (roomId) {
          await chatModel.markAsRead(clientId, roomId, socket.userId);
          
          // 2. 상대방에게 '읽음 완료' 신호 전송 (상대방 화면의 '1' 표시 제거용)
          const room = await chatModel.findById(clientId, roomId);
          if (room) {
            const partner = room.members.find(m => String(m._id) !== String(socket.userId));
            if (partner) {
              socket.nsp.to(`user_${partner._id}`).emit('readReceipt', { 
                roomId, 
                userId: socket.userId 
              });
            }
          }
        }
      });

      // 채팅방 나가기 (논리 삭제 처리)
      socket.on('leave', async (roomId, callback) => {
        if (!socket.userId || !roomId) return callback?.({ ok: 0 });
        try {
          await chatModel.leave(clientId, roomId, socket.userId);
          if (socket.roomId === roomId) socket.roomId = null;
          callback?.({ ok: 1 });
        } catch (err) {
          callback?.({ ok: 0 });
        }
      });

      socket.on('disconnect', () => {
        console.log(`[${namespace}] 클라이언트 접속 해제`, socket.userId);
      });

      // 룸 정보 조회
      socket.on('roomInfo', async (roomId, callback) => {
        try {
          const dbRoom = await chatModel.findByRoomId(clientId, roomId);
          callback?.(dbRoom);
        } catch (err) {
          callback?.(null);
        }
      });
    });
  };

  handleNamespace(`/private-chat/sample`);
  DBConfig.clientIds.forEach(clientId => {
    handleNamespace(`/private-chat/${clientId}`);
  });
};

export default server;