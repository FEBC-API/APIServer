/* global io */
// WebSocket 클라이언트 예제
class WebSocketClient {
    constructor() {
        this.socket = null;
        this.currentRoomId = null;
        this.isConnected = false;
        this.initElements();
        this.bindEvents();
        this.setDefaultServerUrl();
    }

    initElements() {
        // DOM 요소들
        this.elements = {
            serverUrl: document.getElementById('serverUrl'),
            userId: document.getElementById('userId'),
            nickName: document.getElementById('nickName'),
            roomName: document.getElementById('roomName'),
            
            connectBtn: document.getElementById('connectBtn'),
            createRoomBtn: document.getElementById('createRoomBtn'),
            joinRoomBtn: document.getElementById('joinRoomBtn'),
            leaveRoomBtn: document.getElementById('leaveRoomBtn'),
            disconnectBtn: document.getElementById('disconnectBtn'),
            cleanRoomsBtn: document.getElementById('cleanRoomsBtn'),
            
            statusDot: document.getElementById('statusDot'),
            statusText: document.getElementById('statusText'),
            socketId: document.getElementById('socketId'),
            
            messages: document.getElementById('messages'),
            messageInput: document.getElementById('messageInput'),
            sendBtn: document.getElementById('sendBtn'),
            
            memberCount: document.getElementById('memberCount'),
            memberList: document.getElementById('memberList'),
            // Room 목록 패널
            roomListPanel: document.getElementById('roomListPanel')
        };
        // 사용자 ID를 'user-' + 무작위 6자리 영숫자 문자열로 자동 설정
        this.elements.userId.value = 'user-' + Math.random().toString(36).slice(2, 8);
        // 닉네임을 '테스터-' + 무작위 4자리 숫자로 자동 설정
        this.elements.nickName.value = '테스터-' + Math.floor(1000 + Math.random() * 9000);
    }

    setDefaultServerUrl() {
        this.elements.serverUrl.value = `${window.location.origin}/ws/sample`;
    }

    bindEvents() {
        // 버튼 이벤트
        this.elements.connectBtn.addEventListener('click', () => this.connect());
        this.elements.disconnectBtn.addEventListener('click', () => this.disconnect());
        this.elements.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.elements.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        this.elements.leaveRoomBtn.addEventListener('click', () => this.leaveRoom());
        this.elements.cleanRoomsBtn.addEventListener('click', () => this.cleanRooms());
        this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
        
        // 소스코드 보기 버튼
        document.getElementById('showHtmlBtn').addEventListener('click', () => this.toggleSourceCode('html'));
        document.getElementById('showJsBtn').addEventListener('click', () => this.toggleSourceCode('js'));
        
        // 엔터키로 메시지 전송
        this.elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
    }

