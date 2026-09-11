// 3D Wireframe Rally Car with Stick-Figure Driver and Rotating Wheels
class WireframeCar {
    constructor() {
        this.halfW = 0.9;
        this.halfL = 2.1;
        this.height = 1.35;
        this.wheelRadius = 0.38;
        this.wheelWidth = 0.28;

        // Smoke / dust trails
        this.particles = [];
        this.sparks = [];
    }

    addParticle(x, y, z, vx, vz) {
        if (this.particles.length > 80) this.particles.shift();
        this.particles.push({
            x: x + (Math.random() - 0.5) * 0.4,
            y: y + Math.random() * 0.2,
            z: z + (Math.random() - 0.5) * 0.4,
            vx: vx * 0.2 + (Math.random() - 0.5) * 1.5,
            vz: vz * 0.2 + (Math.random() - 0.5) * 1.5,
            vy: Math.random() * 1.2 + 0.5,
            life: 1.0,
            size: Math.random() * 0.6 + 0.3
        });
    }

    addSparks(x, y, z) {
        for (let i = 0; i < 16; i++) {
            this.sparks.push({
                x, y, z,
                vx: (Math.random() - 0.5) * 8.0,
                vy: Math.random() * 6.0 + 2.0,
                vz: (Math.random() - 0.5) * 8.0,
                life: 1.0
            });
        }
    }

    updateParticles(dt) {
        // Update dust
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;
            p.life -= dt * 1.4;
            p.size += dt * 0.8;
            if (p.life <= 0) this.particles.splice(i, 1);
        }

