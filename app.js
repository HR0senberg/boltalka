// Application State
const appState = {
    currentScreen: 'welcome',
    myPeerId: null,
    myRoomCode: null,
    isInitiator: false,
    peer: null,
    connection: null,
    messages: [],
    connectionStatus: 'disconnected'
};

// In-memory room registry (shared across tabs via window.name hack or URL)
if (!window.roomRegistry) {
    window.roomRegistry = {};
}

// Configuration
const config = {
    stunServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// DOM Elements
const screens = {
    welcome: document.getElementById('welcomeScreen'),
    roomCreated: document.getElementById('roomCreatedScreen'),
    chat: document.getElementById('chatScreen')
};

const elements = {
    // Welcome screen
    createRoomBtn: document.getElementById('createRoomBtn'),
    joinRoomBtn: document.getElementById('joinRoomBtn'),
    roomCodeInput: document.getElementById('roomCodeInput'),
    errorMessage: document.getElementById('errorMessage'),
    
    // Room created screen
    displayRoomCode: document.getElementById('displayRoomCode'),
    copyCodeBtn: document.getElementById('copyCodeBtn'),
    myPeerIdDisplay: document.getElementById('myPeerIdDisplay'),
    
    // Chat screen
    chatRoomCode: document.getElementById('chatRoomCode'),
    connectionStatus: document.getElementById('connectionStatus'),
    messagesContainer: document.getElementById('messagesContainer'),
    messageInput: document.getElementById('messageInput'),
    sendMessageBtn: document.getElementById('sendMessageBtn'),
    leaveRoomBtn: document.getElementById('leaveRoomBtn')
};

// Utility Functions
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function validateRoomCode(code) {
    return /^[A-Z0-9]{6}$/.test(code);
}

function showScreen(screenName) {
    Object.keys(screens).forEach(key => {
        screens[key].classList.remove('active');
    });
    screens[screenName].classList.add('active');
    appState.currentScreen = screenName;
}

function showError(message) {
    elements.errorMessage.textContent = message;
    setTimeout(() => {
        elements.errorMessage.textContent = '';
    }, 3000);
}

function formatTime(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

// Message Functions
function addMessage(type, text, timestamp = new Date()) {
    const message = { type, text, timestamp };
    appState.messages.push(message);
    displayMessage(message);
}

function displayMessage(message) {
    const messageEl = document.createElement('div');
    messageEl.className = `message message-${message.type}`;
    
    const textEl = document.createElement('div');
    textEl.textContent = message.text;
    messageEl.appendChild(textEl);
    
    if (message.type !== 'system') {
        const timeEl = document.createElement('span');
        timeEl.className = 'message-timestamp';
        timeEl.textContent = formatTime(message.timestamp);
        messageEl.appendChild(timeEl);
    }
    
    elements.messagesContainer.appendChild(messageEl);
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

function sendMessage() {
    const text = elements.messageInput.value.trim();
    if (!text) return;
    
    if (appState.connection && appState.connection.open) {
        appState.connection.send({
            type: 'message',
            text: text,
            timestamp: new Date().toISOString()
        });
        
        addMessage('own', text);
        elements.messageInput.value = '';
    } else {
        showError('Нет подключения к пиру');
    }
}

// Connection Status
function updateConnectionStatus(status) {
    appState.connectionStatus = status;
    const statusEl = elements.connectionStatus;
    
    statusEl.classList.remove('connected', 'disconnected');
    
    if (status === 'connected') {
        statusEl.classList.add('connected');
        statusEl.querySelector('.status-text').textContent = 'Подключено';
    } else if (status === 'disconnected') {
        statusEl.classList.add('disconnected');
        statusEl.querySelector('.status-text').textContent = 'Отключено';
    } else {
        statusEl.querySelector('.status-text').textContent = 'Подключение...';
    }
}

// PeerJS Functions
function initializePeer() {
    return new Promise((resolve, reject) => {
        try {
            const peer = new Peer({
                config: {
                    iceServers: config.stunServers
                }
            });
            
            peer.on('open', (id) => {
                console.log('Peer initialized with ID:', id);
                appState.myPeerId = id;
                resolve(peer);
            });
            
            peer.on('error', (error) => {
                console.error('Peer error:', error);
                reject(error);
            });
            
            peer.on('disconnected', () => {
                console.log('Peer disconnected');
                updateConnectionStatus('disconnected');
            });
            
            appState.peer = peer;
        } catch (error) {
            reject(error);
        }
    });
}

function setupConnection(conn) {
    appState.connection = conn;
    
    conn.on('open', () => {
        console.log('Connection opened');
        updateConnectionStatus('connected');
        addMessage('system', 'Подключен к пиру');
        
        if (appState.currentScreen !== 'chat') {
            showScreen('chat');
            elements.chatRoomCode.textContent = appState.myRoomCode;
        }
    });
    
    conn.on('data', (data) => {
        console.log('Received data:', data);
        if (data.type === 'message') {
            addMessage('other', data.text, new Date(data.timestamp));
        }
    });
    
    conn.on('close', () => {
        console.log('Connection closed');
        updateConnectionStatus('disconnected');
        addMessage('system', 'Пир отключился');
    });
    
    conn.on('error', (error) => {
        console.error('Connection error:', error);
        showError('Ошибка подключения');
    });
}

// Room Creation
async function createRoom() {
    try {
        const roomCode = generateRoomCode();
        appState.myRoomCode = roomCode;
        appState.isInitiator = true;
        
        const peer = await initializePeer();
        
        // Store room info in memory
        const roomData = {
            code: roomCode,
            peerId: appState.myPeerId,
            timestamp: Date.now()
        };
        window.roomRegistry[roomCode] = roomData;
        
        // Display room code
        elements.displayRoomCode.textContent = roomCode;
        elements.myPeerIdDisplay.textContent = appState.myPeerId;
        
        // Listen for incoming connections
        peer.on('connection', (conn) => {
            console.log('Incoming connection from:', conn.peer);
            setupConnection(conn);
        });
        
        showScreen('roomCreated');
    } catch (error) {
        console.error('Error creating room:', error);
        showError('Ошибка создания комнаты');
    }
}

// Room Joining
async function joinRoom() {
    const roomCode = elements.roomCodeInput.value.trim().toUpperCase();
    
    if (!validateRoomCode(roomCode)) {
        showError('Пожалуйста, введите правильный код (6 символов)');
        return;
    }
    
    try {
        // Get room info from memory
        const roomData = window.roomRegistry[roomCode];
        
        if (!roomData) {
            showError('Комната не найдена. Убедитесь, что создатель комнаты открыл её в этой же вкладке или введите Peer ID напрямую.');
            return;
        }
        const hostPeerId = roomData.peerId;
        
        appState.myRoomCode = roomCode;
        appState.isInitiator = false;
        
        const peer = await initializePeer();
        
        // Connect to host
        updateConnectionStatus('connecting');
        const conn = peer.connect(hostPeerId, {
            reliable: true
        });
        
        setupConnection(conn);
        
        // Go to chat screen
        showScreen('chat');
        elements.chatRoomCode.textContent = roomCode;
        addMessage('system', 'Присоединились к комнате');
        
    } catch (error) {
        console.error('Error joining room:', error);
        showError('Ошибка подключения к комнате');
    }
}

// Leave Room
function leaveRoom() {
    if (appState.connection) {
        appState.connection.close();
    }
    
    if (appState.peer) {
        appState.peer.destroy();
    }
    
    // Clean up room data if initiator
    if (appState.isInitiator && appState.myRoomCode) {
        delete window.roomRegistry[appState.myRoomCode];
    }
    
    // Reset state
    appState.myPeerId = null;
    appState.myRoomCode = null;
    appState.isInitiator = false;
    appState.peer = null;
    appState.connection = null;
    appState.messages = [];
    appState.connectionStatus = 'disconnected';
    
    // Clear UI
    elements.messagesContainer.innerHTML = '';
    elements.roomCodeInput.value = '';
    elements.messageInput.value = '';
    
    showScreen('welcome');
}

// Event Listeners
elements.createRoomBtn.addEventListener('click', createRoom);

elements.joinRoomBtn.addEventListener('click', joinRoom);

elements.roomCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinRoom();
    }
});

