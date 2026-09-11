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

        // Camera (Default to Heli Skrått / Lazy diagonal chase)
        this.cameraModes = ['heli_chase', 'chase', 'hood', 'heli_top'];
        this.currentCamIdx = 0;
        this.camModeChanged = true;
        this.camPos = new Vector3(this.carPhysics.x, this.carPhysics.y + 18.0, this.carPhysics.z - 22.0);
        this.camTarget = new Vector3(this.carPhysics.x, this.carPhysics.y + 1.2, this.carPhysics.z + 4.0);

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
        if (btnCam) {
            btnCam.innerText = '🎥 KAMERA: HELI SKRÅTT';
            btnCam.addEventListener('click', () => this.cycleCamera());
        }

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
        this.camModeChanged = true;
        const mode = this.cameraModes[this.currentCamIdx];
        const labels = {
            chase: 'CHASE',
            hood: 'PANSER',
            heli_chase: 'HELI SKRÅTT',
            heli_top: 'HELI TOPP'
        };
        const btn = document.getElementById('btnCam');
        if (btn) btn.innerText = `🎥 KAMERA: ${labels[mode] || mode.toUpperCase()}`;
    }

    resetToTrack() {
        // Reset car to the start checkpoint or last passed checkpoint
        const cpIdx = Math.max(0, this.track.currentCheckpointIndex - 1);
        const cp = this.track.checkpoints[cpIdx] || this.track.checkpoints[0];
        this.carPhysics.reset(cp.x, cp.z, (cp.heading * Math.PI) / 180.0);
        this.carPhysics.y = cp.y + 0.2;
        this.camModeChanged = true;
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

            const lookAhead = 8.0 + car.speed * 0.3;
            const pitchOffset = Math.sin(car.pitch) * lookAhead;
            const targetX = car.x + fx * lookAhead;
            const targetY = car.y + 1.2 + pitchOffset;
            const targetZ = car.z + fz * lookAhead;

            if (this.camModeChanged || Math.hypot(this.camPos.x - targetCamX, this.camPos.z - targetCamZ) > 40.0) {
                this.camPos.set(targetCamX, targetCamY, targetCamZ);
                this.camTarget.set(targetX, targetY, targetZ);
                this.camModeChanged = false;
            } else {
                this.camPos.x += (targetCamX - this.camPos.x) * Math.min(1.0, dt * 8.0);
                this.camPos.y += (targetCamY - this.camPos.y) * Math.min(1.0, dt * 8.0);
                this.camPos.z += (targetCamZ - this.camPos.z) * Math.min(1.0, dt * 8.0);
                this.camTarget.set(targetX, targetY, targetZ);
            }
        } else if (mode === 'hood') {
            // First-person rally cockpit view pitched with the car
            const hoodPitchY = Math.sin(car.pitch) * 0.4;
            this.camPos.set(car.x + fx * 0.4, car.y + 1.1 + hoodPitchY, car.z + fz * 0.4);
            const lookAhead = 25.0;
            const pitchOffset = Math.sin(car.pitch) * lookAhead;
            this.camTarget.set(car.x + fx * lookAhead, car.y + 0.8 + pitchOffset, car.z + fz * lookAhead);
            this.camModeChanged = false;
        } else if (mode === 'heli_chase') {
            // Lazy diagonal helicopter chase camera ("skrått bakfra, høyt oppe, litt lazy")
            const rx = Math.cos(car.yaw);
            const rz = -Math.sin(car.yaw);
            const speedRatio = car.speed / car.maxSpeed;
            const distBack = 22.0 + speedRatio * 8.0;
            const distSide = 10.0 + speedRatio * 4.0;
            const baseHeliHeight = 18.0 + speedRatio * 6.0;

            const idealCamX = car.x - fx * distBack + rx * distSide;
            const idealCamZ = car.z - fz * distBack + rz * distSide;
            const groundUnderCam = this.terrain ? this.terrain.getHeight(idealCamX, idealCamZ) : car.y;
            const idealCamY = Math.max(car.y + baseHeliHeight, groundUnderCam + 12.0);

            const lookAhead = 4.0 + car.speed * 0.25;
            const targetX = car.x + fx * lookAhead;
            const targetY = car.y + 1.2;
            const targetZ = car.z + fz * lookAhead;

            if (this.camModeChanged || Math.hypot(this.camPos.x - idealCamX, this.camPos.z - idealCamZ) > 50.0) {
                this.camPos.set(idealCamX, idealCamY, idealCamZ);
                this.camTarget.set(targetX, targetY, targetZ);
                this.camModeChanged = false;
            } else {
                // Smooth, lazy cinematic tracking
                const lazyPosRate = Math.min(1.0, dt * 2.2);
                this.camPos.x += (idealCamX - this.camPos.x) * lazyPosRate;
                this.camPos.y += (idealCamY - this.camPos.y) * Math.min(1.0, dt * 1.8);
                this.camPos.z += (idealCamZ - this.camPos.z) * lazyPosRate;

                const lazyTargetRate = Math.min(1.0, dt * 3.5);
                this.camTarget.x += (targetX - this.camTarget.x) * lazyTargetRate;
                this.camTarget.y += (targetY - this.camTarget.y) * lazyTargetRate;
                this.camTarget.z += (targetZ - this.camTarget.z) * lazyTargetRate;
            }
        } else if (mode === 'heli_top') {
            // Overhead tactical map view
            const heliHeight = 48.0;
            const targetCamX = car.x;
            const targetCamY = car.y + heliHeight;
            const targetCamZ = car.z - 15.0;

            if (this.camModeChanged || Math.hypot(this.camPos.x - targetCamX, this.camPos.z - targetCamZ) > 60.0) {
                this.camPos.set(targetCamX, targetCamY, targetCamZ);
                this.camTarget.set(car.x, car.y, car.z);
                this.camModeChanged = false;
            } else {
                this.camPos.x += (targetCamX - this.camPos.x) * Math.min(1.0, dt * 5.0);
                this.camPos.y += (targetCamY - this.camPos.y) * Math.min(1.0, dt * 5.0);
                this.camPos.z += (targetCamZ - this.camPos.z) * Math.min(1.0, dt * 5.0);
                this.camTarget.set(car.x, car.y, car.z);
            }
        }

        this.renderer.setCamera(this.camPos, this.camTarget);
    }

    updateUI() {
        // Vehicle speed in real-world km/h (1 m/s = 3.6 km/h)
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
            if (this.renderer.setSpeedRatio) {
                this.renderer.setSpeedRatio(this.carPhysics.speed / this.carPhysics.maxSpeed);
            }
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
