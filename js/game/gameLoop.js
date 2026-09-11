// Main Game Loop, Input Handler, and Camera Controller
class GameLoop {
    constructor() {
        this.data = window.AROLIA_DATA;
        if (!this.data) {
            console.error("AROLIA_DATA bundle not loaded!");
            return;
        }

        // Subsystems
        this.canvas = document.getElementById('renderCanvas');
        this.minimapCanvas = document.getElementById('minimapCanvas');

        this.renderer = new WireframeRenderer(this.canvas);
        this.terrain = new Terrain(this.data.arolia_terrain);
        this.roads = this.data.arolia_roads;
        this.buildings = this.data.arolia_buildings;
        this.scenery = this.data.scenery;

        this.audio = new RallyAudio();
        this.track = new RallyTrack(this.data.rally_track, this.audio);
        this.carPhysics = new RallyCarPhysics(this.terrain, this.buildings);
        this.carModel = new WireframeCar();
        this.minimap = new HUDMinimap(
            this.minimapCanvas,
            this.roads,
            this.buildings,
            this.track.checkpoints,
            this.data.projection_meta
        );

        // Input state
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            handbrake: false
        };

        // Camera
        this.cameraModes = ['chase', 'hood', 'heli'];
        this.currentCamIdx = 0;
        this.camPos = new Vector3(this.carPhysics.x, this.carPhysics.y + 3.0, this.carPhysics.z - 7.0);
        this.camTarget = new Vector3(this.carPhysics.x, this.carPhysics.y + 1.2, this.carPhysics.z);

        // UI Elements
        this.uiSpeed = document.getElementById('valSpeed');
        this.uiGear = document.getElementById('valGear');
        this.uiRpm = document.getElementById('valRpm');
        this.uiTime = document.getElementById('valTime');
        this.uiBest = document.getElementById('valBest');
        this.uiCheckpoint = document.getElementById('valCheckpoint');
        this.uiBanner = document.getElementById('bannerNotice');
        this.uiRpmBar = document.getElementById('rpmBarFill');

        // Timing
        this.lastTime = performance.now();
        this.isRunning = false;

