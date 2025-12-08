cconst express = require('express');
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

// CHANGED: 240 Updates Per Second
const TICK_RATE = 240; 
const TICK_DELTA = 1 / TICK_RATE; 

function createGameState(lobbyId, playerIds) {
  const state = {
    id: lobbyId,
    players: {},
    terminals: [],
    exitOpen: false,
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

  // Create Terminals Snapped to Grid
  for (let i = 0; i < 6; i++) {
    let tx = Math.floor(Math.random() * (MAP_SIZE/100)) * 100 - (MAP_SIZE/2);
    let ty = Math.floor(Math.random() * (MAP_SIZE/100)) * 100 - (MAP_SIZE/2);
    state.terminals.push({ id: i, x: tx, y: ty, progress: 0, completed: false });
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
    
    if (!playerState || playerState.dead) return;

    let speed = playerState.speed;
    
    // Sprint Logic
    if (input.sprint && playerState.sprintCooldown <= 0 && playerState.sprintTime > 0) {
      speed *= 1.6;
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
          // Can only hit LIVING mice
          if (target.role === 'mouse' && !target.dead) {
            const dist = Math.hypot(playerState.x - target.x, playerState.y - target.y);
            if (dist < 80) { 
              // HIT!
              target.hp -= 40;
              
              // FIX: Clamp HP at 0
              if (target.hp <= 0) {
                  target.hp = 0;
                  target.dead = true;
                  checkGameEnd(game, p.lobby);
              } else {
                  // Only apply speed boost if still alive
                  target.speed += 300; 
                  setTimeout(() => { if(!target.dead) target.speed -= 300; }, 2000);
              }

              // Cat slows down
              playerState.speed -= 100;
              setTimeout(() => { playerState.speed += 100; }, 2000);
            }
          }
        }
      } else {
        // Mouse Repair Logic
        game.terminals.forEach(t => {
          if (!t.completed) {
            const dist = Math.hypot(playerState.x - t.x, playerState.y - t.y);
            if (dist < 100) {
              t.progress += (100 / 60) * TICK_DELTA * 10; 
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
    
    // 1. Remove from Lobby List
    if (p && p.lobby && lobbies[p.lobby]) {
       lobbies[p.lobby].players = lobbies[p.lobby].players.filter(id => id !== socket.id);
       if(lobbies[p.lobby].players.length === 0) {
           delete lobbies[p.lobby];
       }
    }

    // 2. Handle ACTIVE GAME Disconnects
    if (p && p.lobby && GAMES[p.lobby]) {
        const game = GAMES[p.lobby];
        const playerState = game.players[socket.id];
        
        if (playerState) {
            // Mark them as dead/gone
            playerState.dead = true;
            delete game.players[socket.id]; // Remove from object so they don't count towards logic

            // Check Win Conditions immediately
            if (playerState.role === 'cat') {
                // Cat left -> Mice Win
                io.to(p.lobby).emit('gameOver', 'mice');
                delete GAMES[p.lobby];
            } else {
                // Mouse left -> Check if any mice remain
                checkGameEnd(game, p.lobby);
            }
        }
    }

    delete players[socket.id];
  });
});

function checkWinCondition(game) {
  const completed = game.terminals.filter(t => t.completed).length;
  if (completed >= 5) game.exitOpen = true;
}

function checkGameEnd(game, lobbyId) {
    // Count living mice
    const miceLeft = Object.values(game.players).filter(pl => pl.role === 'mouse' && !pl.dead).length;
    
    if (miceLeft === 0) {
        io.to(lobbyId).emit('gameOver', 'cat');
        delete GAMES[lobbyId];
        delete lobbies[lobbyId];
    }
}

// GAME LOOP (240 FPS)
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
      
      // Sprint
      if (p.isSprinting) {
        p.sprintTime -= TICK_DELTA;
        if (p.sprintTime <= 0) {
          p.isSprinting = false;
          p.sprintTime = 0;
          p.sprintCooldown = 20; 
        }
      } else {
         if (p.sprintCooldown > 0) {
            p.sprintCooldown -= TICK_DELTA;
         } else if (p.sprintTime < p.maxSprintTime) {
             // Logic: If you stopped sprinting early, trigger cooldown
             if (p.sprintTime < p.maxSprintTime && p.sprintCooldown <= 0) {
                 p.sprintCooldown = 20;
             }
             if (p.sprintCooldown <= 0) {
                 p.sprintTime = p.maxSprintTime;
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
}, 1000 / TICK_RATE); // approx 4.16ms

server.listen(3030, () => {
  console.log('Server running on port 3030 at 240 FPS Tick Rate');
});
