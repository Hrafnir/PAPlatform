/* Version: #10 */
/* === GLOBAL CONFIGURATION & UTILS === */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
// Slår av antialiasing for pixel-art look
ctx.imageSmoothingEnabled = false;

const UI = {
    studioOverlay: document.getElementById('studio-ui'),
    jsonContainer: document.getElementById('json-output-container'),
    jsonTextarea: document.getElementById('jsonOutput'),
    closeJsonBtn: document.getElementById('close-json'),
    modeIndicator: document.getElementById('studio-mode-indicator'),
    frameCounter: document.getElementById('frame-counter'),
    scoreDisplay: document.getElementById('score-display'),
    debugInfo: document.getElementById('debug-info'),
    fileInput: document.getElementById('spriteUpload'),
    studioHeader: document.querySelector('.studio-header'),
    studioHelp: document.querySelector('.studio-help')
};

// Logger funksjon
function log(msg) {
    console.log(`[System]: ${msg}`);
}

/* === INPUT MODULE === */
const Input = {
    keys: {},
    keysPressed: {}, 
    mouse: { x: 0, y: 0, isDown: false, downX: 0, downY: 0 },

    init() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight", "Space"].indexOf(e.code) > -1) {
                e.preventDefault();
            }
            if (e.code === 'F1') {
                e.preventDefault();
                App.toggleStudio();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
            this.keysPressed[e.code] = false; 
        });

        // Mouse Events
        window.addEventListener('mousedown', (e) => {
            if (e.target === canvas) {
                this.mouse.isDown = true;
                this.mouse.downX = e.clientX - canvas.getBoundingClientRect().left;
                this.mouse.downY = e.clientY - canvas.getBoundingClientRect().top;
                
                if (Studio.active) Studio.onMouseDown(this.mouse.downX, this.mouse.downY);
            }
        });

        window.addEventListener('mouseup', () => {
            this.mouse.isDown = false;
            if (Studio.active) Studio.onMouseUp();
        });

        window.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
            
            if (Studio.active) Studio.onMouseMove(this.mouse.x, this.mouse.y);
        });

        canvas.addEventListener('wheel', (e) => {
            if (Studio.active) {
                e.preventDefault();
                Studio.zoom(e.deltaY, this.mouse.x, this.mouse.y);
            }
        }, { passive: false });
    },

    isDown(code) { return this.keys[code] === true; },
    isPressed(code) {
        if (this.keys[code] && !this.keysPressed[code]) {
            this.keysPressed[code] = true;
            return true;
        }
        return false;
    }
};

/* === RESOURCES MODULE === */
const Resources = {
    spritesheet: null,
    
    init() {
        // 1. Prøv å laste standard spritesheet automatisk
        const defaultImg = new Image();
        defaultImg.src = 'sprites/PA.png';
        defaultImg.onload = () => {
            this.spritesheet = defaultImg;
            log("Lastet sprites/PA.png automatisk.");
            Studio.resetView();
        };
        defaultImg.onerror = () => {
            log("Kunne ikke laste 'sprites/PA.png'. Bruk manuell opplasting (F1).");
        };

        // 2. Håndter manuell opplasting (Fallback)
        UI.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    this.spritesheet = img;
                    log("Nytt spritesheet lastet opp manuelt.");
                    Studio.resetView();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });

        UI.closeJsonBtn.addEventListener('click', () => {
            UI.jsonContainer.classList.add('hidden');
        });
    }
};

