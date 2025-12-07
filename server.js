const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { loginUser, registerUser } = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

const lobbies = {};
const players = {};
const GAMES = {};
const MAP_SIZE = 2000;
const TICK_RATE = 60; // 60 updates per second
const TICK_DELTA = 1 / TICK_RATE; 

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
      x: 0, 
      y: 0,
      hp: 100,
      speed: 300,
      isSprinting: false,
      sprintTime: 4,
      sprintCooldown: 0,
      maxSprintTime: 4,
      dead: false
    };
  });

  // Create Terminals Snapped to Grid (Multiples of 100)
  for (let i = 0; i < 6; i++) {
    let tx = Math.floor(Math.random() * (MAP_SIZE/100)) * 100 - (MAP_SIZE/2);
    let ty = Math.floor(Math.random() * (MAP_SIZE/100)) * 100 - (MAP_SIZE/2);
    state.terminals.push({
      id: i,
      x: tx,
      y: ty,
      progress: 0,
      completed: false
    });
  }

  return state;
}

io.on('connection', (socket) => {
  socket.on('login', ({ username, password }) => {
    const regex = /^[a-zA-Z0-9.\-_]+$/;
    if (!regex.test(username)) return socket.emit('loginResponse', { success: false, message: 'Invalid chars' });
    
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
            socket.emit('loginResponse', { success: false, message: 'Taken/Error' });
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
    const id = 'lobby_' + Math.random().toString(36).substr(2, 5);
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
    
    // Sprint Logic
    if (input.sprint && playerState.sprintCooldown <= 0 && playerState.sprintTime > 0) {
      speed *= 1.6; // Faster sprint
      playerState.isSprinting = true;
    } else {
      playerState.isSprinting = false;
    }

    // Movement
    if (input.up) playerState.y -= speed * TICK_DELTA;
    if (input.down) playerState.y += speed * TICK_DELTA;
    if (input.left) playerState.x -= speed * TICK_DELTA;
    if (input.right) playerState.x += speed * TICK_DELTA;

    // Clamp Map
    const limit = MAP_SIZE / 2;
    if (playerState.x < -limit) playerState.x = -limit;
    if (playerState.x > limit) playerState.x = limit;
    if (playerState.y < -limit) playerState.y = -limit;
    if (playerState.y > limit) playerState.y = limit;

    // Interaction (Attack / Repair)
    if (input.action) {
      if (playerState.role === 'cat') {
        for (const pid in game.players) {
          const target = game.players[pid];
          if (target.role === 'mouse' && !target.dead) {
            const dist = Math.hypot(playerState.x - target.x, playerState.y - target.y);
            if (dist < 80) { // Increased Range
              target.hp -= 40;
              target.speed += 300; // Zoomies on hit
              setTimeout(() => { if(!target.dead) target.speed -= 300; }, 2000);
              if (target.hp <= 0) target.dead = true;
            }
          }
        }
      } else {
        game.terminals.forEach(t => {
          if (!t.completed) {
            const dist = Math.hypot(playerState.x - t.x, playerState.y - t.y);
            if (dist < 100) { // Increased Range
              t.progress += (100 / 60) * TICK_DELTA * 10; // Faster repair for testing? No, keep it standard
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
    // ... (Keep existing disconnect logic if simple, or use this concise one)
    const p = players[socket.id];
    if (p && p.lobby && lobbies[p.lobby]) {
       lobbies[p.lobby].players = lobbies[p.lobby].players.filter(id => id !== socket.id);
       if(lobbies[p.lobby].players.length === 0) delete lobbies[p.lobby];
    }
    delete players[socket.id];
  });
});

function checkWinCondition(game) {
  const completed = game.terminals.filter(t => t.completed).length;
  if (completed >= 5) game.exitOpen = true;
}

// GAME LOOP (60 FPS)
setInterval(() => {
  // Lobby Timers
  for (const lobbyId in lobbies) {
    const lobby = lobbies[lobbyId];
    if (!lobby.started && lobby.players.length >= 2) {
      lobby.timer -= TICK_DELTA;
      if (lobby.timer <= 0) {
        lobby.started = true;
        GAMES[lobbyId] = createGameState(lobbyId, lobby.players);
        io.to(lobbyId).emit('gameStart', GAMES[lobbyId]);
      } else {
        // Only emit timer every second to save bandwidth
        if (Math.floor(lobby.timer) < Math.floor(lobby.timer + TICK_DELTA)) {
             io.to(lobbyId).emit('lobbyTimer', Math.ceil(lobby.timer));
        }
      }
    }
  }

  // Active Games
  for (const gameId in GAMES) {
    const game = GAMES[gameId];
    game.timeLeft -= TICK_DELTA;

    for (const pid in game.players) {
      const p = game.players[pid];
      
      // Sprint Logic Refined
      if (p.isSprinting) {
        p.sprintTime -= TICK_DELTA;
        if (p.sprintTime <= 0) {
          p.isSprinting = false;
          p.sprintTime = 0;
          p.sprintCooldown = 20; // Cooldown starts
        }
      } else {
        // If not sprinting, logic to recharge or cooldown
        if (p.sprintCooldown > 0) {
            p.sprintCooldown -= TICK_DELTA;
        } else if (p.sprintTime < p.maxSprintTime) {
            // Only recharge if cooldown is done
             // BUT user asked: Cooldown starts after sprint ends.
             // If they let go of shift before 0, we should trigger cooldown?
             // For simplicity: If sprintTime < Max and Not Sprinting -> Cooldown MUST finish before recharge
             if (p.sprintTime < p.maxSprintTime && p.sprintCooldown <= 0) {
                 // You stopped sprinting early. Trigger cooldown now.
                 p.sprintCooldown = 20;
             }
             if (p.sprintCooldown <= 0) {
                 p.sprintTime = p.maxSprintTime; // Instant recharge after 20s or slow? User implies logic: Sprint -> Cooldown -> Full Sprint
             }
        }
      }
    }

    if (game.timeLeft <= 0) {
      io.to(gameId).emit('gameOver', 'cat');
      delete GAMES[gameId];
      delete lobbies[gameId];
    } else {
      io.to(gameId).emit('gameState', game);
    }
  }
}, 1000 / TICK_RATE); // ~16.6ms

server.listen(3030, () => {
  console.log('Server running on port 3030');
});
