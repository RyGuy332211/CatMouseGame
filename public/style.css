const socket = io();
let currentUser = null;
let currentLobby = null;

const mainMenu = document.getElementById('main-menu');
const lobbyScreen = document.getElementById('lobby-screen');
const gameUi = document.getElementById('game-ui');
const gameOverScreen = document.getElementById('game-over-screen');

const panelLogin = document.getElementById('panel-login');
const panelSettings = document.getElementById('panel-settings');

function closeAllPanels() {
    panelLogin.classList.remove('visible-right');
    panelLogin.classList.add('hidden-right');
    panelSettings.classList.remove('visible-right');
    panelSettings.classList.add('hidden-right');
}

document.getElementById('btn-start').addEventListener('click', () => {
    const isLoginOpen = panelLogin.classList.contains('visible-right');
    closeAllPanels();
    if (!isLoginOpen) {
        panelLogin.classList.remove('hidden-right');
        panelLogin.classList.add('visible-right');
    }
});

document.getElementById('btn-settings').addEventListener('click', () => {
    const isSettingsOpen = panelSettings.classList.contains('visible-right');
    closeAllPanels();
    if (!isSettingsOpen) {
        panelSettings.classList.remove('hidden-right');
        panelSettings.classList.add('visible-right');
    }
});

document.getElementById('close-settings').addEventListener('click', () => {
    closeAllPanels();
});

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
        mainMenu.classList.add('hidden');
        lobbyScreen.classList.remove('hidden');
    } else {
        const msg = document.getElementById('login-msg');
        msg.innerText = res.message;
        msg.style.color = "#ff5555";
        msg.style.marginTop = "10px";
    }
});

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
    div.style.background = 'rgba(0,0,0,0.95)';
    div.style.padding = '40px';
    div.style.position = 'absolute';
    div.style.top = '50%';
    div.style.left = '50%';
    div.style.transform = 'translate(-50%, -50%)';
    div.style.zIndex = '200';
    div.style.border = '4px solid white';
    div.style.borderRadius = '20px';
    div.style.minWidth = '400px';
    div.style.textAlign = 'center';

    const h3 = document.createElement('h3');
    h3.innerText = "Available Lobbies";
    h3.style.fontFamily = "'Luckiest Guy', cursive";
    h3.style.fontSize = "45px";
    h3.style.color = "#AEEEEE";
    h3.style.marginTop = "0";
    h3.style.letterSpacing = "2px";
    div.appendChild(h3);

    if(list.length === 0) {
        const p = document.createElement('p');
        p.innerText = "No lobbies found.";
        p.style.color = "#bbb";
        p.style.fontFamily = "'Nunito', sans-serif";
        p.style.fontSize = "20px";
        div.appendChild(p);
    }

    list.forEach(l => {
        const btn = document.createElement('button');
        btn.innerText = `Lobby ${l.id} (${l.players.length}/5)`;
        btn.style.margin = '10px 0';
        btn.onclick = () => { socket.emit('joinLobby', l.id); div.remove(); };
        div.appendChild(btn);
    });
    
    const close = document.createElement('button');
    close.innerText = "Cancel";
    close.style.marginTop = "20px";
    close.style.background = "#555";
    close.onclick = () => div.remove();
    div.appendChild(close);

    document.body.appendChild(div);
});

socket.on('joinedLobby', (id) => {
    currentLobby = id;
    const lobbyDisplay = document.getElementById('active-lobby-display');
    lobbyDisplay.innerHTML = `<h2>Lobby: ${id}</h2><h3 id="lobby-timer">Waiting for players...</h3><ul id="player-list"></ul>`;
    const h2 = lobbyDisplay.querySelector('h2');
    h2.style.fontFamily = "'Luckiest Guy', cursive";
    h2.style.fontSize = "40px";
    h2.style.letterSpacing = "2px";
    
    const h3 = lobbyDisplay.querySelector('h3');
    h3.style.fontFamily = "'Nunito', sans-serif";
});

socket.on('lobbyUpdate', () => {});

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