/* === ANIMATION STUDIO MODULE === */
const Studio = {
    active: false,
    frames: [], 
    currentFrame: { x: 0, y: 0, w: 32, h: 32, ax: 16, ay: 32 },
    view: { x: 0, y: 0, scale: 2.0 },
    dragMode: 'NONE', 
    dragOffset: { x: 0, y: 0 }, 

    toggle() {
        this.active = !this.active;
        if (this.active) UI.studioOverlay.classList.remove('hidden');
        else UI.studioOverlay.classList.add('hidden');
    },

    resetView() {
        this.view.x = canvas.width / 2;
        this.view.y = canvas.height / 2;
        this.view.scale = 2.0;
    },

    screenToWorld(sx, sy) {
        return {
            x: (sx - this.view.x) / this.view.scale,
            y: (sy - this.view.y) / this.view.scale
        };
    },

    zoom(delta, mouseX, mouseY) {
        const zoomSpeed = 0.1;
        const oldScale = this.view.scale;
        let newScale = delta < 0 ? oldScale + zoomSpeed : oldScale - zoomSpeed;
        newScale = Math.max(0.1, newScale);
        const worldPos = this.screenToWorld(mouseX, mouseY);
        this.view.scale = newScale;
        this.view.x = mouseX - (worldPos.x * newScale);
        this.view.y = mouseY - (worldPos.y * newScale);
    },

    onMouseDown(mx, my) {
        const wMouse = this.screenToWorld(mx, my);
        const f = this.currentFrame;
        
        const anchorScreenX = (f.x + f.ax) * this.view.scale + this.view.x;
        const anchorScreenY = (f.y + f.ay) * this.view.scale + this.view.y;
        const distAnchor = Math.hypot(mx - anchorScreenX, my - anchorScreenY);
        
        if (distAnchor < 15) {
            this.dragMode = 'ANCHOR';
            this.dragOffset = { x: f.ax - (wMouse.x - f.x), y: f.ay - (wMouse.y - f.y) };
            return;
        }

        const handleScreenX = (f.x + f.w) * this.view.scale + this.view.x;
        const handleScreenY = (f.y + f.h) * this.view.scale + this.view.y;
        const distHandle = Math.hypot(mx - handleScreenX, my - handleScreenY);

        if (distHandle < 15) {
            this.dragMode = 'RESIZE';
            this.dragOffset = { x: f.w - (wMouse.x - f.x), y: f.h - (wMouse.y - f.y) };
            return;
        }

        if (wMouse.x >= f.x && wMouse.x <= f.x + f.w && wMouse.y >= f.y && wMouse.y <= f.y + f.h) {
            this.dragMode = 'BOX';
            this.dragOffset = { x: wMouse.x - f.x, y: wMouse.y - f.y };
            return;
        }

        this.dragMode = 'PAN';
        this.dragOffset = { x: mx - this.view.x, y: my - this.view.y };
    },

    onMouseUp() {
        this.dragMode = 'NONE';
    },

    onMouseMove(mx, my) {
        const wMouse = this.screenToWorld(mx, my);
        const f = this.currentFrame;

        if (this.dragMode === 'NONE') {
            const anchorScreenX = (f.x + f.ax) * this.view.scale + this.view.x;
            const anchorScreenY = (f.y + f.ay) * this.view.scale + this.view.y;
            const distAnchor = Math.hypot(mx - anchorScreenX, my - anchorScreenY);
            const handleScreenX = (f.x + f.w) * this.view.scale + this.view.x;
            const handleScreenY = (f.y + f.h) * this.view.scale + this.view.y;
            const distHandle = Math.hypot(mx - handleScreenX, my - handleScreenY);

            if (distAnchor < 15) canvas.style.cursor = 'crosshair';
            else if (distHandle < 15) canvas.style.cursor = 'nwse-resize';
            else if (wMouse.x >= f.x && wMouse.x <= f.x + f.w && wMouse.y >= f.y && wMouse.y <= f.y + f.h) canvas.style.cursor = 'move';
            else canvas.style.cursor = 'default';
        }

        if (this.dragMode === 'PAN') {
            this.view.x = mx - this.dragOffset.x;
            this.view.y = my - this.dragOffset.y;
        } 
        else if (this.dragMode === 'BOX') {
            f.x = Math.round(wMouse.x - this.dragOffset.x);
            f.y = Math.round(wMouse.y - this.dragOffset.y);
        } 
        else if (this.dragMode === 'RESIZE') {
            let newW = Math.round(wMouse.x - f.x);
            let newH = Math.round(wMouse.y - f.y);
            if (newW < 1) newW = 1;
            if (newH < 1) newH = 1;
            f.w = newW;
            f.h = newH;
        } 
        else if (this.dragMode === 'ANCHOR') {
            f.ax = Math.round(wMouse.x - f.x);
            f.ay = Math.round(wMouse.y - f.y);
        }
    },

    update() {
        if (!this.active) return;
        if (Input.isPressed('Enter')) {
            const frameData = { ...this.currentFrame };
            this.frames.push(frameData);
            this.currentFrame.x += this.currentFrame.w; 
            UI.frameCounter.textContent = `Frame: ${this.frames.length}`;
            log("Frame lagret.");
        }
        if (Input.isPressed('KeyF')) {
            UI.jsonTextarea.value = JSON.stringify(this.frames, null, 2);
            UI.jsonContainer.classList.remove('hidden');
        }
        if (Input.isPressed('Tab')) {
            this.mode = this.mode === 'BOX' ? 'ANCHOR' : 'BOX';
            UI.modeIndicator.textContent = `MODE: ${this.mode}`;
        }
    },

    draw() {
        if (!this.active) return;

        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        this.drawGrid();

        ctx.save();
        ctx.translate(this.view.x, this.view.y);
        ctx.scale(this.view.scale, this.view.scale);

        if (Resources.spritesheet) {
            ctx.drawImage(Resources.spritesheet, 0, 0);
        } else {
            ctx.fillStyle = '#555';
            ctx.font = '10px Arial';
            ctx.fillText("Ingen bilde. Prøver å laste sprites/PA.png...", 10, 10);
        }

        if (this.frames.length > 0) {
            const prev = this.frames[this.frames.length - 1];
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1 / this.view.scale;
            ctx.strokeRect(prev.x, prev.y, prev.w, prev.h);
        }

        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 1 / this.view.scale;
        for (let f of this.frames) ctx.strokeRect(f.x, f.y, f.w, f.h);

        const c = this.currentFrame;
        ctx.strokeStyle = '#ff0055'; 
        ctx.lineWidth = 2 / this.view.scale;
        ctx.strokeRect(c.x, c.y, c.w, c.h);

        const handleSize = 6 / this.view.scale;
        ctx.fillStyle = 'white';
        ctx.fillRect(c.x + c.w - handleSize, c.y + c.h - handleSize, handleSize, handleSize);

        const worldAx = c.x + c.ax;
        const worldAy = c.y + c.ay;
        const crossSize = 5 / this.view.scale;
        ctx.strokeStyle = '#00ffff'; 
        ctx.beginPath();
        ctx.moveTo(worldAx - crossSize, worldAy);
        ctx.lineTo(worldAx + crossSize, worldAy);
        ctx.moveTo(worldAx, worldAy - crossSize);
        ctx.lineTo(worldAx, worldAy + crossSize);
        ctx.stroke();

        ctx.restore();
    },

    drawGrid() {
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < canvas.width; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
        for (let y = 0; y < canvas.height; y += 50) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
        ctx.stroke();
    }
};

