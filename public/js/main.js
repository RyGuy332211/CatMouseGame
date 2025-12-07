const socket = io();
let currentUser = null;
let currentLobby = null;

const loginScreen = document.getElementById('login-screen');
const menuScreen = document.getElementById('menu-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameUi = document.getElementById('game-ui');
const gameOverScreen = document.getElementById('game-over-screen');

document.getElementById('login-btn').addEventListener('click', () => {
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    socket.emit('login', { username: user, password: pass });
});

socket.on('loginResponse', (res) => {
    if (res.success) {
        currentUser = res.username;
        loginScreen.classList.add('hidden');
        menuScreen.classList.remove('hidden');
    } else {
        document.getElementById('login-msg').innerText = res.message;
    }
});

document.getElementById('create-lobby-btn').addEventListener('click', () => {
    socket.emit('createLobby');
});

document.getElementById('find-lobby-btn').addEventListener('click', () => {
    socket.emit('getLobbies');
});

socket.on('lobbyList', (list) => {
    const existing = document.getElementById('lobby-list-container');
    if (existing) existing.remove();
    
    const div = document.createElement('div');
    div.id = 'lobby-list-container';
    div.style.background = '#444';
    div.style.padding = '10px';
    div.style.position = 'absolute';
    div.style.top = '60%';
    div.style.left = '50%';
    div.style.transform = 'translate(-50%, 0)';
    div.style.zIndex = '100';
    div.style.pointerEvents = 'auto';

    list.forEach(l => {
        const btn = document.createElement('button');
        btn.innerText = `Lobby ${l.id} (${l.players.length}/5)`;
        btn.onclick = () => { socket.emit('joinLobby', l.id); div.remove(); };
        div.appendChild(btn);
    });
    
    const close = document.createElement('button');
    close.innerText = "Close";
    close.onclick = () => div.remove();
    div.appendChild(close);

    document.body.appendChild(div);
});

socket.on('joinedLobby', (id) => {
    currentLobby = id;
    menuScreen.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
});

socket.on('lobbyUpdate', () => {
    socket.emit('getLobbyInfo', currentLobby); 
});

socket.on('lobbyTimer', (time) => {
    document.getElementById('lobby-timer').innerText = `Starting in: ${time}`;
});

socket.on('gameStart', (initialState) => {
    lobbyScreen.classList.add('hidden');
    gameUi.classList.remove('hidden');
    startGame(initialState);
});

socket.on('gameOver', (winner) => {
    gameUi.classList.add('hidden');
    gameOverScreen.classList.remove('hidden');
    document.getElementById('winner-text').innerText = winner === 'cat' ? "CAT WINS" : "MICE WIN";
});