        this.setupInputs();
        this.setupTouchControls();
    }

    setupInputs() {
        window.addEventListener('keydown', (e) => {
            // Audio init on first user gesture
            if (!this.audio.initialized) this.audio.init();

            switch (e.code) {
                case 'KeyW':
                case 'ArrowUp':
                    this.keys.forward = true;
                    e.preventDefault();
                    break;
                case 'KeyS':
                case 'ArrowDown':
                    this.keys.backward = true;
                    e.preventDefault();
                    break;
                case 'KeyA':
                case 'ArrowLeft':
                    this.keys.left = true;
                    e.preventDefault();
                    break;
                case 'KeyD':
                case 'ArrowRight':
                    this.keys.right = true;
                    e.preventDefault();
                    break;
                case 'Space':
                    this.keys.handbrake = true;
                    e.preventDefault();
                    break;
                case 'KeyC':
                    this.cycleCamera();
                    break;
                case 'KeyR':
                    this.resetToTrack();
                    break;
                case 'KeyT':
                    this.track.resetRace();
                    this.resetToTrack();
                    break;
                case 'KeyM':
                    const muted = this.audio.toggleMute();
                    const muteBtn = document.getElementById('btnMute');
                    if (muteBtn) muteBtn.innerText = muted ? '🔇 MUTED' : '🔊 LYD';
                    break;
            }
        });

        window.addEventListener('keyup', (e) => {
            switch (e.code) {
                case 'KeyW':
                case 'ArrowUp':
                    this.keys.forward = false;
                    break;
                case 'KeyS':
                case 'ArrowDown':
                    this.keys.backward = false;
                    break;
                case 'KeyA':
                case 'ArrowLeft':
                    this.keys.left = false;
                    break;
                case 'KeyD':
                case 'ArrowRight':
                    this.keys.right = false;
                    break;
                case 'Space':
                    this.keys.handbrake = false;
                    break;
            }
        });

        // Click to start audio and unpause
        window.addEventListener('click', () => {
            if (!this.audio.initialized) this.audio.init();
        });
    }

    setupTouchControls() {
        const bindTouch = (id, key) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            const start = (e) => {
                e.preventDefault();
                if (!this.audio.initialized) this.audio.init();
                this.keys[key] = true;
                btn.classList.add('active');
            };
            const end = (e) => {
                e.preventDefault();
                this.keys[key] = false;
                btn.classList.remove('active');
            };
            btn.addEventListener('touchstart', start, { passive: false });
            btn.addEventListener('touchend', end, { passive: false });
            btn.addEventListener('mousedown', start);
            btn.addEventListener('mouseup', end);
        };

        bindTouch('btnTouchUp', 'forward');
        bindTouch('btnTouchDown', 'backward');
        bindTouch('btnTouchLeft', 'left');
        bindTouch('btnTouchRight', 'right');
        bindTouch('btnTouchBrake', 'handbrake');

        const btnCam = document.getElementById('btnCam');
        if (btnCam) btnCam.addEventListener('click', () => this.cycleCamera());

        const btnReset = document.getElementById('btnReset');
        if (btnReset) btnReset.addEventListener('click', () => this.resetToTrack());

        const btnMute = document.getElementById('btnMute');
        if (btnMute) {
            btnMute.addEventListener('click', () => {
                const muted = this.audio.toggleMute();
                btnMute.innerText = muted ? '🔇 MUTED' : '🔊 LYD';
            });
        }
    }

    cycleCamera() {
        this.currentCamIdx = (this.currentCamIdx + 1) % this.cameraModes.length;
        const mode = this.cameraModes[this.currentCamIdx];
        const btn = document.getElementById('btnCam');
        if (btn) btn.innerText = `🎥 KAMERA: ${mode.toUpperCase()}`;
    }

    resetToTrack() {
        // Reset car to the start checkpoint or last passed checkpoint
        const cpIdx = Math.max(0, this.track.currentCheckpointIndex - 1);
        const cp = this.track.checkpoints[cpIdx] || this.track.checkpoints[0];
        this.carPhysics.reset(cp.x, cp.z, (cp.heading * Math.PI) / 180.0);
        this.carPhysics.y = cp.y + 0.2;
    }

    updateCamera(dt) {
        const car = this.carPhysics;
        const fx = Math.sin(car.yaw);
        const fz = Math.cos(car.yaw);

        const mode = this.cameraModes[this.currentCamIdx];

        if (mode === 'chase') {
            // Dynamic rally chase cam with speed zoom, pitch tracking, and uphill ground clearance
            const dist = 6.2 + (car.speed / car.maxSpeed) * 2.8;
            const targetCamX = car.x - fx * dist;
            const targetCamZ = car.z - fz * dist;
            const groundBehind = this.terrain ? this.terrain.getHeight(targetCamX, targetCamZ) : car.y;
            const targetCamY = Math.max(car.y + 2.5 + (car.speed / car.maxSpeed) * 0.8, groundBehind + 1.8);

            this.camPos.x += (targetCamX - this.camPos.x) * Math.min(1.0, dt * 8.0);
            this.camPos.y += (targetCamY - this.camPos.y) * Math.min(1.0, dt * 8.0);
            this.camPos.z += (targetCamZ - this.camPos.z) * Math.min(1.0, dt * 8.0);

            const lookAhead = 8.0 + car.speed * 0.3;
            const pitchOffset = Math.sin(car.pitch) * lookAhead;
            this.camTarget.set(car.x + fx * lookAhead, car.y + 1.2 + pitchOffset, car.z + fz * lookAhead);
        } else if (mode === 'hood') {
            // First-person rally cockpit view pitched with the car
            const hoodPitchY = Math.sin(car.pitch) * 0.4;
            this.camPos.set(car.x + fx * 0.4, car.y + 1.1 + hoodPitchY, car.z + fz * 0.4);
            const lookAhead = 25.0;
            const pitchOffset = Math.sin(car.pitch) * lookAhead;
            this.camTarget.set(car.x + fx * lookAhead, car.y + 0.8 + pitchOffset, car.z + fz * lookAhead);
        } else if (mode === 'heli') {
            // Overhead tactical map view
            const heliHeight = 45.0;
            this.camPos.x += (car.x - this.camPos.x) * Math.min(1.0, dt * 6.0);
            this.camPos.y += (car.y + heliHeight - this.camPos.y) * Math.min(1.0, dt * 6.0);
            this.camPos.z += ((car.z - 15.0) - this.camPos.z) * Math.min(1.0, dt * 6.0);
            this.camTarget.set(car.x, car.y, car.z);
        }

        this.renderer.setCamera(this.camPos, this.camTarget);
    }

    updateUI() {
        const speedKmh = Math.round(this.carPhysics.speed * 3.6);
        if (this.uiSpeed) this.uiSpeed.innerText = speedKmh;

        if (this.uiGear) {
            const g = this.carPhysics.gear;
            this.uiGear.innerText = (g === -1) ? 'R' : (g === 0 ? 'N' : g);
        }

        if (this.uiRpm) this.uiRpm.innerText = Math.round(this.carPhysics.rpm);
        if (this.uiRpmBar) {
            const pct = Math.min(100, Math.max(0, ((this.carPhysics.rpm - 800) / 7200) * 100));
            this.uiRpmBar.style.width = `${pct}%`;
            this.uiRpmBar.style.backgroundColor = (pct > 88) ? '#ff0055' : (pct > 70 ? '#ffaa00' : '#00ffcc');
        }

        if (this.uiTime) {
            this.uiTime.innerText = this.track.formatTime(this.track.elapsedTime);
        }

        if (this.uiBest) {
            this.uiBest.innerText = this.track.bestTime ? this.track.formatTime(this.track.bestTime) : '--:--.--';
        }

        if (this.uiCheckpoint) {
            this.uiCheckpoint.innerText = `${this.track.currentCheckpointIndex} / ${this.track.totalCheckpoints}`;
        }

        if (this.uiBanner) {
            if (this.track.splitMsgTimer > 0) {
                this.uiBanner.innerText = this.track.lastSplitMsg;
                this.uiBanner.style.opacity = '1.0';
            } else {
                this.uiBanner.style.opacity = '0.0';
            }
        }
    }

    start() {
        this.isRunning = true;
        this.lastTime = performance.now();
        const loop = (time) => {
            if (!this.isRunning) return;
            const dt = Math.min(0.05, (time - this.lastTime) / 1000.0);
            this.lastTime = time;

            // 1. Physics Input Mapping
            const throttle = this.keys.forward ? 1.0 : 0.0;
            const brake = this.keys.backward ? 1.0 : 0.0;
            let steer = 0.0;
            if (this.keys.left) steer -= 1.0;
            if (this.keys.right) steer += 1.0;
            const handbrake = this.keys.handbrake;

            // 2. Physics Update
            this.carPhysics.update(throttle, steer, brake, handbrake, dt);
            this.carModel.updateParticles(dt);

            // 3. Track Progression
            this.track.update(this.carPhysics, dt);

            // 4. Audio Update
            this.audio.update(
                this.carPhysics.rpm,
                throttle,
                this.carPhysics.driftSlip,
                this.carPhysics.isGrounded,
                handbrake
            );

            // 5. Camera & 3D Render
            this.updateCamera(dt);
            this.renderer.renderScene(
                this.terrain,
                this.roads,
                this.buildings,
                this.scenery,
                this.carModel,
                this.carPhysics,
                this.track
            );

            // 6. 2D Minimap & UI HUD
            this.minimap.draw(this.carPhysics, this.track.currentCheckpointIndex);
            this.updateUI();

            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
}

window.GameLoop = GameLoop;