        // Update sparks
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i];
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.z += s.vz * dt;
            s.vy -= 9.8 * dt;
            s.life -= dt * 2.5;
            if (s.life <= 0) this.sparks.splice(i, 1);
        }
    }

    getLines(physics) {
        const lines = [];
        const px = physics.x;
        const py = physics.y + this.wheelRadius;
        const pz = physics.z;
        const yaw = physics.yaw;
        const pitch = physics.pitch;
        const roll = physics.roll;

        // Transformation helper from car local space to world space
        // Local: +X = Right, +Y = Up, +Z = Forward
        const cy = Math.cos(yaw), sy = Math.sin(yaw);
        const cp = Math.cos(pitch), sp = Math.sin(pitch);
        const cr = Math.cos(roll), sr = Math.sin(roll);

        const toWorld = (lx, ly, lz) => {
            // Roll (around local Z axis)
            let x1 = lx * cr - ly * sr;
            let y1 = lx * sr + ly * cr;
            let z1 = lz;

            // Pitch (around local X axis): positive pitch raises nose (+Y), negative pitch lowers nose (-Y)
            let x2 = x1;
            let y2 = y1 * cp + z1 * sp;
            let z2 = -y1 * sp + z1 * cp;

            // Yaw: heading 0 = +Z (North), heading pi/2 = +X (East)
            let wx = px + z2 * sy + x2 * cy;
            let wy = py + y2;
            let wz = pz + z2 * cy - x2 * sy;
            return new Vector3(wx, wy, wz);
        };

        const addSeg = (p1, p2, color = '#ffffff', width = 2) => {
            lines.push({ p1: toWorld(...p1), p2: toWorld(...p2), color, width });
        };

        // --- 1. CHASSIS & BODY (Cyber Rally Silhouette) ---
        const carColor = '#ffffff';
        const accentColor = '#00ffcc';

        // Lower body loop (Bumper to Bumper)
        const bFL = [-this.halfW, 0.2,  this.halfL];
        const bFR = [ this.halfW, 0.2,  this.halfL];
        const bRL = [-this.halfW, 0.2, -this.halfL];
        const bRR = [ this.halfW, 0.2, -this.halfL];

        addSeg(bFL, bFR, accentColor, 2.5);
        addSeg(bFR, bRR, carColor, 2);
        addSeg(bRR, bRL, '#ff0055', 2.5); // Red rear bumper
        addSeg(bRL, bFL, carColor, 2);

        // Waistline / Hood / Trunk line
        const wFL = [-this.halfW, 0.6,  this.halfL * 0.95];
        const wFR = [ this.halfW, 0.6,  this.halfL * 0.95];
        const wHoodL = [-this.halfW * 0.95, 0.72,  this.halfL * 0.35];
        const wHoodR = [ this.halfW * 0.95, 0.72,  this.halfL * 0.35];
        const wTrunkL = [-this.halfW * 0.95, 0.75, -this.halfL * 0.85];
        const wTrunkR = [ this.halfW * 0.95, 0.75, -this.halfL * 0.85];
        const wRL = [-this.halfW, 0.7, -this.halfL * 0.98];
        const wRR = [ this.halfW, 0.7, -this.halfL * 0.98];

        addSeg(wFL, wFR, accentColor, 2);
        addSeg(wFL, wHoodL, carColor, 2);
        addSeg(wFR, wHoodR, carColor, 2);
        addSeg(wHoodL, wHoodR, carColor, 2); // Base of windshield

        addSeg(wHoodL, wTrunkL, carColor, 1.5);
        addSeg(wHoodR, wTrunkR, carColor, 1.5);

        addSeg(wTrunkL, wRL, carColor, 2);
        addSeg(wTrunkR, wRR, carColor, 2);
        addSeg(wRL, wRR, '#ff0055', 2);

        // Vertical corner pillars to waist
        addSeg(bFL, wFL, carColor, 1.5);
        addSeg(bFR, wFR, carColor, 1.5);
        addSeg(bRL, wRL, carColor, 1.5);
        addSeg(bRR, wRR, carColor, 1.5);

        // Cabin Roof (A-pillars, B-pillars, C-pillars)
        const rFL = [-this.halfW * 0.72, this.height,  this.halfL * 0.05];
        const rFR = [ this.halfW * 0.72, this.height,  this.halfL * 0.05];
        const rRL = [-this.halfW * 0.72, this.height, -this.halfL * 0.5];
        const rRR = [ this.halfW * 0.72, this.height, -this.halfL * 0.5];

        // Windshield (A-pillars)
        addSeg(wHoodL, rFL, '#00e5ff', 2);
        addSeg(wHoodR, rFR, '#00e5ff', 2);
        addSeg(rFL, rFR, '#00e5ff', 2);

        // Roof rails
        addSeg(rFL, rRL, carColor, 2);
        addSeg(rFR, rRR, carColor, 2);
        addSeg(rRL, rRR, carColor, 2);

        // Rear window (C-pillars)
        addSeg(rRL, wTrunkL, '#00e5ff', 2);
        addSeg(rRR, wTrunkR, '#00e5ff', 2);

        // Rally Roll Cage (Neon Yellow / Lime inside cabin)
        const cageColor = '#ffff00';
        addSeg([-this.halfW * 0.65, 0.4, -this.halfL * 0.45], rFR, cageColor, 1);
        addSeg([ this.halfW * 0.65, 0.4, -this.halfL * 0.45], rFL, cageColor, 1);

        // Rally Rear Wing / Spoiler
        const spL = [-this.halfW * 0.85, 1.15, -this.halfL * 0.95];
        const spR = [ this.halfW * 0.85, 1.15, -this.halfL * 0.95];
        addSeg(wRL, spL, '#ff0055', 2);
        addSeg(wRR, spR, '#ff0055', 2);
        addSeg(spL, spR, '#ff0055', 3); // Bold wing blade

        // Headlight Beams (Wireframe light cones)
        if (true) {
            const hColor = 'rgba(255, 255, 200, 0.35)';
            const hlL = [-this.halfW * 0.65, 0.4, this.halfL];
            const hlR = [ this.halfW * 0.65, 0.4, this.halfL];
            const beamFarL = [-this.halfW * 1.8, -0.2, this.halfL + 14.0];
            const beamFarR = [ this.halfW * 1.8, -0.2, this.halfL + 14.0];
            addSeg(hlL, beamFarL, hColor, 1);
            addSeg(hlR, beamFarR, hColor, 1);
            addSeg(beamFarL, beamFarR, hColor, 1);
        }

        // --- 2. STICK-FIGURE RALLY DRIVER ("STICK-MAN") ---
        const stickColor = '#00ff88';
        const driverX = -0.32; // Left-hand drive
        const seatY = 0.38;
        const driverZ = -0.15;

        // Torso
        const seatPt = [driverX, seatY, driverZ];
        const chestPt = [driverX, seatY + 0.38, driverZ + 0.05];
        const neckPt = [driverX, seatY + 0.52, driverZ + 0.08];
        addSeg(seatPt, neckPt, stickColor, 2);

        // Head (Stick-man circle / hexagon)
        const headRadius = 0.12;
        const headCenter = [driverX, seatY + 0.65, driverZ + 0.1];
        const headPts = [];
        for (let a = 0; a < 6; a++) {
            const ang = (a / 6) * Math.PI * 2;
            headPts.push([
                headCenter[0],
                headCenter[1] + headRadius * Math.sin(ang),
                headCenter[2] + headRadius * Math.cos(ang)
            ]);
        }
        for (let a = 0; a < 6; a++) {
            addSeg(headPts[a], headPts[(a + 1) % 6], stickColor, 2);
        }

        // Steering Wheel & Hands
        const wheelCenter = [driverX, seatY + 0.36, driverZ + 0.42];
        const steerAng = physics.steerAngle * 2.5;
        const swL = [wheelCenter[0] - 0.15 * Math.cos(steerAng), wheelCenter[1] + 0.15 * Math.sin(steerAng), wheelCenter[2]];
        const swR = [wheelCenter[0] + 0.15 * Math.cos(steerAng), wheelCenter[1] - 0.15 * Math.sin(steerAng), wheelCenter[2]];
        addSeg(swL, swR, '#ffffff', 2);
        // Arms
        addSeg(chestPt, swL, stickColor, 1.5);
        addSeg(chestPt, swR, stickColor, 1.5);

        // Legs
        addSeg(seatPt, [driverX - 0.1, seatY - 0.1, driverZ + 0.45], stickColor, 1.5);
        addSeg(seatPt, [driverX + 0.1, seatY - 0.1, driverZ + 0.45], stickColor, 1.5);

        // --- 3. FOUR ROTATING WIREFRAME WHEELS ---
        const wheelPositions = [
            { pos: [-this.halfW - 0.08, 0.0,  this.halfL * 0.65], isFront: true },
            { pos: [ this.halfW + 0.08, 0.0,  this.halfL * 0.65], isFront: true },
            { pos: [-this.halfW - 0.08, 0.0, -this.halfL * 0.65], isFront: false },
            { pos: [ this.halfW + 0.08, 0.0, -this.halfL * 0.65], isFront: false }
        ];

        const rot = physics.wheelRotation;
        const steer = physics.steerAngle;

        wheelPositions.forEach(w => {
            const [wx, wy, wz] = w.pos;
            const wSteer = w.isFront ? steer : 0;
            const cs = Math.cos(wSteer), ss = Math.sin(wSteer);

            // 6 segments around wheel circle
            const numSpokes = 6;
            const ringPts = [];
            for (let i = 0; i < numSpokes; i++) {
                const ang = rot + (i / numSpokes) * Math.PI * 2;
                const rz = Math.sin(ang) * this.wheelRadius;
                const ry = Math.cos(ang) * this.wheelRadius;

                // Rotate around Y by steer angle
                const rx = rz * ss;
                const rzSteer = rz * cs;

                ringPts.push([wx + rx, wy + ry, wz + rzSteer]);
            }

            // Draw tire outer rim
            for (let i = 0; i < numSpokes; i++) {
                addSeg(ringPts[i], ringPts[(i + 1) % numSpokes], '#00ffcc', 2);
                // Rotating spokes
                addSeg([wx, wy, wz], ringPts[i], '#557788', 1);
            }
        });

        // Dust generation on slide
        if (physics.isGrounded && (Math.abs(physics.driftSlip) > 2.0 || physics.speed > 8.0)) {
            const fx = Math.sin(physics.yaw);
            const fz = Math.cos(physics.yaw);
            // rear wheel positions in world
            const rearL = toWorld(-this.halfW, -0.1, -this.halfL * 0.65);
            const rearR = toWorld( this.halfW, -0.1, -this.halfL * 0.65);
            this.addParticle(rearL.x, rearL.y, rearL.z, -fx * physics.speed, -fz * physics.speed);
            this.addParticle(rearR.x, rearR.y, rearR.z, -fx * physics.speed, -fz * physics.speed);
        }

        if (physics.collisionSpark) {
            this.addSparks(physics.collisionSpark.x, physics.collisionSpark.y, physics.collisionSpark.z);
        }

        return lines;
    }
}

window.WireframeCar = WireframeCar;
