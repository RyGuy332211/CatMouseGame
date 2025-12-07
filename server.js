const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { loginUser, registerUser } = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const lobbies = {};
const players = {};
const GAMES = {};
const MAP_SIZE = 2000;

function createGameState(lobbyId, playerIds) {
  const state = {
    id: lobbyId,
    players: {},
    terminals: [],
    exitOpen: false,
    exitLocation: { x: 0, y: 0 },
    timeLeft: 900,
    status: 'playing',
    winner: null
  };

  const catId = playerIds[Math.floor(Math.random() * playerIds.length)];

  playerIds.forEach(id => {
    state.players[id] = {
      id: id,
      role: id === catId ? 'cat' : 'mouse',
      x: Math.random() * MAP_SIZE - 1000,
      y: Math.random() * MAP_SIZE - 1000,
      hp: 100,
      speed: 300,
      isSprinting: false,
      sprintTime: 4,
      sprintCooldown: 0,
      dead: false
    };
  });

  for (let i = 0; i < 6; i++) {
    state.terminals.push({
      id: i,
      x: (Math.random() * MAP_SIZE) - (MAP_SIZE / 2),
      y: (Math.random() * MAP_SIZE) - (MAP_SIZE / 2),
      progress: 0,
      completed: false
    });
  }

  return state;
}

io.on('connection', (socket) => {
  socket.on('login', ({ username, password }) => {
    const regex = /^[a-zA-Z0-9.\-_]+$/;
    if (!regex.test(username)) {
      socket.emit('loginResponse', { success: false, message: 'Invalid characters' });
      return;
    }
    
    loginUser(username, password, (err, user) => {
      if (user) {
        players[socket.id] = { username: user.username, lobby: null };
        socket.emit('loginResponse', { success: true, username: user.username });
      } else {
        registerUser(username, password, (err, id) => {
          if (!err) {
            players[socket.id] = { username: username, lobby: null };
            socket.emit('loginResponse', { success: true, username: username });
          } else {
            socket.emit('loginResponse', { success: false, message: 'Taken or Error' });
          }
        });
      }
    });
  });

  socket.on('getLobbies', () => {
    const list = [];
    for (const [id, lobby] of Object.entries(lobbies)) {
      list.push({ id, players: lobby.players.map(p => players[p].username) });
    }
    socket.emit('lobbyList', list);
  });

  socket.on('createLobby', () => {
    const id = 'lobby_' + Math.random().toString(36).substr(2, 9);
    lobbies[id] = { players: [socket.id], timer: 30, started: false };
    players[socket.id].lobby = id;
    socket.join(id);
    socket.emit('joinedLobby', id);
    io.emit('lobbyUpdate');
  });

  socket.on('joinLobby', (lobbyId) => {
    if (lobbies[lobbyId] && lobbies[lobbyId].players.length < 5 && !lobbies[lobbyId].started) {
      lobbies[lobbyId].players.push(socket.id);
      players[socket.id].lobby = lobbyId;
      socket.join(lobbyId);
      socket.emit('joinedLobby', lobbyId);
      io.emit('lobbyUpdate');
    }
  });

  socket.on('playerInput', (input) => {
    const p = players[socket.id];
    if (!p || !p.lobby || !GAMES[p.lobby]) return;
    
    const game = GAMES[p.lobby];
    const playerState = game.players[socket.id];
    
    if (playerState.dead) return;

    let speed = playerState.speed;
    
    if (input.sprint && playerState.sprintCooldown <= 0 && playerState.sprintTime > 0) {
      speed *= 1.5;
      playerState.isSprinting = true;
    } else {
      playerState.isSprinting = false;
    }

    if (input.up) playerState.y -= speed * 0.016;
    if (input.down) playerState.y += speed * 0.016;
    if (input.left) playerState.x -= speed * 0.016;
    if (input.right) playerState.x += speed * 0.016;

    if (playerState.x < -MAP_SIZE/2) playerState.x = -MAP_SIZE/2;
    if (playerState.x > MAP_SIZE/2) playerState.x = MAP_SIZE/2;
    if (playerState.y < -MAP_SIZE/2) playerState.y = -MAP_SIZE/2;
    if (playerState.y > MAP_SIZE/2) playerState.y = MAP_SIZE/2;

    if (input.action) {
      if (playerState.role === 'cat') {
        for (const pid in game.players) {
          const target = game.players[pid];
          if (target.role === 'mouse' && !target.dead) {
            const dist = Math.hypot(playerState.x - target.x, playerState.y - target.y);
            if (dist < 50) {
              target.hp -= 40;
              target.speed += 200; 
              setTimeout(() => { if(!target.dead) target.speed -= 200; }, 2000);
              
              playerState.speed -= 100;
              setTimeout(() => { playerState.speed += 100; }, 2000);

              if (target.hp <= 0) target.dead = true;
            }
          }
        }
      } else {
        game.terminals.forEach(t => {
          if (!t.completed) {
            const dist = Math.hypot(playerState.x - t.x, playerState.y - t.y);
            if (dist < 60) {
              t.progress += (100 / 60) * 0.016; 
              if (t.progress >= 100) {
                t.progress = 100;
                t.completed = true;
                checkWinCondition(game);
              }
            }
          }
        });
      }
    }
  });

  socket.on('disconnect', () => {
    const p = players[socket.id];
    if (p && p.lobby) {
      const lobby = lobbies[p.lobby];
      if (lobby) {
        lobby.players = lobby.players.filter(id => id !== socket.id);
        
        if (GAMES[p.lobby]) {
          const game = GAMES[p.lobby];
          if (game.players[socket.id] && game.players[socket.id].role === 'cat') {
            game.winner = 'mice';
            io.to(p.lobby).emit('gameOver', 'mice');
            delete GAMES[p.lobby];
            delete lobbies[p.lobby];
          } else {
            game.players[socket.id].dead = true;
            const miceLeft = Object.values(game.players).filter(pl => pl.role === 'mouse' && !pl.dead);
            if (miceLeft.length === 0) {
              game.winner = 'cat';
              io.to(p.lobby).emit('gameOver', 'cat');
              delete GAMES[p.lobby];
              delete lobbies[p.lobby];
            }
          }
        } else if (lobby.players.length === 0) {
          delete lobbies[p.lobby];
        }
      }
    }
    delete players[socket.id];
  });
});

