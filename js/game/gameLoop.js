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
        this.carPhysics = new RallyCarPhysics(this.terrain, this.buildings, this.roads);
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
        this.uiOffroad = document.getElementById('offroadWarning');
        this.uiSteerIndicator = document.getElementById('mouseSteerIndicator');
        this.uiSteerLine = document.getElementById('steerLine');
        this.uiSteerPointer = document.getElementById('steerPointer');
        this.uiSteerBadge = document.getElementById('steerBadge');

        // Mouse click-and-drag steering state
        this.mouseSteer = {
            isDragging: false,
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0,
            steerValue: 0.0
        };

        // Stage Management (Default to original Årølia)
        this.originalAroliaStage = {
            name: 'Årølia (Molde)',
            terrain: this.terrain,
            roads: this.roads,
            buildings: this.buildings,
            scenery: this.scenery,
            track: this.track,
            projection_meta: this.data.projection_meta,
            startPos: { x: -838.0, y: 39.2, z: -335.0, headingRad: (88.0 * Math.PI) / 180.0 }
        };
        this.currentStageName = 'Årølia (Molde)';

        // Timing
        this.lastTime = performance.now();
        this.isRunning = false;

        this.setupInputs();
        this.setupMouseSteering();
        this.setupTouchControls();
        this.setupStageModal();
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
                case 'Escape':
                    const modal = document.getElementById('stageModal');
                    if (modal && modal.style.display !== 'none') {
                        modal.style.display = 'none';
                    }
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

    setupMouseSteering() {
        const onDragStart = (clientX, clientY) => {
            if (!this.audio.initialized) this.audio.init();
            this.mouseSteer.isDragging = true;
            this.mouseSteer.startX = clientX;
            this.mouseSteer.startY = clientY;
            this.mouseSteer.currentX = clientX;
            this.mouseSteer.currentY = clientY;
            this.mouseSteer.steerValue = 0.0;
            this.updateMouseSteerUI(true);
        };

        const onDragMove = (clientX, clientY) => {
            if (!this.mouseSteer.isDragging) return;
            this.mouseSteer.currentX = clientX;
            this.mouseSteer.currentY = clientY;
            const dx = clientX - this.mouseSteer.startX;
            const maxDrag = 130.0; // 130 pixels for 100% full steering lock
            let raw = Math.max(-1.0, Math.min(1.0, dx / maxDrag));
            // Non-linear response curve for fine center corrections and smooth response
            this.mouseSteer.steerValue = Math.sign(raw) * Math.pow(Math.abs(raw), 1.15);
            this.updateMouseSteerUI(true);
        };

        const onDragEnd = () => {
            if (!this.mouseSteer.isDragging) return;
            this.mouseSteer.isDragging = false;
            this.mouseSteer.steerValue = 0.0;
            this.updateMouseSteerUI(false);
        };

        window.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // Left mouse button only
            // Don't intercept button clicks on HUD elements
            if (e.target && e.target.closest && e.target.closest('.controls-panel, .minimap-wrapper, .touch-controls, button')) return;
            onDragStart(e.clientX, e.clientY);
        });

        window.addEventListener('mousemove', (e) => {
            onDragMove(e.clientX, e.clientY);
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) onDragEnd();
        });

        // Touch drag steering on viewport
        const canvas = document.getElementById('renderCanvas');
        if (canvas) {
            canvas.addEventListener('touchstart', (e) => {
                if (e.touches.length > 0) {
                    const t = e.touches[0];
                    onDragStart(t.clientX, t.clientY);
                }
            }, { passive: true });

            canvas.addEventListener('touchmove', (e) => {
                if (this.mouseSteer.isDragging && e.touches.length > 0) {
                    const t = e.touches[0];
                    onDragMove(t.clientX, t.clientY);
                }
            }, { passive: true });

            canvas.addEventListener('touchend', () => {
                onDragEnd();
            });
        }
    }

    updateMouseSteerUI(visible) {
        if (!this.uiSteerIndicator) return;
        if (!visible || !this.mouseSteer.isDragging) {
            this.uiSteerIndicator.style.display = 'none';
            return;
        }

        this.uiSteerIndicator.style.display = 'block';
        const sx = this.mouseSteer.startX;
        const sy = this.mouseSteer.startY;
        const cx = this.mouseSteer.currentX;
        const cy = this.mouseSteer.currentY;

        this.uiSteerIndicator.style.left = `${sx}px`;
        this.uiSteerIndicator.style.top = `${sy}px`;

        const dx = cx - sx;
        const dy = cy - sy;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);

        if (this.uiSteerLine) {
            this.uiSteerLine.style.width = `${dist}px`;
            this.uiSteerLine.style.transform = `rotate(${angle}rad)`;
        }

        if (this.uiSteerPointer) {
            this.uiSteerPointer.style.transform = `translate(${dx}px, ${dy}px)`;
        }

        if (this.uiSteerBadge) {
            const pct = Math.round(Math.abs(this.mouseSteer.steerValue) * 100);
            if (Math.abs(this.mouseSteer.steerValue) < 0.04) {
                this.uiSteerBadge.innerText = '• RETT FRAM •';
                this.uiSteerBadge.style.color = '#00ffcc';
            } else if (this.mouseSteer.steerValue < 0) {
                this.uiSteerBadge.innerText = `◀ ${pct}% VENSTRE`;
                this.uiSteerBadge.style.color = '#ffaa00';
            } else {
                this.uiSteerBadge.innerText = `HØGRE ${pct}% ▶`;
                this.uiSteerBadge.style.color = '#ffaa00';
            }
        }
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
            btnCam.innerText = '🎥 KAMERA: HELI BAKFRA';
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
            heli_chase: 'HELI BAKFRA',
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

    setupStageModal() {
        const btnSelect = document.getElementById('btnSelectStage');
        const modal = document.getElementById('stageModal');
        const btnClose = document.getElementById('btnCloseStageModal');
        const backdrop = document.getElementById('modalBackdrop');
        const overlay = document.getElementById('stageLoadingOverlay');
        const statusText = document.getElementById('stageLoadingStatus');
        const btnCustom = document.getElementById('btnLoadCustom');
        const inputCustom = document.getElementById('inputCustomStage');

        if (!modal) return;

        const openModal = () => {
            modal.style.display = 'flex';
            if (inputCustom) inputCustom.focus();
        };

        const closeModal = () => {
            modal.style.display = 'none';
            if (overlay) overlay.style.display = 'none';
        };

        if (btnSelect) btnSelect.addEventListener('click', openModal);
        if (btnClose) btnClose.addEventListener('click', closeModal);
        if (backdrop) backdrop.addEventListener('click', closeModal);

        // Preset cards & buttons
        const presetCards = document.querySelectorAll('.preset-card, .btn-load-preset');
        presetCards.forEach(elem => {
            elem.addEventListener('click', async (e) => {
                const stageKey = elem.getAttribute('data-stage');
                if (!stageKey) return;
                e.stopPropagation();

                if (stageKey === 'arolia') {
                    this.switchStage(this.originalAroliaStage);
                    closeModal();
                    return;
                }

                if (typeof DynamicMapLoader === 'undefined') {
                    alert("DynamicMapLoader er ikkje lasta inn enno!");
                    return;
                }

                try {
                    if (overlay) overlay.style.display = 'flex';
                    if (statusText) statusText.innerText = `Laster ${stageKey.toUpperCase()}...`;
                    const stage = await DynamicMapLoader.loadStage(stageKey, this.audio, (msg) => {
                        if (statusText) statusText.innerText = msg;
                    });
                    this.switchStage(stage);
                    closeModal();
                } catch (err) {
                    if (statusText) statusText.innerText = `FEIL: ${err.message}`;
                    setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 2500);
                }
            });
        });

        // Custom search button and Enter key
        const handleCustom = async () => {
            if (!inputCustom) return;
            const query = inputCustom.value.trim();
            if (!query) {
                alert("Vennlegst skriv inn eit stadsnamn eller koordinatar!");
                return;
            }

            if (typeof DynamicMapLoader === 'undefined') {
                alert("DynamicMapLoader er ikkje lasta inn enno!");
                return;
            }

            try {
                if (overlay) overlay.style.display = 'flex';
                if (statusText) statusText.innerText = `Søker etter "${query}"...`;
                const stage = await DynamicMapLoader.loadStage(query, this.audio, (msg) => {
                    if (statusText) statusText.innerText = msg;
                });
                this.switchStage(stage);
                closeModal();
            } catch (err) {
                if (statusText) statusText.innerText = `FEIL: ${err.message}`;
                setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 3500);
            }
        };

        if (btnCustom) btnCustom.addEventListener('click', handleCustom);
        if (inputCustom) {
            inputCustom.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCustom();
                }
            });
        }
    }

    switchStage(stageData) {
        if (!stageData) return;
        this.currentStageName = stageData.name || 'Ukjent etappe';

        // 1. Swap 3D World components
        this.terrain = stageData.terrain;
        this.roads = stageData.roads;
        this.buildings = stageData.buildings;
        this.scenery = stageData.scenery || [];
        this.track = stageData.track;

        // 2. Update car physics references & road spatial index
        this.carPhysics.terrain = this.terrain;
        this.carPhysics.roads = this.roads;
        this.carPhysics.buildings = this.buildings;
        this.carPhysics.roadIndex = this.carPhysics.prepareRoads(this.roads);
        this.carPhysics.buildingObstacles = this.carPhysics.prepareBuildings(this.buildings);

        // 3. Reset car to stage start position
        const sp = stageData.startPos || (this.track.checkpoints[0] ? {
            x: this.track.checkpoints[0].x,
            y: this.track.checkpoints[0].y + 0.2,
            z: this.track.checkpoints[0].z,
            headingRad: (this.track.checkpoints[0].heading * Math.PI) / 180.0
        } : { x: 0, y: 10, z: 0, headingRad: 0 });

        this.carPhysics.reset(sp.x, sp.z, sp.headingRad);
        this.carPhysics.y = sp.y;
        this.camModeChanged = true;

        // 4. Update minimap
        if (this.minimap) {
            this.minimap.setStage(
                this.roads,
                this.buildings,
                this.track.checkpoints,
                stageData.projection_meta,
                this.currentStageName
            );
        }

        // 5. Reset track race state & notify UI
        this.track.resetRace();
        if (this.uiBanner) {
            this.uiBanner.innerText = `ETAPPE: ${this.currentStageName.toUpperCase()}`;
            this.track.lastSplitMsg = `TRYKK PIL OPP / W FOR Å STARTE ETAPPEN`;
            this.track.splitMsgTimer = 4.5;
        }

        const minimapLabel = document.querySelector('.minimap-label');
        if (minimapLabel) {
            minimapLabel.innerText = `KART: ${this.currentStageName.toUpperCase()}`;
        }
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
            // Helicopter camera: straight behind, closer to car, and elevated above car (~47 deg pitch down)
            const speedRatio = car.speed / car.maxSpeed;
            // Closer to the car: 13.5m - 18.0m (was 22m - 30m)
            const distBack = 13.5 + speedRatio * 4.5;
            // More above the car: 14.0m - 18.0m (was 18m - 24m at 30m distance)
            const baseHeliHeight = 14.0 + speedRatio * 4.0;

            // Straight behind car (no lateral side offset)
            const idealCamX = car.x - fx * distBack;
            const idealCamZ = car.z - fz * distBack;
            const groundUnderCam = this.terrain ? this.terrain.getHeight(idealCamX, idealCamZ) : car.y;
            const idealCamY = Math.max(car.y + baseHeliHeight, groundUnderCam + 7.5);

            // Look-ahead target down the road ahead of the car
            const lookAhead = 8.0 + car.speed * 0.25;
            const targetX = car.x + fx * lookAhead;
            const targetY = car.y + 1.0;
            const targetZ = car.z + fz * lookAhead;

            if (this.camModeChanged || Math.hypot(this.camPos.x - idealCamX, this.camPos.z - idealCamZ) > 50.0) {
                this.camPos.set(idealCamX, idealCamY, idealCamZ);
                this.camTarget.set(targetX, targetY, targetZ);
                this.camModeChanged = false;
            } else {
                // Smooth, elevated helicopter tracking damping
                const lazyPosRate = Math.min(1.0, dt * 3.5);
                this.camPos.x += (idealCamX - this.camPos.x) * lazyPosRate;
                this.camPos.y += (idealCamY - this.camPos.y) * Math.min(1.0, dt * 2.8);
                this.camPos.z += (idealCamZ - this.camPos.z) * lazyPosRate;

                const lazyTargetRate = Math.min(1.0, dt * 4.5);
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
        // Calibrate speed measurement to match real-world car dimensions (4.2m) and visual traversal past houses
        // Using factor 2.2 aligns 0-84 m/s with 0-185 km/h (realistic WRC rally speeds matching the visual pace).
        const speedKmh = Math.round(this.carPhysics.speed * 2.2);
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

        if (this.uiOffroad) {
            this.uiOffroad.style.display = this.carPhysics.isOnRoad ? 'none' : 'block';
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
            // Mouse drag steering input takes precedence when active
            if (this.mouseSteer && this.mouseSteer.isDragging) {
                steer = this.mouseSteer.steerValue;
            }
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
