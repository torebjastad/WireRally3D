// Vehicle physics engine for Årølia Rally
class RallyCarPhysics {
    constructor(terrain, buildings = []) {
        this.terrain = terrain;
        this.buildings = buildings;

        // Vehicle specifications
        this.mass = 1150.0;
        this.wheelbase = 2.5;
        this.width = 1.8;
        this.length = 4.2;
        this.maxSteer = 35.0 * Math.PI / 180.0;
        this.maxSpeed = 42.0; // m/s (~151 km/h)
        this.topGearSpeeds = [0.0, 12.0, 22.0, 31.0, 38.0, 45.0];
        this.gravity = 9.81;

        // Collision bounding boxes for buildings
        this.buildingObstacles = this.prepareBuildings(buildings);

        this.reset(-850.0, -340.0, 85.0 * Math.PI / 180.0);
    }

    prepareBuildings(buildings) {
        return buildings.map(b => {
            const xs = b.polygon.map(p => p.x);
            const zs = b.polygon.map(p => p.z);
            return {
                xMin: Math.min(...xs) - 0.8,
                xMax: Math.max(...xs) + 0.8,
                zMin: Math.min(...zs) - 0.8,
                zMax: Math.max(...zs) + 0.8,
                baseY: b.base_y,
                topY: b.base_y + b.height
            };
        });
    }

    reset(x, z, headingRad) {
        this.x = x;
        this.z = z;
        this.y = this.terrain ? this.terrain.getHeight(x, z) : 40.0;
        this.vx = 0.0;
        this.vy = 0.0;
        this.vz = 0.0;
        this.yaw = headingRad;
        this.yawRate = 0.0;
        this.pitch = 0.0;
        this.roll = 0.0;
        this.speed = 0.0;
        this.driftSlip = 0.0;
        this.steerInput = 0.0;
        this.steerAngle = 0.0;
        this.rpm = 900.0;
        this.gear = 1;
        this.isGrounded = true;
        this.airTime = 0.0;
        this.wheelRotation = 0.0;
        this.collisionSpark = null;
    }

