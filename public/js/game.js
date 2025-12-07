let gameInstance;

function startGame(initialState) {
    const config = {
        type: Phaser.AUTO,
        parent: 'game-container',
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: '#000000',
        scene: {
            preload: preload,
            create: create,
            update: update
        }
    };
    gameInstance = new Phaser.Game(config);
}

let playerSprites = {};
let terminalSprites = [];
let cursors;
let myRole = '';
let myId = socket.id;
let exitZone;

function preload() {}

function create() {
    this.graphics = this.add.graphics();
    cursors = this.input.keyboard.createCursorKeys();
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    socket.on('gameState', (state) => {
        updateGame(this, state);
    });
}

function update() {
    const input = {
        up: cursors.up.isDown || this.input.keyboard.keys[87].isDown,
        down: cursors.down.isDown || this.input.keyboard.keys[83].isDown,
        left: cursors.left.isDown || this.input.keyboard.keys[65].isDown,
        right: cursors.right.isDown || this.input.keyboard.keys[68].isDown,
        sprint: this.input.keyboard.keys[16].isDown,
        action: this.input.keyboard.keys[32].isDown
    };
    socket.emit('playerInput', input);
}

function toIso(x, y) {
    return {
        x: x - y,
        y: (x + y) / 2
    };
}

function updateGame(scene, state) {
    const myPlayer = state.players[socket.id];
    if (!myPlayer) return;

    myRole = myPlayer.role;
    document.getElementById('role-display').innerText = `Role: ${myRole.toUpperCase()}`;
    document.getElementById('hp-bar').innerText = `HP: ${myPlayer.hp}`;
    document.getElementById('timer-display').innerText = `Time: ${Math.floor(state.timeLeft)}`;
    
    if(myPlayer.sprintCooldown > 0) {
        document.getElementById('sprint-bar').innerText = `Sprint CD: ${Math.floor(myPlayer.sprintCooldown)}`;
        document.getElementById('sprint-bar').style.color = 'red';
    } else {
        document.getElementById('sprint-bar').innerText = `Sprint READY`;
        document.getElementById('sprint-bar').style.color = 'lime';
    }

    const completedTerminals = state.terminals.filter(t => t.completed).length;
    document.getElementById('terminals-left').innerText = `Terminals: ${completedTerminals}/5`;

    scene.graphics.clear();

    const camX = myPlayer.x;
    const camY = myPlayer.y;

    scene.cameras.main.scrollX = toIso(camX, camY).x - scene.cameras.main.width / 2;
    scene.cameras.main.scrollY = toIso(camX, camY).y - scene.cameras.main.height / 2;

    const gridSize = 2000;
    const step = 100;
    scene.graphics.lineStyle(1, 0x333333);
    for (let x = -gridSize/2; x <= gridSize/2; x += step) {
        const start = toIso(x, -gridSize/2);
        const end = toIso(x, gridSize/2);
        scene.graphics.moveTo(start.x, start.y);
        scene.graphics.lineTo(end.x, end.y);
    }
    for (let y = -gridSize/2; y <= gridSize/2; y += step) {
        const start = toIso(-gridSize/2, y);
        const end = toIso(gridSize/2, y);
        scene.graphics.moveTo(start.x, start.y);
        scene.graphics.lineTo(end.x, end.y);
    }

    if (state.exitOpen) {
        const isoExit = toIso(0, 0);
        scene.graphics.fillStyle(0x00ff00, 0.3);
        scene.graphics.fillCircle(isoExit.x, isoExit.y, 100);
        scene.graphics.fillStyle(0xffffff, 1);
        const exitText = "EXIT"; 
    }

    state.terminals.forEach(t => {
        const iso = toIso(t.x, t.y);
        const color = t.completed ? 0x00ff00 : 0xffff00;
        scene.graphics.fillStyle(color, 1);
        scene.graphics.fillRect(iso.x - 15, iso.y - 15, 30, 30);
        
        if (!t.completed) {
            scene.graphics.fillStyle(0xff0000, 1);
            scene.graphics.fillRect(iso.x - 20, iso.y - 30, 40, 5);
            scene.graphics.fillStyle(0x00ff00, 1);
            scene.graphics.fillRect(iso.x - 20, iso.y - 30, 40 * (t.progress/100), 5);
        }
    });

    for (const id in state.players) {
        const p = state.players[id];
        if (p.dead) continue;

        const dist = Math.hypot(p.x - myPlayer.x, p.y - myPlayer.y);
        if (id !== socket.id && dist > 600 && !state.exitOpen) continue; 

        const iso = toIso(p.x, p.y);
        const color = p.role === 'cat' ? 0xff0000 : 0x0000ff;
        
        scene.graphics.fillStyle(color, 1);
        scene.graphics.fillCircle(iso.x, iso.y, 15);
        
        scene.graphics.fillStyle(0xffffff, 1);
        const nameText = players[id] ? players[id].username : "Player";
    }
}
