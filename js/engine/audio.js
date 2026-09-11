// Web Audio API Procedural Synthesizer for Engine, Drift, and Rally Sounds
class RallyAudio {
    constructor() {
        this.ctx = null;
        this.isMuted = false;
        this.initialized = false;

        // Sound nodes
        this.engineOsc1 = null;
        this.engineOsc2 = null;
        this.engineFilter = null;
        this.engineGain = null;

        // Tire squeal noise
        this.tireGain = null;
        this.tireFilter = null;

        this.lastThrottle = 0;
    }

    init() {
        if (this.initialized) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();

            // 1. Engine Sound Synthesis
            this.engineGain = this.ctx.createGain();
            this.engineGain.gain.setValueAtTime(0.12, this.ctx.currentTime);

            this.engineFilter = this.ctx.createBiquadFilter();
            this.engineFilter.type = 'lowpass';
            this.engineFilter.frequency.setValueAtTime(400, this.ctx.currentTime);
            this.engineFilter.Q.setValueAtTime(3.5, this.ctx.currentTime);

            this.engineOsc1 = this.ctx.createOscillator();
            this.engineOsc1.type = 'sawtooth';
            this.engineOsc1.frequency.setValueAtTime(45, this.ctx.currentTime);

            this.engineOsc2 = this.ctx.createOscillator();
            this.engineOsc2.type = 'triangle';
            this.engineOsc2.frequency.setValueAtTime(90, this.ctx.currentTime);

            this.engineOsc1.connect(this.engineFilter);
            this.engineOsc2.connect(this.engineFilter);
            this.engineFilter.connect(this.engineGain);
            this.engineGain.connect(this.ctx.destination);

            this.engineOsc1.start();
            this.engineOsc2.start();

            // 2. Tire Drift Screech Synthesis (White Noise)
            const bufferSize = this.ctx.sampleRate * 2;
            const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const output = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }

            const whiteNoise = this.ctx.createBufferSource();
            whiteNoise.buffer = noiseBuffer;
            whiteNoise.loop = true;

            this.tireFilter = this.ctx.createBiquadFilter();
            this.tireFilter.type = 'bandpass';
            this.tireFilter.frequency.setValueAtTime(1100, this.ctx.currentTime);
            this.tireFilter.Q.setValueAtTime(2.0, this.ctx.currentTime);

            this.tireGain = this.ctx.createGain();
            this.tireGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

            whiteNoise.connect(this.tireFilter);
            this.tireFilter.connect(this.tireGain);
            this.tireGain.connect(this.ctx.destination);
            whiteNoise.start();

            this.initialized = true;
        } catch (e) {
            console.warn("Web Audio not supported or failed to initialize", e);
        }
    }

    update(rpm, throttle, driftSlip, isGrounded, handbrake) {
        if (!this.initialized || this.isMuted) return;

        // Engine frequency based on RPM
        const baseFreq = 28.0 + (rpm / 8000.0) * 110.0;
        const now = this.ctx.currentTime;
        this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.05);
        this.engineOsc2.frequency.setTargetAtTime(baseFreq * 1.5, now, 0.05);

        // Filter cutoff opens up with throttle and RPM (throaty roar)
        const cutoff = 250.0 + (rpm / 8000.0) * 1600.0 + throttle * 900.0;
        this.engineFilter.frequency.setTargetAtTime(cutoff, now, 0.05);

        // Engine volume
        const vol = isGrounded ? (0.08 + throttle * 0.12) : 0.05;
        this.engineGain.gain.setTargetAtTime(vol, now, 0.05);

        // Turbo blow-off pop on throttle lift
        if (this.lastThrottle > 0.7 && throttle < 0.2 && rpm > 4500) {
            this.playTurboBlowoff();
        }
        this.lastThrottle = throttle;

        // Tire screech on drift
        const slip = Math.abs(driftSlip);
        if (isGrounded && (slip > 2.5 || (handbrake && slip > 1.2))) {
            const tireVol = Math.min(0.25, (slip - 2.0) * 0.05 + (handbrake ? 0.08 : 0));
            this.tireGain.gain.setTargetAtTime(tireVol, now, 0.04);
            this.tireFilter.frequency.setTargetAtTime(1000 + slip * 80, now, 0.05);
        } else {
            this.tireGain.gain.setTargetAtTime(0.0, now, 0.06);
        }
    }

    playTurboBlowoff() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.15);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.16);
    }

    playCheckpoint() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 chime
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.06);
            gain.gain.setValueAtTime(0.15, now + idx * 0.06);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.25);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.06);
            osc.stop(now + idx * 0.06 + 0.26);
        });
    }

    playFinish() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        const fanfare = [523.25, 659.25, 783.99, 1046.50, 1318.51];
        fanfare.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + idx * 0.09);
            gain.gain.setValueAtTime(0.2, now + idx * 0.09);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.4);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.09);
            osc.stop(now + idx * 0.09 + 0.45);
        });
    }

    playCollision() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.12);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.13);
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.engineGain && this.ctx) {
            this.engineGain.gain.setValueAtTime(this.isMuted ? 0 : 0.1, this.ctx.currentTime);
        }
        return this.isMuted;
    }
}

window.RallyAudio = RallyAudio;
