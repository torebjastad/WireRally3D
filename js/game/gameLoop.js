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

        // Mobile & Touch control state
        this.touchModes = ['buttons', 'wheel', 'gyro'];
        this.currentTouchModeIdx = 0;
        this.touchMode = 'buttons'; // 'buttons', 'wheel', 'gyro'
        this.touchSteerValue = 0.0;
        this.gyroOffset = 0.0;
        this.gyroRawAngle = 0.0;
        this.gyroListenerActive = false;
        this.wheelTouchId = null;
        this.wheelStartX = 0;

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

    clearKeys() {
        this.keys.forward = false;
        this.keys.backward = false;
        this.keys.left = false;
        this.keys.right = false;
        this.keys.handbrake = false;
    }

    setupInputs() {
        window.addEventListener('keydown', (e) => {
            // Audio init on first user gesture
            if (!this.audio.initialized) this.audio.init();

            // Do not intercept keystrokes if the user is typing in an input or textarea
            const target = e.target;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                if (e.code === 'Escape') {
                    const modal = document.getElementById('stageModal');
                    if (modal && modal.style.display !== 'none') {
                        modal.style.display = 'none';
                        target.blur();
                    }
                }
                return; // Let user type W, A, S, D, Space, R, C, etc. into the input box!
            }

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
            const target = e.target;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                return;
            }

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
            const maxDrag = 300.0; // Increased from 130px to 300px: requires pulling further for high steering
            let raw = Math.max(-1.0, Math.min(1.0, dx / maxDrag));
            // Progressive curve (x^1.55): very gentle around center for stable straightaways, ramping up when dragged far
            this.mouseSteer.steerValue = Math.sign(raw) * Math.pow(Math.abs(raw), 1.55);
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
            // Don't intercept button clicks on HUD elements or modal dialogs/inputs
            if (e.target && e.target.closest && e.target.closest('.controls-panel, .minimap-wrapper, .touch-controls, .stage-modal, button, input, textarea')) return;
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

    unlockAudio() {
        if (!this.audio) return;
        if (!this.audio.initialized) {
            this.audio.init();
        }
        if (this.audio.ctx && this.audio.ctx.state === 'suspended') {
            this.audio.ctx.resume();
        }
    }

    setupTouchControls() {
        // Global unlock on any touchstart
        window.addEventListener('touchstart', () => this.unlockAudio(), { passive: true });

        // 1. Multi-touch button binding
        const bindTouch = (id, key) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            const start = (e) => {
                e.preventDefault();
                this.unlockAudio();
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
            btn.addEventListener('touchcancel', end, { passive: false });
            btn.addEventListener('mousedown', start);
            btn.addEventListener('mouseup', end);
            btn.addEventListener('mouseleave', () => {
                this.keys[key] = false;
                btn.classList.remove('active');
            });
        };

        // Right hand pedals
        bindTouch('btnTouchUp', 'forward');
        bindTouch('btnTouchDown', 'backward');
        bindTouch('btnTouchBrake', 'handbrake');

        // Left hand buttons (when in buttons mode)
        bindTouch('btnTouchLeft', 'left');
        bindTouch('btnTouchRight', 'right');

        // 2. Mobile Steering Mode Switcher (Buttons -> Wheel -> Gyro)
        const btnTouchMode = document.getElementById('btnTouchMode');
        if (btnTouchMode) {
            btnTouchMode.addEventListener('click', () => {
                this.currentTouchModeIdx = (this.currentTouchModeIdx + 1) % this.touchModes.length;
                this.setTouchMode(this.touchModes[this.currentTouchModeIdx]);
            });
        }

        // 3. Virtual Steering Wheel / Slider Touch Tracking
        const wheelGroup = document.getElementById('steerWheelGroup');
        const wheelKnob = document.getElementById('wheelKnob');
        const wheelLabel = document.getElementById('wheelLabel');

        if (wheelGroup) {
            const onWheelStart = (e) => {
                e.preventDefault();
                this.unlockAudio();
                const touch = e.changedTouches ? e.changedTouches[0] : e;
                this.wheelTouchId = touch.identifier !== undefined ? touch.identifier : 'mouse';
                const rect = wheelGroup.getBoundingClientRect();
                this.wheelStartX = rect.left + rect.width * 0.5;
                updateWheelPos(touch.clientX);
            };

            const onWheelMove = (e) => {
                if (this.wheelTouchId === null) return;
                let targetTouch = null;
                if (e.changedTouches) {
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        if (e.changedTouches[i].identifier === this.wheelTouchId) {
                            targetTouch = e.changedTouches[i];
                            break;
                        }
                    }
                } else if (this.wheelTouchId === 'mouse') {
                    targetTouch = e;
                }
                if (!targetTouch) return;
                e.preventDefault();
                updateWheelPos(targetTouch.clientX);
            };

            const onWheelEnd = (e) => {
                if (this.wheelTouchId === null) return;
                if (e.changedTouches) {
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        if (e.changedTouches[i].identifier === this.wheelTouchId) {
                            resetWheel();
                            break;
                        }
                    }
                } else {
                    resetWheel();
                }
            };

            const updateWheelPos = (clientX) => {
                const maxRange = 65.0; // +/- 65px
                const dx = clientX - this.wheelStartX;
                const norm = Math.max(-1.0, Math.min(1.0, dx / maxRange));
                // Non-linear response curve for smooth center tracking
                this.touchSteerValue = Math.sign(norm) * Math.pow(Math.abs(norm), 1.15);

                if (wheelKnob) {
                    wheelKnob.style.transform = `translate(${norm * 52}px, -50%)`;
                }
                if (wheelLabel) {
                    const pct = Math.round(Math.abs(this.touchSteerValue) * 100);
                    if (pct < 4) {
                        wheelLabel.innerText = '• RETT FRAM •';
                        wheelLabel.style.color = '#00ffcc';
                    } else if (this.touchSteerValue < 0) {
                        wheelLabel.innerText = `◀ ${pct}% VENSTRE`;
                        wheelLabel.style.color = '#ffaa00';
                    } else {
                        wheelLabel.innerText = `HØGRE ${pct}% ▶`;
                        wheelLabel.style.color = '#ffaa00';
                    }
                }
            };

            const resetWheel = () => {
                this.wheelTouchId = null;
                this.touchSteerValue = 0.0;
                if (wheelKnob) wheelKnob.style.transform = 'translate(0px, -50%)';
                if (wheelLabel) {
                    wheelLabel.innerText = 'DRA FOR Å STYRE';
                    wheelLabel.style.color = '#00ffcc';
                }
            };

            wheelGroup.addEventListener('touchstart', onWheelStart, { passive: false });
            window.addEventListener('touchmove', onWheelMove, { passive: false });
            window.addEventListener('touchend', onWheelEnd, { passive: false });
            window.addEventListener('touchcancel', onWheelEnd, { passive: false });

            wheelGroup.addEventListener('mousedown', onWheelStart);
            window.addEventListener('mousemove', onWheelMove);
            window.addEventListener('mouseup', onWheelEnd);
        }

        // 4. Gyroscope / Tilt Steering Calibration Button
        const btnCalib = document.getElementById('btnCalibrateGyro');
        if (btnCalib) {
            btnCalib.addEventListener('click', (e) => {
                e.stopPropagation();
                this.gyroOffset = this.gyroRawAngle;
                const gyroLabel = document.getElementById('gyroLabel');
                if (gyroLabel) gyroLabel.innerText = 'NULLSTILT (0°)';
            });
        }

        // 5. Fullscreen API Toggle
        const btnFullscreen = document.getElementById('btnFullscreen');
        if (btnFullscreen) {
            btnFullscreen.addEventListener('click', () => {
                if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                    const el = document.documentElement;
                    if (el.requestFullscreen) {
                        el.requestFullscreen().catch(() => {});
                    } else if (el.webkitRequestFullscreen) {
                        el.webkitRequestFullscreen();
                    }
                } else {
                    if (document.exitFullscreen) {
                        document.exitFullscreen().catch(() => {});
                    } else if (document.webkitExitFullscreen) {
                        document.webkitExitFullscreen();
                    }
                }
            });

            const updateFsBtn = () => {
                const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
                btnFullscreen.innerText = isFs ? '🗗 AVSLUTT' : '⛶ FULLSKJERM';
            };
            document.addEventListener('fullscreenchange', updateFsBtn);
            document.addEventListener('webkitfullscreenchange', updateFsBtn);
        }

        // 6. Dismiss Portrait Orientation Advisory
        const btnDismiss = document.getElementById('btnDismissPortrait');
        if (btnDismiss) {
            btnDismiss.addEventListener('click', () => {
                const notice = document.getElementById('portraitNotice');
                if (notice) notice.style.display = 'none';
            });
        }

        // Camera, Reset, and Mute buttons
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

    setTouchMode(mode) {
        this.touchMode = mode;
        this.touchSteerValue = 0.0;
        this.keys.left = false;
        this.keys.right = false;

        const btnTouchMode = document.getElementById('btnTouchMode');
        const buttonsGroup = document.getElementById('steerButtonsGroup');
        const wheelGroup = document.getElementById('steerWheelGroup');
        const gyroGroup = document.getElementById('steerGyroGroup');

        if (buttonsGroup) buttonsGroup.style.display = (mode === 'buttons') ? 'flex' : 'none';
        if (wheelGroup) wheelGroup.style.display = (mode === 'wheel') ? 'flex' : 'none';
        if (gyroGroup) gyroGroup.style.display = (mode === 'gyro') ? 'flex' : 'none';

        if (mode === 'buttons') {
            if (btnTouchMode) btnTouchMode.innerText = '🎮 MODUS: KNAPPAR';
        } else if (mode === 'wheel') {
            if (btnTouchMode) btnTouchMode.innerText = '🎯 MODUS: STYREHJUL';
        } else if (mode === 'gyro') {
            if (btnTouchMode) btnTouchMode.innerText = '🔄 MODUS: GYRO';
            this.activateGyro();
        }
    }

    activateGyro() {
        if (this.gyroListenerActive) return;

        const startListener = () => {
            window.addEventListener('deviceorientation', (e) => this.handleDeviceOrientation(e));
            this.gyroListenerActive = true;
        };

        // iOS 13+ requires explicit permission via DeviceOrientationEvent.requestPermission
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then((res) => {
                    if (res === 'granted') {
                        startListener();
                    } else {
                        alert('Gyrotilgang vart ikkje godkjent på denne eininga.');
                        this.setTouchMode('buttons');
                    }
                })
                .catch(() => {
                    this.setTouchMode('buttons');
                });
        } else {
            startListener();
        }
    }

    handleDeviceOrientation(e) {
        if (this.touchMode !== 'gyro') return;

        // Determine orientation angle (landscape vs portrait)
        const screenAngle = (typeof screen !== 'undefined' && screen.orientation && screen.orientation.angle !== undefined)
            ? screen.orientation.angle
            : (typeof window !== 'undefined' ? (window.orientation || 0) : 0);

        let tilt = 0;
        if (screenAngle === 90) {
            tilt = e.beta || 0;
        } else if (screenAngle === 270 || screenAngle === -90) {
            tilt = -(e.beta || 0);
        } else {
            // Portrait orientation
            tilt = e.gamma || 0;
        }

        this.gyroRawAngle = tilt;
        const netTilt = tilt - this.gyroOffset;
        const maxTilt = 22.0; // 22 degrees tilt for 100% full steering lock
        const norm = Math.max(-1.0, Math.min(1.0, netTilt / maxTilt));

        // Soft center deadzone and non-linear curve
        if (Math.abs(norm) < 0.05) {
            this.touchSteerValue = 0.0;
        } else {
            this.touchSteerValue = Math.sign(norm) * Math.pow(Math.abs(norm), 1.15);
        }

        // Update visual HUD indicator
        const needle = document.getElementById('gyroNeedle');
        const label = document.getElementById('gyroLabel');
        if (needle) {
            needle.style.transform = `rotate(${this.touchSteerValue * 30}deg)`;
        }
        if (label) {
            const pct = Math.round(Math.abs(this.touchSteerValue) * 100);
            if (pct < 3) {
                label.innerText = `TILTER: 0°`;
                label.style.color = '#00ffcc';
            } else if (this.touchSteerValue < 0) {
                label.innerText = `◀ ${Math.round(Math.abs(netTilt))}° (${pct}%)`;
                label.style.color = '#ffaa00';
            } else {
                label.innerText = `(${pct}%) ${Math.round(netTilt)}° ▶`;
                label.style.color = '#ffaa00';
            }
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
            this.clearKeys();
            modal.style.display = 'flex';
            if (inputCustom) {
                inputCustom.focus();
            }
        };

        const closeModal = () => {
            this.clearKeys();
            modal.style.display = 'none';
            if (overlay) overlay.style.display = 'none';
            if (inputCustom) inputCustom.blur();
        };

        if (inputCustom) {
            inputCustom.addEventListener('focus', () => this.clearKeys());
        }

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

            // Touch wheel or gyro steering takes effect when in active touch mode
            if (this.touchMode !== 'buttons' && Math.abs(this.touchSteerValue) > 0.001) {
                steer = this.touchSteerValue;
            }

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