    connect() {
        const serverUrl = this.elements.serverUrl.value.trim();
        if (!serverUrl) {
            this.addMessage('시스템', '서버 URL을 입력해주세요.', 'system');
            return;
        }

        this.addMessage('시스템', '서버에 연결 중...', 'system');
        
        try {
            this.socket = io(serverUrl);
            this.setupSocketEvents();
        } catch (error) {
            this.addMessage('시스템', `연결 실패: ${error.message}`, 'system');
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.updateConnectionStatus(false);
        this.updateMemberList({});
        this.addMessage('시스템', '연결이 해제되었습니다.', 'system');
    }

    setupSocketEvents() {
        this.socket.on('connect', () => {
            this.isConnected = true;
            this.updateConnectionStatus(true);
            this.addMessage('시스템', `서버에 연결되었습니다. Socket ID: ${this.socket.id}`, 'system');
            // 연결 시 Room 목록 요청 (콜백으로 받아오기)
            this.socket.emit('rooms', (roomList) => {
                this.renderRoomList(roomList);
            });
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            this.updateConnectionStatus(false);
            this.updateMemberList({});
            this.addMessage('시스템', '서버와의 연결이 끊어졌습니다.', 'system');
        });

        this.socket.on('message', (data) => {
            this.handleMessage(data);
        });

        this.socket.on('members', (memberList) => {
            this.updateMemberList(memberList);
        });

        this.socket.on('rooms', (roomList) => {
            this.addMessage('시스템', `서버 Room 목록 업데이트: ${Object.keys(roomList).length}개`, 'system');
            this.renderRoomList(roomList);
        });

        this.socket.on('connect_error', (error) => {
            this.addMessage('시스템', `연결 오류: ${error.message}`, 'system');
        });
    }

    createRoom() {
        if (!this.isConnected) {
            this.addMessage('시스템', '먼저 서버에 연결해주세요.', 'system');
            return;
        }

        const roomData = {
            user_id: this.elements.userId.value.trim(),
            hostName: this.elements.nickName.value.trim(),
            roomName: this.elements.roomName.value.trim(),
            capacity: 10,
            autoClose: true
        };

        if (!roomData.roomName) {
            this.addMessage('시스템', '서버 Room 이름을 입력해주세요.', 'system');
            return;
        }

        this.socket.emit('createRoom', roomData, (response) => {
            if (response.ok) {
                this.currentRoomId = response.roomInfo.roomId;
                this.addMessage('시스템', `서버 Room 생성 성공: ${response.roomInfo.roomName} - ${response.roomInfo.roomId}`, 'system');
                this.updateButtonStates();
            } else {
                this.addMessage('시스템', `서버 Room 생성 실패: ${response.message}`, 'system');
            }
        });
    }

    // Room 목록 렌더링 함수 추가
    renderRoomList(roomList) {
        const panel = this.elements.roomListPanel;
        panel.innerHTML = '';
        const roomArray = Object.values(roomList);
        if (roomArray.length === 0) {
            panel.innerHTML = '<div style="color:#6b7280;">서버 Room이 없습니다.</div>';
            return;
        }
        roomArray.forEach(room => {
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.justifyContent = 'space-between';
            div.style.padding = '8px 0';
            div.style.borderBottom = '1px solid #e5e7eb';
            div.innerHTML = `
                <span><b>${room.roomName}</b> <span style='color:#6b7280;font-size:0.9em;'>(${room.roomId})</span> <span style='color:#10b981;'>[${room.memberCount||0}/${room.capacity||'제한없음'}]</span></span>
                <button class='btn btn-success btn-join-room' data-room-id='${room.roomId}'>입장</button>
            `;
            panel.appendChild(div);
        });
        // 입장 버튼 이벤트 바인딩
        panel.querySelectorAll('.btn-join-room').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const roomId = btn.getAttribute('data-room-id');
                this.joinRoom(roomId);
            });
        });
    }

    // joinRoom 오버로드: roomId 파라미터 있으면 해당 Room으로 입장
    joinRoom(roomId) {
        if (!this.isConnected) {
            this.addMessage('시스템', '먼저 서버에 연결해주세요.', 'system');
            return;
        }
        // roomId가 명시적으로 들어오면 해당 Room으로 입장, 아니면 기존 방식
        const targetRoomId = roomId || this.currentRoomId;
        if (!targetRoomId) {
            this.addMessage('시스템', '입장할 서버 Room을 선택하거나 생성해주세요.', 'system');
            return;
        }
        const joinData = {
            roomId: targetRoomId,
            user_id: this.elements.userId.value.trim(),
            nickName: this.elements.nickName.value.trim()
        };
        this.socket.emit('joinRoom', joinData, (response) => {
            if (response.ok) {
                this.currentRoomId = response.roomInfo.roomId;
                this.addMessage('시스템', `서버 Room 입장 성공: ${response.roomInfo.roomName}`, 'system');
                this.updateButtonStates();
                this.elements.messageInput.disabled = false;
                this.elements.sendBtn.disabled = false;
            } else {
                this.addMessage('시스템', `서버 Room 입장 실패: ${response.message}`, 'system');
            }
        });
    }

    leaveRoom() {
        if (this.socket) {
            this.socket.emit('leaveRoom');
            this.addMessage('시스템', '서버 Room에서 나갔습니다.', 'system');
            this.elements.messageInput.disabled = true;
            this.elements.sendBtn.disabled = true;
            this.updateMemberList({});
        }
    }

    cleanRooms() {
        if (this.socket) {
            this.socket.emit('cleanRooms');
            this.addMessage('시스템', '모든 서버 Room을 정리했습니다.', 'system');
            this.currentRoomId = null;
            this.updateButtonStates();
        }
    }

    sendMessage() {
        const message = this.elements.messageInput.value.trim();
        if (!message) return;

        if (this.socket) {
            this.socket.emit('message', message);
            this.elements.messageInput.value = '';
        }
    }

    handleMessage(data) {
        const messageType = data.nickName === '시스템' ? 'system' : 'user';
        let messageContent = data.msg;
        
        // 시스템 메시지가 객체인 경우 처리
        if (typeof data.msg === 'object') {
            messageContent = `[${data.msg.action}] ${data.msg.msg}`;
        }
        
        this.addMessage(data.nickName, messageContent, messageType);
    }

    addMessage(sender, content, type = 'user') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        const now = new Date();
        const timeString = now.toLocaleTimeString();
        
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="message-sender">${sender}</span>
                <span class="message-time">${timeString}</span>
            </div>
            <div class="message-content">${content}</div>
        `;
        
        this.elements.messages.appendChild(messageDiv);
        this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
    }

    updateMemberList(memberList) {
        const memberArray = Object.entries(memberList);
        this.elements.memberCount.textContent = memberArray.length;
        
        this.elements.memberList.innerHTML = '';
        memberArray.forEach(([userId, memberInfo]) => {
            const memberTag = document.createElement('div');
            memberTag.className = 'member-tag';
            memberTag.textContent = memberInfo.nickName;
            this.elements.memberList.appendChild(memberTag);
        });
    }

    updateConnectionStatus(connected) {
        this.isConnected = connected;
        
        if (connected) {
            this.elements.statusDot.className = 'status-dot connected';
            this.elements.statusText.textContent = '연결됨';
            this.elements.socketId.textContent = `Socket ID: ${this.socket.id}`;
        } else {
            this.elements.statusDot.className = 'status-dot';
            this.elements.statusText.textContent = '연결 안됨';
            this.elements.socketId.textContent = '';
            this.currentRoomId = null;
            // 연결이 끊어지면 멤버 목록도 초기화
            this.updateMemberList({});
            // 메시지 입력도 비활성화
            this.elements.messageInput.disabled = true;
            this.elements.sendBtn.disabled = true;
        }
        
        this.updateButtonStates();
    }

    updateButtonStates() {
        // 연결 상태에 따른 버튼 활성화/비활성화
        this.elements.connectBtn.disabled = this.isConnected;
        this.elements.disconnectBtn.disabled = !this.isConnected;
        this.elements.createRoomBtn.disabled = !this.isConnected;
        this.elements.joinRoomBtn.disabled = !this.isConnected || !this.currentRoomId;
        this.elements.leaveRoomBtn.disabled = !this.isConnected;
        this.elements.cleanRoomsBtn.disabled = !this.isConnected;
        
        // 입력 필드 상태
        this.elements.serverUrl.disabled = this.isConnected;
    }

    async toggleSourceCode(type) {
        const sourceId = type === 'html' ? 'htmlSource' : 'jsSource';
        const contentId = type === 'html' ? 'htmlCodeContent' : 'jsCodeContent';
        const fileName = type === 'html' ? 'example.html' : 'example.js';
        
        const sourceElement = document.getElementById(sourceId);
        
        if (sourceElement.style.display === 'none') {
            // 소스코드 보이기
            sourceElement.style.display = 'block';
            
            // 파일 내용 로드
            try {
                const response = await fetch(fileName);
                if (response.ok) {
                    const sourceCode = await response.text();
                    document.getElementById(contentId).textContent = sourceCode;
                } else {
                    document.getElementById(contentId).textContent = '파일을 불러올 수 없습니다.';
                }
            } catch (error) {
                document.getElementById(contentId).textContent = `오류: ${error.message}`;
            }
        } else {
            // 소스코드 숨기기
            sourceElement.style.display = 'none';
        }
    }
}

// 전역 함수로 토글 기능 제공 (HTML onclick 용)
function toggleSource(sourceId) {
    const element = document.getElementById(sourceId);
    element.style.display = 'none';
}

// 페이지 로드 시 클라이언트 초기화
document.addEventListener('DOMContentLoaded', () => {
    new WebSocketClient();
}); 