function checkWinCondition(game) {
  const completed = game.terminals.filter(t => t.completed).length;
  if (completed >= 5) {
    game.exitOpen = true;
  }
}

setInterval(() => {
  for (const lobbyId in lobbies) {
    const lobby = lobbies[lobbyId];
    if (!lobby.started && lobby.players.length >= 2) {
      lobby.timer -= 1;
      io.to(lobbyId).emit('lobbyTimer', lobby.timer);
      if (lobby.timer <= 0) {
        lobby.started = true;
        GAMES[lobbyId] = createGameState(lobbyId, lobby.players);
        io.to(lobbyId).emit('gameStart', GAMES[lobbyId]);
      }
    }
  }

  for (const gameId in GAMES) {
    const game = GAMES[gameId];
    game.timeLeft -= 0.05;

    for (const pid in game.players) {
      const p = game.players[pid];
      if (p.isSprinting) {
        p.sprintTime -= 0.05;
        if (p.sprintTime <= 0) {
          p.isSprinting = false;
          p.sprintCooldown = 20;
        }
      } else {
        if (p.sprintCooldown > 0) p.sprintCooldown -= 0.05;
        if (p.sprintCooldown <= 0 && p.sprintTime < 4) p.sprintTime = 4;
      }
    }

    if (game.timeLeft <= 0) {
      game.winner = 'cat';
      io.to(gameId).emit('gameOver', 'cat');
      delete GAMES[gameId];
      delete lobbies[gameId];
    } else {
      io.to(gameId).emit('gameState', game);
    }
  }
}, 50);

server.listen(3030, () => {
  console.log('Server running on port 3030');
});
