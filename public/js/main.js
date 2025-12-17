const socket = io();
let currentUser = null;
let currentLobby = null;

// DOM Elements
const mainMenu = document.getElementById('main-menu');
const lobbyScreen = document.getElementById('lobby-screen');
const gameUi = document.getElementById('game-ui');
const gameOverScreen = document.getElementById('game-over-screen');

const panelLogin = document.getElementById('panel-login');
const panelSettings = document.getElementById('panel-settings');

// --- MAIN MENU NAVIGATION ---

document.getElementById('btn-start').addEventListener('click', () => {
    // Show Login, Hide Settings
    panelLogin.classList.remove('hidden-right');
    panelLogin.classList.add('visible-right');
    
    panelSettings.classList.remove('visible-right');
    panelSettings.classList.add('hidden-right');
});

document.getElementById('btn-settings').addEventListener('click', () => {
    // Show Settings, Hide Login
    panelSettings.classList.remove('hidden-right');
    panelSettings.classList.add('visible-right');

    panelLogin.classList.remove('visible-right');
    panelLogin.classList.add('hidden-right');
});

document.getElementById('btn-exit').addEventListener('click', () => {
    // Try to close, or just reload/redirect
    if(confirm("Exit Game?")) {
        window.close(); // Often blocked by browsers
        location.href = "about:blank"; // Fallback
    }
});

document.getElementById('close-settings').addEventListener('click', () => {
    panelSettings.classList.remove('visible-right');
    panelSettings.classList.add('hidden-right');
});

// --- LOGIN LOGIC ---

document.getElementById('login-submit-btn').addEventListener('click', () => {
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    if(user && pass) {
        socket.emit('login', { username: user, password: pass });
    }
});

socket.on('loginResponse', (res) => {
    if (res.success) {
        currentUser = res.username;
        // Hide Main Menu completely
        mainMenu.classList.add('hidden');
        // Show Lobby
        lobbyScreen.classList.remove('hidden');
    } else {
        document.getElementById('login-msg').innerText = res.message;
        document.getElementById('login-msg').style.color = "red";
    }
});

// --- LOBBY LOGIC ---

document.getElementById('create-lobby-btn').addEventListener('click', () => {
    socket.emit('createLobby');
});

document.getElementById('find-lobby-btn').addEventListener('click', () => {
    socket.emit('getLobbies');
});

socket.on('lobbyList', (list) => {
    const existing = document.getElementById('lobby-list-overlay');
    if (existing) existing.remove();
    
    const div = document.createElement('div');
    div.id = 'lobby-list-overlay';
    div.style.background = 'rgba(0,0,0,0.9)';
    div.style.padding = '20px';
    div.style.position = 'absolute';
    div.style.top = '50%';
    div.style.left = '50%';
    div.style.transform = 'translate(-50%, -50%)';
    div.style.zIndex = '200';
    div.style.border = '2px solid white';
    div.style.minWidth = '300px';

    const h3 = document.createElement('h3');
    h3.innerText = "Available Lobbies";
    div.appendChild(h3);

    if(list.length === 0) {
        const p = document.createElement('p');
        p.innerText = "No lobbies found.";
        div.appendChild(p);
    }

    list.forEach(l => {
        const btn = document.createElement('button');
        btn.innerText = `Lobby ${l.id} (${l.players.length}/5)`;
        btn.style.margin = '5px 0';
        btn.onclick = () => { socket.emit('joinLobby', l.id); div.remove(); };
        div.appendChild(btn);
    });
    
    const close = document.createElement('button');
    close.innerText = "Cancel";
    close.style.marginTop = "10px";
    close.style.background = "#800";
    close.onclick = () => div.remove();
    div.appendChild(close);

    document.body.appendChild(div);
});

socket.on('joinedLobby', (id) => {
    currentLobby = id;
    const lobbyDisplay = document.getElementById('active-lobby-display');
    lobbyDisplay.innerHTML = `<h2>Lobby: ${id}</h2><h3 id="lobby-timer">Waiting for players...</h3><ul id="player-list"></ul>`;
});

socket.on('lobbyUpdate', () => {
    // Refresh info if needed, mainly handled by waiting for timer/start
});

socket.on('lobbyTimer', (time) => {
    const timerEl = document.getElementById('lobby-timer');
    if(timerEl) timerEl.innerText = `Starting in: ${time}`;
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