/* === GAME ENGINE MODULE === */
const Game = {
    running: true,
    gravity: 0.5,
    friction: 0.85,
    camera: { x: 0, y: 0 },

    spriteDefs: {
        "idle": [
          { "x": 15, "y": 13, "w": 134, "h": 290, "ax": 57, "ay": 43 },
          { "x": 353, "y": 14, "w": 134, "h": 290, "ax": 57, "ay": 43 },
          { "x": 819, "y": 15, "w": 134, "h": 290, "ax": 57, "ay": 43 }
        ], 
        "run":  [
          { "x": 14, "y": 335, "w": 147, "h": 271, "ax": 86, "ay": 42 },
          { "x": 351, "y": 335, "w": 147, "h": 271, "ax": 86, "ay": 42 },
          { "x": 524, "y": 334, "w": 147, "h": 271, "ax": 86, "ay": 44 },
          { "x": 909, "y": 336, "w": 159, "h": 270, "ax": 107, "ay": 41 }
        ],
        "jump": [ { "x": 15, "y": 13, "w": 134, "h": 290, "ax": 57, "ay": 43 } ],
        "fall": [ { "x": 15, "y": 13, "w": 134, "h": 290, "ax": 57, "ay": 43 } ]
    },

    player: {
        scale: 0.35, // NY: Skaleringsfaktor (35% av originalstørrelsen)
        
        x: 100, y: 300, 
        w: 30, h: 95, // NY: Justert hitbox til å matche 0.35 skala (134*0.35 = 47, men vi vil ha den smalere. 290*0.35 = 101)
        
        vx: 0, vy: 0, 
        speed: 4, // NY: Økt hastighet siden figuren er mindre
        jumpForce: -12,
        grounded: false, facingRight: true, state: 'idle',
        coyoteTimer: 0, jumpBuffer: 0,
        animTimer: 0, animFrame: 0, 
        animSpeed: 8 
    },

    platforms: [
        { x: 0, y: 600, w: 2000, h: 200 },
        { x: 500, y: 550, w: 100, h: 50 },
        { x: 600, y: 500, w: 100, h: 100 },
        { x: 700, y: 450, w: 100, h: 150 },
        { x: 800, y: 300, w: 50, h: 300 },
        { x: 200, y: 450, w: 150, h: 20 },
        { x: 50, y: 350, w: 100, h: 20 },
        { x: 250, y: 250, w: 150, h: 20 },
        { x: 400, y: 150, w: 400, h: 20 }
    ],

    update() {
        if (Studio.active) return; 

        const p = this.player;
        const prevState = p.state;

        if (Input.isDown('KeyD') || Input.isDown('ArrowRight')) {
            p.vx += p.speed;
            p.facingRight = true;
        }
        if (Input.isDown('KeyA') || Input.isDown('ArrowLeft')) {
            p.vx -= p.speed;
            p.facingRight = false;
        }

        p.vx *= this.friction;
        p.vy += this.gravity;

        if (Input.isPressed('Space') || Input.isPressed('ArrowUp')) p.jumpBuffer = 10;
        if (p.grounded) p.coyoteTimer = 10;
        else if (p.coyot
