/* Version: #4 */
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
    fileInput: document.getElementById('spriteUpload')
};

// Logger funksjon
function log(msg) {
    console.log(`[System]: ${msg}`);
}

/* === INPUT MODULE === */
const Input = {
    keys: {},
    keysPressed: {}, // For å registrere kun ett trykk (ikke hold)
    mouse: { x: 0, y: 0, isDown: false, scroll: 0 },

    init() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            // Hindre scrolling med piler/space hvis spillet er i fokus, men tillat F1/F5 etc.
            if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight", "Space"].indexOf(e.code) > -1) {
                e.preventDefault();
            }
            
            // Toggle Studio med F1
            if (e.code === 'F1') {
                e.preventDefault();
                App.toggleStudio();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
            this.keysPressed[e.code] = false; // Reset "pressed" state
        });

        // Mouse events for Studio Pan/Zoom
        canvas.addEventListener('mousedown', (e) => {
            this.mouse.isDown = true;
            this.mouse.lastX = e.clientX;
            this.mouse.lastY = e.clientY;
        });
        window.addEventListener('mouseup', () => this.mouse.isDown = false);
        canvas.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX - canvas.getBoundingClientRect().left;
            this.mouse.y = e.clientY - canvas.getBoundingClientRect().top;
            
            if (this.mouse.isDown && Studio.active) {
                const dx = e.clientX - this.mouse.lastX;
                const dy = e.clientY - this.mouse.lastY;
                Studio.pan(dx, dy);
                this.mouse.lastX = e.clientX;
                this.mouse.lastY = e.clientY;
            }
        });
        canvas.addEventListener('wheel', (e) => {
            if (Studio.active) {
                e.preventDefault();
                Studio.zoom(e.deltaY);
            }
        }, { passive: false });
    },

    isDown(code) {
        return this.keys[code] === true;
    },

    // Returnerer true KUN første frame knappen trykkes
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
    spritesheet: null, // Det aktive bildet
    
    init() {
        UI.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    this.spritesheet = img;
                    log("Nytt spritesheet lastet opp: " + file.name + " (" + img.width + "x" + img.height + ")");
                    Studio.resetView(); // Sentrer visning
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
    frames: [], // Liste med definerte frames {x, y, w, h, ax, ay}
    
    // Editor State
    currentFrame: { x: 0, y: 0, w: 32, h: 32, ax: 16, ay: 32 },
    mode: 'BOX', // 'BOX' (Red) eller 'ANCHOR' (Cyan)
    
    // Viewport State (Pan/Zoom)
    view: { x: 0, y: 0, scale: 1.0 },

    toggle() {
        this.active = !this.active;
        if (this.active) {
            UI.studioOverlay.classList.remove('hidden');
            log("Studio Mode: AKTIV");
        } else {
            UI.studioOverlay.classList.add('hidden');
            log("Studio Mode: DEAKTIVERT");
        }
    },

    resetView() {
        this.view.x = canvas.width / 2;
        this.view.y = canvas.height / 2;
        this.view.scale = 2.0;
    },

    pan(dx, dy) {
        this.view.x += dx;
        this.view.y += dy;
    },

    zoom(delta) {
        const zoomSpeed = 0.1;
        if (delta < 0) this.view.scale += zoomSpeed;
        else this.view.scale = Math.max(0.1, this.view.scale - zoomSpeed);
    },

    update() {
        if (!this.active) return;

        // Modifiers
        let speed = 1;
        if (Input.isDown('ShiftLeft')) speed = 5;
        if (Input.isDown('ControlLeft')) speed = 0.25; // Finjustering

        // Mode Switching
        if (Input.isPressed('Tab')) {
            this.mode = this.mode === 'BOX' ? 'ANCHOR' : 'BOX';
            UI.modeIndicator.textContent = `MODE: ${this.mode} (${this.mode === 'BOX' ? 'Red' : 'Cyan'})`;
        }

        // Editing Logic
        if (this.mode === 'BOX') {
            // Move Box Position
            if (Input.isPressed('ArrowLeft') || (Input.isDown('ArrowLeft') && speed > 1)) this.currentFrame.x -= speed;
            if (Input.isPressed('ArrowRight') || (Input.isDown('ArrowRight') && speed > 1)) this.currentFrame.x += speed;
            if (Input.isPressed('ArrowUp') || (Input.isDown('ArrowUp') && speed > 1)) this.currentFrame.y -= speed;
            if (Input.isPressed('ArrowDown') || (Input.isDown('ArrowDown') && speed > 1)) this.currentFrame.y += speed;

            // Resize Box
            if (Input.isPressed('KeyA') || (Input.isDown('KeyA') && speed > 1)) this.currentFrame.w -= speed;
            if (Input.isPressed('KeyD') || (Input.isDown('KeyD') && speed > 1)) this.currentFrame.w += speed;
            if (Input.isPressed('KeyW') || (Input.isDown('KeyW') && speed > 1)) this.currentFrame.h -= speed;
            if (Input.isPressed('KeyS') || (Input.isDown('KeyS') && speed > 1)) this.currentFrame.h += speed;
        } else {
            // Move Anchor Point
            if (Input.isPressed('ArrowLeft') || (Input.isDown('ArrowLeft') && speed > 1)) this.currentFrame.ax -= speed;
            if (Input.isPressed('ArrowRight') || (Input.isDown('ArrowRight') && speed > 1)) this.currentFrame.ax += speed;
            if (Input.isPressed('ArrowUp') || (Input.isDown('ArrowUp') && speed > 1)) this.currentFrame.ay -= speed;
            if (Input.isPressed('ArrowDown') || (Input.isDown('ArrowDown') && speed > 1)) this.currentFrame.ay += speed;
        }

        // Save & Next
        if (Input.isPressed('Enter')) {
            // Klon objektet
            const frameData = { ...this.currentFrame };
            this.frames.push(frameData);
            log(`Frame ${this.frames.length} lagret.`);
            
            // Flytt boksen til høyre for neste frame automatisk
            this.currentFrame.x += this.currentFrame.w; 
            
            UI.frameCounter.textContent = `Frame: ${this.frames.length}`;
        }

        // Generate JSON
        if (Input.isPressed('KeyF')) {
            const json = JSON.stringify(this.frames, null, 2);
            UI.jsonTextarea.value = json;
            UI.jsonContainer.classList.remove('hidden');
            log("JSON generert.");
        }
    },

    draw() {
        if (!this.active) return;

        // Bakgrunn for Studio (mørk grå)
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Grid
        this.drawGrid();

        ctx.save();
        // Påfør Pan/Zoom transformasjon
        ctx.translate(this.view.x, this.view.y);
        ctx.scale(this.view.scale, this.view.scale);

        if (Resources.spritesheet) {
            ctx.drawImage(Resources.spritesheet, 0, 0);
        } else {
            ctx.fillStyle = '#333';
            ctx.font = '20px Arial';
            ctx.fillText("Ingen bilde lastet. Last opp spritesheet (F1)", 10, 50);
        }

        // 1. Onion Skin (Vis forrige frame svakt)
        if (this.frames.length > 0) {
            const prev = this.frames[this.frames.length - 1];
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.strokeRect(prev.x, prev.y, prev.w, prev.h);
        }

        // 2. Tegn alle lagrede frames (grønn)
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 1 / this.view.scale; // Hold linjen tynn uansett zoom
        for (let f of this.frames) {
            ctx.strokeRect(f.x, f.y, f.w, f.h);
        }

        // 3. Tegn NÅVÆRENDE Redigeringsboks (Rød)
        const c = this.currentFrame;
        ctx.strokeStyle = '#ff0055'; // Rød
        ctx.lineWidth = 2 / this.view.scale;
        ctx.strokeRect(c.x, c.y, c.w, c.h);

        // 4. Tegn Ankerpunkt (Cyan Kryss)
        const worldAx = c.x + c.ax;
        const worldAy = c.y + c.ay;
        const crossSize = 5 / this.view.scale;

        ctx.strokeStyle = '#00ffff'; // Cyan
        ctx.beginPath();
        ctx.moveTo(worldAx - crossSize, worldAy);
        ctx.lineTo(worldAx + crossSize, worldAy);
        ctx.moveTo(worldAx, worldAy - crossSize);
        ctx.lineTo(worldAx, worldAy + crossSize);
        ctx.stroke();

        ctx.restore();
    },

    drawGrid() {
        ctx.strokeStyle = '#333';
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
    
    // Camera
    camera: { x: 0, y: 0 },

    // --- SPRITE DEFINITIONS ---
    // Her skal du lime inn JSON fra Studioet senere.
    spriteDefs: {
        "idle": [], 
        "run":  [],
        "jump": [],
        "fall": []
    },

    // Entities
    player: {
        x: 100, y: 300,
        w: 32, h: 48, // Hitbox størrelse (kollisjon)
        vx: 0, vy: 0,
        speed: 1,
        jumpForce: -12,
        grounded: false,
        facingRight: true,
        state: 'idle', // idle, run, jump, fall
        coyoteTimer: 0, 
        jumpBuffer: 0,
        
        // Animation State
        animTimer: 0,
        animFrame: 0,
        animSpeed: 8 // Hvor mange game-frames per anim-frame (lavere = raskere)
    },

    // Et mer komplekst testbrett
    platforms: [
        { x: 0, y: 600, w: 2000, h: 200 }, // Hovedgulv
        
        // Trapper oppover til høyre
        { x: 500, y: 550, w: 100, h: 50 },
        { x: 600, y: 500, w: 100, h: 100 },
        { x: 700, y: 450, w: 100, h: 150 },
        
        // En vegg man kan stange i
        { x: 800, y: 300, w: 50, h: 300 },
        
        // Svevende plattformer
        { x: 200, y: 450, w: 150, h: 20 },
        { x: 50, y: 350, w: 100, h: 20 },
        { x: 250, y: 250, w: 150, h: 20 },
        
        // Et tak høyt oppe
        { x: 400, y: 150, w: 400, h: 20 }
    ],

    update() {
        if (Studio.active) return; 

        const p = this.player;
        const prevState = p.state;

        // --- INPUT & PHYSICS ---
        
        // Horizontal Movement
        if (Input.isDown('KeyD') || Input.isDown('ArrowRight')) {
            p.vx += p.speed;
            p.facingRight = true;
        }
        if (Input.isDown('KeyA') || Input.isDown('ArrowLeft')) {
            p.vx -= p.speed;
            p.facingRight = false;
        }

        // Friction & Gravity
        p.vx *= this.friction;
        p.vy += this.gravity;

        // Jump Buffer
        if (Input.isPressed('Space') || Input.isPressed('ArrowUp')) {
            p.jumpBuffer = 10;
        }

        // Coyote Time
        if (p.grounded) {
            p.coyoteTimer = 10;
        } else {
            if (p.coyoteTimer > 0) p.coyoteTimer--;
        }
        if (p.jumpBuffer > 0) p.jumpBuffer--;

        // Jump Logic
        if (p.jumpBuffer > 0 && p.coyoteTimer > 0) {
            p.vy = p.jumpForce;
            p.grounded = false;
            p.coyoteTimer = 0;
            p.jumpBuffer = 0;
        }

        // --- COLLISION DETECTION (AABB) ---
        p.grounded = false;

        // X-Axis
        p.x += p.vx;
        for (let plat of this.platforms) {
            if (this.checkRectCollide(p, plat)) {
                if (p.vx > 0) p.x = plat.x - p.w;
                else if (p.vx < 0) p.x = plat.x + plat.w;
                p.vx = 0;
            }
        }

        // Y-Axis
        p.y += p.vy;
        for (let plat of this.platforms) {
            if (this.checkRectCollide(p, plat)) {
                if (p.vy > 0) { // Lander
                    p.y = plat.y - p.h;
                    p.grounded = true;
                    p.vy = 0;
                } else if (p.vy < 0) { // Tak
                    p.y = plat.y + plat.h;
                    p.vy = 0;
                }
            }
        }

        if (p.y > 2000) { p.x = 100; p.y = 300; p.vy = 0; }

        // --- STATE MACHINE ---
        if (!p.grounded) {
            p.state = p.vy < 0 ? 'jump' : 'fall';
        } else {
            p.state = Math.abs(p.vx) > 0.5 ? 'run' : 'idle';
        }

        // Reset animasjon hvis state endres
        if (p.state !== prevState) {
            p.animTimer = 0;
            p.animFrame = 0;
        }

        // --- CAMERA LERP ---
        const targetX = p.x + p.w / 2 - canvas.width / 2;
        const targetY = p.y + p.h / 2 - canvas.height / 2;
        this.camera.x += (targetX - this.camera.x) * 0.1;
        this.camera.y += (targetY - this.camera.y) * 0.1; 
    },

    checkRectCollide(r1, r2) {
        return (r1.x < r2.x + r2.w &&
                r1.x + r1.w > r2.x &&
                r1.y < r2.y + r2.h &&
                r1.y + r1.h > r2.y);
    },

    draw() {
        if (Studio.active) return;

        // Clear Background
        ctx.fillStyle = '#6fa8dc';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(-Math.floor(this.camera.x), -Math.floor(this.camera.y));

        // Draw Platforms
        ctx.fillStyle = '#666';
        for (let plat of this.platforms) {
            ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
            ctx.fillStyle = '#4a6';
            ctx.fillRect(plat.x, plat.y, plat.w, 10);
            ctx.fillStyle = '#666';
        }

        // Draw Player
        this.drawPlayer();

        ctx.restore();
    },

    drawPlayer() {
        const p = this.player;
        
        ctx.save();
        
        // Posisjoner basert på hitboxens bunn-senter (Anchor point logic)
        // Vi antar at ax/ay i spritesheetet er definert relativt til føttene.
        const anchorXTarget = p.x + p.w / 2;
        const anchorYTarget = p.y + p.h;

        ctx.translate(anchorXTarget, anchorYTarget);
        if (!p.facingRight) ctx.scale(-1, 1); 

        // Hent riktig animasjons-array
        const anim = this.spriteDefs[p.state];
        
        if (Resources.spritesheet && anim && anim.length > 0) {
            // Animasjons-logikk
            p.animTimer++;
            const frameIndex = Math.floor(p.animTimer / p.animSpeed) % anim.length;
            const f = anim[frameIndex];

            // Tegn bildet. 
            // -f.ax og -f.ay sørger for at ankerpunktet havner på (0,0) i canvas-contexten
            ctx.drawImage(Resources.spritesheet, f.x, f.y, f.w, f.h, -f.ax, -f.ay, f.w, f.h);
            
            // Debug: Tegn ankerpunkt
            // ctx.fillStyle = 'cyan'; ctx.fillRect(-1, -1, 2, 2);

        } else {
            // FALLBACK (Farget boks) hvis ingen animasjon er definert ennå
            ctx.fillStyle = p.state === 'jump' || p.state === 'fall' ? '#ff0055' : '#ffcc00';
            ctx.fillRect(-p.w/2, -p.h, p.w, p.h);
            
            // Øyne
            ctx.fillStyle = 'white'; ctx.fillRect(4, -40, 8, 8);
            ctx.fillStyle = 'black'; ctx.fillRect(8, -40, 4, 4);
        }

        ctx.restore();
        
        // Debug: Tegn hitbox outline
        // ctx.strokeStyle = 'rgba(255,0,0,0.5)';
        // ctx.strokeRect(p.x, p.y, p.w, p.h);
    }
};

/* === APP / MAIN LOOP === */
const App = {
    init() {
        log("Initialiserer 2D Platformer Engine v4...");
        Input.init();
        Resources.init();
        Studio.resetView();
        
        requestAnimationFrame(this.loop.bind(this));
    },

    toggleStudio() {
        Studio.toggle();
    },

    loop() {
        if (Studio.active) {
            Studio.update();
            Studio.draw();
        } else {
            Game.update();
            Game.draw();
        }

        if (!Studio.active) {
            UI.debugInfo.textContent = `FPS: 60 | State: ${Game.player.state} | Grounded: ${Game.player.grounded}`;
        }

        requestAnimationFrame(this.loop.bind(this));
    }
};

window.onload = () => {
    App.init();
};
/* Version: #4 */