    update(throttle, steer, brake, handbrake, dt = 1.0 / 60.0) {
        dt = Math.min(dt, 0.05); // prevent spiral of death

        // Smart keyboard steering filter
        // 1. Dual-rate input filter (smooth attack, rapid return-to-center and counter-steer)
        if (steer > 0) {
            const rate = (this.steerInput < 0) ? 9.0 : 4.5;
            this.steerInput = Math.min(1.0, this.steerInput + rate * dt);
        } else if (steer < 0) {
            const rate = (this.steerInput > 0) ? 9.0 : 4.5;
            this.steerInput = Math.max(-1.0, this.steerInput - rate * dt);
        } else {
            const decayRate = 7.0;
            if (this.steerInput > 0) {
                this.steerInput = Math.max(0.0, this.steerInput - decayRate * dt);
            } else if (this.steerInput < 0) {
                this.steerInput = Math.min(0.0, this.steerInput + decayRate * dt);
            }
        }

        // 2. Non-linear progressive response (soft center for calm lane-keeping)
        const curvedInput = (this.steerInput !== 0)
            ? Math.sign(this.steerInput) * Math.pow(Math.abs(this.steerInput), 1.35)
            : 0.0;

        // 3. Speed-sensitive steering scale (smooth taper at higher speeds)
        const speedKmh = Math.abs(this.speed) * 3.6;
        const speedScale = 1.0 / (1.0 + (speedKmh / 50.0) * 0.95);
        this.steerAngle = curvedInput * this.maxSteer * speedScale;

        // Forward vector (+X = East, +Z = North)
        const fx = Math.sin(this.yaw);
        const fz = Math.cos(this.yaw);
        // Right vector
        const rx = Math.cos(this.yaw);
        const rz = -Math.sin(this.yaw);

        // 4-wheel contact patch terrain sampling
        const Lw = 1.365; // half wheelbase
        const Ww = 0.98;  // half track width

        let groundY = 0.0;
        let targetPitch = 0.0;
        let targetRoll = 0.0;

        if (this.terrain) {
            const hFL = this.terrain.getHeight(this.x + fx * Lw - rx * Ww, this.z + fz * Lw - rz * Ww);
            const hFR = this.terrain.getHeight(this.x + fx * Lw + rx * Ww, this.z + fz * Lw + rz * Ww);
            const hRL = this.terrain.getHeight(this.x - fx * Lw - rx * Ww, this.z - fz * Lw - rz * Ww);
            const hRR = this.terrain.getHeight(this.x - fx * Lw + rx * Ww, this.z - fz * Lw + rz * Ww);

            const hFront = (hFL + hFR) * 0.5;
            const hRear  = (hRL + hRR) * 0.5;
            const hRight = (hFR + hRR) * 0.5;
            const hLeft  = (hFL + hRL) * 0.5;

            groundY = (hFront + hRear) * 0.5;
            targetPitch = Math.atan2(hFront - hRear, 2.0 * Lw);
            targetRoll = Math.atan2(hRight - hLeft, 2.0 * Ww);
        }

        // Ground contact check
        if (this.y <= groundY + 0.08) {
            this.isGrounded = true;
            this.y = groundY;
            if (this.vy < 0) this.vy = 0;
            this.airTime = 0.0;
            // Responsive terrain gradient tracking
            this.pitch += (targetPitch - this.pitch) * Math.min(1.0, dt * 20.0);
            this.roll += (targetRoll - this.roll) * Math.min(1.0, dt * 20.0);
        } else {
            this.isGrounded = false;
            this.airTime += dt;
            // Flight trajectory pitch
            const flightPitch = Math.atan2(this.vy, Math.max(1.0, this.speed));
            this.pitch += (flightPitch - this.pitch) * Math.min(1.0, dt * 4.0);
            this.roll += (0.0 - this.roll) * Math.min(1.0, dt * 4.0);
        }

        if (!this.isGrounded) {
            // Airborne dynamics
            this.vy -= this.gravity * dt;
            this.y += this.vy * dt;
            this.x += this.vx * dt;
            this.z += this.vz * dt;
            this.yaw += this.yawRate * dt * 0.5;
            this.speed = Math.hypot(this.vx, this.vz);
            this.wheelRotation += (this.speed * dt) / 0.35;
            this.checkCollisions();
            return;
        }

        // Velocity decomposition
        let vFwd = this.vx * fx + this.vz * fz;
        let vLat = this.vx * rx + this.vz * rz;

        // Gear selection & RPM
        for (let g = 1; g <= 5; g++) {
            if (Math.abs(vFwd) < this.topGearSpeeds[g] || g === 5) {
                this.gear = g;
                break;
            }
        }
        if (vFwd < -0.5 && throttle > 0 && brake > 0) {
            this.gear = -1; // Reverse
        }

        const gearRatio = 1.0 - (Math.max(1, this.gear) - 1) * 0.16;
        const targetRpm = 900.0 + (Math.abs(vFwd) / this.maxSpeed) * 6000.0 + throttle * 1400.0;
        this.rpm += (targetRpm - this.rpm) * Math.min(1.0, dt * 10.0);

        // Driving forces
        let accelForce = throttle * 15.0 * gearRatio;
        if (brake > 0 && vFwd < 0.2 && throttle === 0) {
            // Reverse drive
            accelForce = -brake * 7.5;
            brake = 0;
            this.gear = -1;
        }

        let brakeForce = brake * 24.0;
        const rollingResistance = 0.5 + 0.02 * Math.abs(vFwd);
        const slopeResistance = Math.sin(this.pitch) * this.gravity;

        const netFwdAccel = accelForce - (vFwd !== 0 ? Math.sign(vFwd) * brakeForce : 0) - (vFwd !== 0 ? Math.sign(vFwd) * rollingResistance : 0) - slopeResistance;

        // Lateral grip & drift physics
        let gripFactor = 28.0;
        if (handbrake) {
            gripFactor = 5.5; // Reduced grip initiates drift slide!
            brakeForce += 14.0;
        }

        const latAccel = -vLat * gripFactor;
        this.driftSlip = vLat;

        // Turning / Yaw dynamics
        let targetYawRate = (vFwd / this.wheelbase) * Math.tan(this.steerAngle);
        if (handbrake || Math.abs(vLat) > 2.0) {
            // Oversteer while drifting
            const oversteer = -vLat * 0.08 * (vFwd >= 0 ? 1.0 : -1.0);
            targetYawRate += oversteer;
        }

        this.yawRate += (targetYawRate - this.yawRate) * Math.min(1.0, dt * 12.0);

        // High-speed yaw stabilization assist (anti-twitch dampener on straights)
        if (!handbrake && Math.abs(this.steerInput) < 0.15) {
            const stabFactor = Math.min(1.0, Math.abs(vFwd) / 12.0);
            this.yawRate *= Math.max(0.0, 1.0 - dt * 6.0 * stabFactor);
        }

        this.yaw += this.yawRate * dt;

        // Forward integration
        vFwd += netFwdAccel * dt;
        vFwd = Math.max(-12.0, Math.min(this.maxSpeed, vFwd));
        vLat += latAccel * dt;

        this.vx = vFwd * fx + vLat * rx;
        this.vz = vFwd * fz + vLat * rz;
        this.speed = Math.hypot(this.vx, this.vz);

        this.x += this.vx * dt;
        this.z += this.vz * dt;

        // Check hillcrest launch
        const newGroundY = this.terrain ? this.terrain.getHeight(this.x, this.z) : 0.0;
        const drop = groundY - newGroundY;
        if (drop > 0.4 && Math.abs(vFwd) > 11.0) {
            this.isGrounded = false;
            this.vy = Math.max(-1.0, Math.sin(this.pitch) * vFwd);
            this.airTime += dt;
        } else {
            this.y = newGroundY;
        }

        this.wheelRotation += (vFwd * dt) / 0.35;

        this.checkCollisions();
    }

    checkCollisions() {
        // Building collision check
        this.collisionSpark = null;
        for (let i = 0; i < this.buildingObstacles.length; i++) {
            const b = this.buildingObstacles[i];
            if (this.x >= b.xMin && this.x <= b.xMax && this.z >= b.zMin && this.z <= b.zMax) {
                if (this.y >= b.baseY - 0.5 && this.y <= b.topY) {
                    // Collision detected! Bounce back
                    const cx = (b.xMin + b.xMax) / 2;
                    const cz = (b.zMin + b.zMax) / 2;
                    const dx = this.x - cx;
                    const dz = this.z - cz;
                    const dist = Math.hypot(dx, dz) || 1.0;

                    this.x += (dx / dist) * 1.5;
                    this.z += (dz / dist) * 1.5;
                    this.vx *= -0.3;
                    this.vz *= -0.3;
                    this.yawRate *= -0.5;

                    this.collisionSpark = { x: this.x, y: this.y + 0.5, z: this.z };
                    break;
                }
            }
        }
    }
}

window.RallyCarPhysics = RallyCarPhysics;
