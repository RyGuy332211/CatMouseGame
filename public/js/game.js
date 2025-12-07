let gameInstance;

function startGame(initialState) {
    // Destroy previous game instance if it exists to prevent memory leaks
    if (gameInstance) {
        gameInstance.destroy(true);
    }

    const config = {
        type: Phaser.AUTO,
        parent: 'game-container',
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: '#111111', // Darker background
        scene: {
            preload: preload,
            create: create,
            update: update
        }
    };
    gameInstance = new Phaser.Game(config);
}

let cursors;
let myRole = '';
let myId = socket.id;
let dynamicGraphics; // We will clear this every frame (players)
let staticGraphics;  // We will Draw this ONCE (grid)

function preload() {}

function create() {
    // 1. Draw the Static Grid (Optimized: Only runs once)
    staticGraphics = this.add.graphics();
    drawGrid(staticGraphics);

    // 2. Setup Dynamic Graphics (Players, Interactables)
    dynamicGraphics = this.add.graphics();

    // 3. Setup Controls
    cursors = this.input.keyboard.createCursorKeys();
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    // 4. Listen for Server Updates
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

// Convert 2D coords to Isometric coords
function toIso(x, y) {
    return {
        x: x - y,
        y: (x + y) / 2
    };
}

// Draw the grid once
function drawGrid(graphics) {
    const gridSize = 2000;
    const step = 100;
    
    graphics.lineStyle(2, 0x444444, 0.5); // Grey lines

    // Vertical Lines (in Iso)
    for (let x = -gridSize/2; x <= gridSize/2; x += step) {
        const start = toIso(x, -gridSize/2);
        const end = toIso(x, gridSize/2);
        graphics.moveTo(start.x, start.y);
        graphics.lineTo(end.x, end.y);
    }
    // Horizontal Lines (in Iso)
    for (let y = -gridSize/2; y <= gridSize/2; y += step) {
        const start = toIso(-gridSize/2, y);
        const end = toIso(gridSize/2, y);
        graphics.moveTo(start.x, start.y);
        graphics.lineTo(end.x, end.y);
    }
    graphics.strokePath();

    // Draw Map Border
    const tl = toIso(-gridSize/2, -gridSize/2);
    const tr = toIso(gridSize/2, -gridSize/2);
    const br = toIso(gridSize/2, gridSize/2);
    const bl = toIso(-gridSize/2, gridSize/2);
    
    graphics.lineStyle(4, 0xFFFFFF, 1); // White Border
    graphics.moveTo(tl.x, tl.y);
    graphics.lineTo(tr.x, tr.y);
    graphics.lineTo(br.x, br.y);
    graphics.lineTo(bl.x, bl.y);
    graphics.lineTo(tl.x, tl.y);
    graphics.strokePath();
}

function updateGame(scene, state) {
    const myPlayer = state.players[socket.id];
    if (!myPlayer) return;

    myRole = myPlayer.role;
    
    // Update UI
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

    // Center Camera
    const isoCam = toIso(myPlayer.x, myPlayer.y);
    scene.cameras.main.scrollX = isoCam.x - scene.cameras.main.width / 2;
    scene.cameras.main.scrollY = isoCam.y - scene.cameras.main.height / 2;

    // Clear dynamic objects only
    dynamicGraphics.clear();

    // Draw Exit if Open
    if (state.exitOpen) {
        const isoExit = toIso(0, 0); // Exit is at center (0,0) for now
        dynamicGraphics.fillStyle(0x00ff00, 0.3);
        dynamicGraphics.fillCircle(isoExit.x, isoExit.y, 100);
    }

    // Draw Terminals
    state.terminals.forEach(t => {
        const iso = toIso(t.x, t.y);
        const color = t.completed ? 0x00ff00 : 0xffff00;
        
        // Terminal Box
        dynamicGraphics.fillStyle(color, 1);
        dynamicGraphics.fillCircle(iso.x, iso.y, 15);
        
        // Progress Bar
        if (!t.completed) {
            dynamicGraphics.fillStyle(0xff0000, 1);
            dynamicGraphics.fillRect(iso.x - 20, iso.y - 40, 40, 6);
            dynamicGraphics.fillStyle(0x00ff00, 1);
            dynamicGraphics.fillRect(iso.x - 20, iso.y - 40, 40 * (t.progress/100), 6);
        }
    });

    // Draw Players
    for (const id in state.players) {
        const p = state.players[id];
        if (p.dead) continue;

        // Visibility Check (Fog of War)
        const dist = Math.hypot(p.x - myPlayer.x, p.y - myPlayer.y);
        // Can see: Yourself, teammates if you are mouse?, or anyone close
        // Rule: You can only see players on your screen (handled by camera clip usually, but here we do logic)
        // Simple logic: If far away and not exit open, don't draw? 
        // For now, let's keep drawing them if they are in render distance, fog of war comes later.
        
        const iso = toIso(p.x, p.y);
        const color = p.role === 'cat' ? 0xff0000 : 0x00aeef;
        
        // Draw Player Circle
        dynamicGraphics.fillStyle(color, 1);
        dynamicGraphics.fillCircle(iso.x, iso.y - 20, 10); // Elevated slightly
        
        // Draw Shadow
        dynamicGraphics.fillStyle(0x000000, 0.5);
        dynamicGraphics.fillEllipse(iso.x, iso.y, 10, 5);
    }
}