elements.copyCodeBtn.addEventListener('click', async () => {
    const code = elements.displayRoomCode.textContent;
    try {
        await navigator.clipboard.writeText(code);
        elements.copyCodeBtn.textContent = '✅ Скопировано!';
        setTimeout(() => {
            elements.copyCodeBtn.textContent = '📋 Скопировать';
        }, 2000);
    } catch (error) {
        console.error('Failed to copy:', error);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = code;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            elements.copyCodeBtn.textContent = '✅ Скопировано!';
            setTimeout(() => {
                elements.copyCodeBtn.textContent = '📋 Скопировать';
            }, 2000);
        } catch (err) {
            showError('Не удалось скопировать');
        }
        document.body.removeChild(textArea);
    }
});

// Copy Peer ID button (after it's created in DOM)
setTimeout(() => {
    const copyPeerIdBtn = document.getElementById('copyPeerIdBtn');
    if (copyPeerIdBtn) {
        copyPeerIdBtn.addEventListener('click', async () => {
            const peerId = elements.myPeerIdDisplay.textContent;
            try {
                await navigator.clipboard.writeText(peerId);
                copyPeerIdBtn.textContent = '✅ Скопировано!';
                setTimeout(() => {
                    copyPeerIdBtn.textContent = '📋 Скопировать ID';
                }, 2000);
            } catch (error) {
                console.error('Failed to copy:', error);
                const textArea = document.createElement('textarea');
                textArea.value = peerId;
                document.body.appendChild(textArea);
                textArea.select();
                try {
                    document.execCommand('copy');
                    copyPeerIdBtn.textContent = '✅ Скопировано!';
                    setTimeout(() => {
                        copyPeerIdBtn.textContent = '📋 Скопировать ID';
                    }, 2000);
                } catch (err) {
                    showError('Не удалось скопировать');
                }
                document.body.removeChild(textArea);
            }
        });
    }
}, 100);

elements.sendMessageBtn.addEventListener('click', sendMessage);

elements.messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

elements.leaveRoomBtn.addEventListener('click', () => {
    if (confirm('Вы уверены, что хотите покинуть комнату?')) {
        leaveRoom();
    }
});



// Initialize
console.log('P2P Chat Application loaded');
console.log('Ready to create or join rooms');