// Rally Track, Checkpoint Gates, and Race Progress Manager
class RallyTrack {
    constructor(trackData, audio) {
        this.trackData = trackData;
        this.audio = audio;
        this.checkpoints = trackData.checkpoints || [];
        this.currentCheckpointIndex = 0;
        this.totalCheckpoints = this.checkpoints.length;

        this.raceState = 'ready'; // 'ready', 'racing', 'finished'
        this.startTime = 0;
        this.elapsedTime = 0;
        let savedBest = null;
        try {
            if (typeof localStorage !== 'undefined') {
                savedBest = localStorage.getItem('arolia_best_time');
            }
        } catch (e) {}
        this.bestTime = savedBest ? parseFloat(savedBest) : null;
        this.splitTimes = [];
        this.splitDiffs = [];
        this.lastSplitMsg = '';
        this.splitMsgTimer = 0;
    }

    startRace() {
        this.raceState = 'racing';
        this.startTime = performance.now();
        this.currentCheckpointIndex = 1; // 0 is start line
        this.elapsedTime = 0;
        this.splitTimes = [];
        this.splitDiffs = [];
        this.lastSplitMsg = 'LØP I GANG! KJØR!';
        this.splitMsgTimer = 3.0;
        if (this.audio) this.audio.playCheckpoint();
    }

    resetRace() {
        this.raceState = 'ready';
        this.currentCheckpointIndex = 0;
        this.elapsedTime = 0;
        this.lastSplitMsg = 'STILL OPP VED ÅRØHALLEN OG TRYKK GASS';
        this.splitMsgTimer = 5.0;
    }

    update(carPhysics, dt) {
        if (this.splitMsgTimer > 0) {
            this.splitMsgTimer -= dt;
        }

        if (this.raceState === 'racing') {
            this.elapsedTime = (performance.now() - this.startTime) / 1000.0;
        }

        if (this.currentCheckpointIndex >= this.totalCheckpoints) return;

        const targetCp = this.checkpoints[this.currentCheckpointIndex];
        const dx = carPhysics.x - targetCp.x;
        const dz = carPhysics.z - targetCp.z;
        const dist = Math.hypot(dx, dz);

        // Hit detection
        if (dist < targetCp.width) {
            if (this.raceState === 'ready' && targetCp.type === 'start') {
                this.startRace();
                return;
            }

            if (this.raceState === 'racing') {
                this.splitTimes.push(this.elapsedTime);
                if (targetCp.type === 'finish') {
                    this.raceState = 'finished';
                    if (this.audio) this.audio.playFinish();
                    if (!this.bestTime || this.elapsedTime < this.bestTime) {
                        this.bestTime = this.elapsedTime;
                        try {
                            if (typeof localStorage !== 'undefined') {
                                localStorage.setItem('arolia_best_time', this.bestTime.toString());
                            }
                        } catch (e) {}
                        this.lastSplitMsg = `NY BANDERUNNETID! ${this.formatTime(this.elapsedTime)}`;
                    } else {
                        this.lastSplitMsg = `MÅL! TID: ${this.formatTime(this.elapsedTime)}`;
                    }
                    this.splitMsgTimer = 8.0;
                } else {
                    if (this.audio) this.audio.playCheckpoint();
                    this.lastSplitMsg = `SJEKKPUNKT ${this.currentCheckpointIndex}: ${targetCp.name.toUpperCase()} (${this.formatTime(this.elapsedTime)})`;
                    this.splitMsgTimer = 3.5;
                }
                this.currentCheckpointIndex++;
            }
        }
    }

    formatTime(sec) {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        const ms = Math.floor((sec % 1) * 100);
        return `${m}:${s < 10 ? '0' : ''}${s}.${ms < 10 ? '0' : ''}${ms}`;
    }

    getGateLines() {
        const lines = [];
        this.checkpoints.forEach((cp, idx) => {
            const isCurrent = (idx === this.currentCheckpointIndex);
            const isPassed = (idx < this.currentCheckpointIndex);
            const isFinish = (cp.type === 'finish');

            let gateColor = '#334466'; // inactive
            if (isCurrent) {
                gateColor = isFinish ? '#ff0055' : '#00ff88'; // glowing target
            } else if (isPassed) {
                gateColor = '#115533';
            }

            const w = cp.width * 0.5;
            const h = 5.5; // arch height
            const rad = (cp.heading * Math.PI) / 180.0;
            // Vector perpendicular to heading
            const px = Math.cos(rad);
            const pz = -Math.sin(rad);

            const leftBottom = new Vector3(cp.x - px * w, cp.y, cp.z - pz * w);
            const rightBottom = new Vector3(cp.x + px * w, cp.y, cp.z + pz * w);
            const leftTop = new Vector3(cp.x - px * w, cp.y + h, cp.z - pz * w);
            const rightTop = new Vector3(cp.x + px * w, cp.y + h, cp.z + pz * w);

            // Arch pillars and top beam
            const lineWidth = isCurrent ? 3.5 : 1.5;
            lines.push({ p1: leftBottom, p2: leftTop, color: gateColor, width: lineWidth });
            lines.push({ p1: rightBottom, p2: rightTop, color: gateColor, width: lineWidth });
            lines.push({ p1: leftTop, p2: rightTop, color: gateColor, width: lineWidth });

            // Ground threshold line
            lines.push({ p1: leftBottom, p2: rightBottom, color: isCurrent ? '#ffff00' : gateColor, width: isCurrent ? 2.5 : 1.0 });

            // Diagonal bracing for retro wireframe look
            lines.push({ p1: leftTop, p2: rightBottom, color: gateColor, width: 0.8 });
            lines.push({ p1: rightTop, p2: leftBottom, color: gateColor, width: 0.8 });
        });
        return lines;
    }
}

window.RallyTrack = RallyTrack;
