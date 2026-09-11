// Vehicle physics engine for Årølia Rally
class RallyCarPhysics {
    constructor(terrain, buildings = [], roads = []) {
        this.terrain = terrain;
        this.buildings = buildings;
        this.roads = roads;

        // Vehicle specifications
        this.mass = 1150.0;
        this.wheelbase = 2.5;
        this.width = 1.8;
        this.length = 4.2;
        this.maxSteer = 35.0 * Math.PI / 180.0;
        this.maxSpeed = 84.0; // m/s (~302 km/h, doubled from 42.0 m/s)
        this.topGearSpeeds = [0.0, 24.0, 44.0, 62.0, 76.0, 90.0];
        this.gravity = 9.81;

        // Spatial index for road surface detection
        this.roadIndex = this.prepareRoads(roads);
        this.isOnRoad = true;
        this.offRoadRatio = 0.0;

        // Collision bounding boxes for buildings
        this.buildingObstacles = this.prepareBuildings(buildings);

        this.reset(-838.0, -335.0, 88.0 * Math.PI / 180.0);
    }

    prepareBuildings(buildings) {
        const result = [];
        for (let i = 0; i < buildings.length; i++) {
            const b = buildings[i];
            if (!b.polygon || b.polygon.length < 3) continue;

            // Compute polygon area using the shoelace formula; skip tiny structures
            const poly = b.polygon;
            let area = 0;
            for (let j = 0; j < poly.length; j++) {
                const k = (j + 1) % poly.length;
                area += poly[j].x * poly[k].z - poly[k].x * poly[j].z;
            }
            area = Math.abs(area) * 0.5;
            if (area < 4.0) continue; // Skip buildings smaller than 4 m²

            const xs = poly.map(p => p.x);
            const zs = poly.map(p => p.z);
            const pad = 0.3; // Reduced padding (was 0.8m) — less phantom overshoot

            result.push({
                xMin: Math.min(...xs) - pad,
                xMax: Math.max(...xs) + pad,
                zMin: Math.min(...zs) - pad,
                zMax: Math.max(...zs) + pad,
                baseY: b.base_y,
                topY: b.base_y + b.height,
                polygon: poly // Store for point-in-polygon test
            });
        }
        return result;
    }

    prepareRoads(roads) {
        if (!roads || !roads.length) return [];
        return roads.map(r => {
            const pts = r.points || [];
            const w = r.width || 7.5;
            const hw = w * 0.5;
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            for (let i = 0; i < pts.length; i++) {
                const p = pts[i];
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.z < minZ) minZ = p.z;
                if (p.z > maxZ) maxZ = p.z;
            }
            const segs = [];
            const n = pts.length;
            const count = r.is_closed ? n : n - 1;
            for (let i = 0; i < count; i++) {
                const p1 = pts[i];
                const p2 = pts[(i + 1) % n];
                const dx = p2.x - p1.x;
                const dz = p2.z - p1.z;
                const lenSq = dx * dx + dz * dz;
                if (lenSq > 0.001) {
                    segs.push({
                        x1: p1.x,
                        z1: p1.z,
                        dx: dx,
                        dz: dz,
                        lenSq: lenSq,
                        hw: hw
                    });
                }
            }
            return {
                minX: minX - hw - 4.0,
                maxX: maxX + hw + 4.0,
                minZ: minZ - hw - 4.0,
                maxZ: maxZ + hw + 4.0,
                segments: segs
            };
        });
    }

    checkOnRoad(x, z, tolerance = 1.2) {
        if (!this.roadIndex || this.roadIndex.length === 0) return true;
        for (let i = 0; i < this.roadIndex.length; i++) {
            const r = this.roadIndex[i];
            if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
            const segs = r.segments;
            for (let j = 0; j < segs.length; j++) {
                const s = segs[j];
                const t = Math.max(0.0, Math.min(1.0, ((x - s.x1) * s.dx + (z - s.z1) * s.dz) / s.lenSq));
                const px = s.x1 + t * s.dx;
                const pz = s.z1 + t * s.dz;
                const dSq = (x - px) * (x - px) + (z - pz) * (z - pz);
                const threshold = s.hw + tolerance;
                if (dSq <= threshold * threshold) {
                    return true;
                }
            }
        }
        return false;
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

        // Smart steering filter supporting continuous analog (mouse drag) and digital (keyboard) input
        // 1. Target-approaching rate limiter with rapid counter-steering and auto return-to-center
        const targetSteer = Math.max(-1.0, Math.min(1.0, steer));
        if (targetSteer > this.steerInput) {
            const rate = (this.steerInput < 0) ? 12.0 : 6.5;
            this.steerInput = Math.min(targetSteer, this.steerInput + rate * dt);
        } else if (targetSteer < this.steerInput) {
            const rate = (this.steerInput > 0) ? 12.0 : 6.5;
            this.steerInput = Math.max(targetSteer, this.steerInput - rate * dt);
        } else if (targetSteer === 0) {
            const decayRate = 8.0;
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

        // Check whether car is on asphalt road or off-road in grass/terrain
        this.isOnRoad = this.checkOnRoad(this.x, this.z, 1.8);
        const targetOffRoad = this.isOnRoad ? 0.0 : 1.0;
        this.offRoadRatio += (targetOffRoad - this.offRoadRatio) * Math.min(1.0, dt * 4.0);

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

        const gearRatio = 1.0 - (Math.max(1, this.gear) - 1) * 0.155;
        const targetRpm = 900.0 + (Math.abs(vFwd) / this.maxSpeed) * 6000.0 + throttle * 1400.0;
        this.rpm += (targetRpm - this.rpm) * Math.min(1.0, dt * 10.0);

        // Driving forces with upper-speed acceleration taper
        // Low and mid speeds (< 45 m/s) maintain punchy response out of corners and roundabouts.
        // As speed climbs towards 84 m/s, acceleration gradually tapers off so reaching the very top
        // speed requires a sustained straight.
        const absV = Math.abs(vFwd);
        let highSpeedTaper = 1.0;
        if (absV > 45.0) {
            const progress = (absV - 45.0) / (this.maxSpeed - 45.0);
            highSpeedTaper = 1.0 - 0.45 * Math.pow(Math.min(1.0, progress), 1.25);
        }

        // Off-road slowdown penalty: smooth drag in grass/dirt and gentle engine taper above 20 m/s
        const offRoadDrag = this.offRoadRatio * 4.5;
        let accelForce = throttle * 22.0 * gearRatio * highSpeedTaper;
        if (this.offRoadRatio > 0.2 && vFwd > 20.0) {
            const powerTaper = Math.max(0.25, 1.0 - (vFwd - 20.0) / 12.0);
            accelForce *= (1.0 - this.offRoadRatio * (1.0 - powerTaper));
        }
        if (brake > 0 && vFwd < 0.2 && throttle === 0) {
            // Reverse drive
            accelForce = -brake * 10.0;
            brake = 0;
            this.gear = -1;
        }

        let brakeForce = brake * 36.0;
        const rollingResistance = 0.5 + 0.015 * absV + offRoadDrag;
        const aeroDrag = 0.0003 * (vFwd * vFwd);
        const slopeResistance = Math.sin(this.pitch) * this.gravity;

        const netFwdAccel = accelForce - (vFwd !== 0 ? Math.sign(vFwd) * brakeForce : 0) - (vFwd !== 0 ? Math.sign(vFwd) * (rollingResistance + aeroDrag) : 0) - slopeResistance;

        // Lateral grip & drift physics (grass feels slicker and looser, but still steerable)
        let gripFactor = 30.0 - this.offRoadRatio * 8.0;
        if (handbrake) {
            gripFactor = 6.0 - this.offRoadRatio * 1.5;
            brakeForce += 18.0;
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

        // Forward integration (natural deceleration via forces without artificial speed truncation)
        vFwd += netFwdAccel * dt;
        vFwd = Math.max(-18.0, Math.min(this.maxSpeed, vFwd));
        vLat += latAccel * dt;

        this.vx = vFwd * fx + vLat * rx;
        this.vz = vFwd * fz + vLat * rz;
        this.speed = Math.hypot(this.vx, this.vz);

        this.x += this.vx * dt;
        this.z += this.vz * dt;

        // Check hillcrest launch
        const newGroundY = this.terrain ? this.terrain.getHeight(this.x, this.z) : 0.0;
        const drop = groundY - newGroundY;
        if (drop > 0.4 && Math.abs(vFwd) > 16.0) {
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
            // Fast AABB early reject
            if (this.x < b.xMin || this.x > b.xMax || this.z < b.zMin || this.z > b.zMax) continue;
            // Height check
            if (this.y < b.baseY - 0.5 || this.y > b.topY) continue;
            // Point-in-polygon ray-cast test (XZ plane)
            if (!this.pointInPolygon(this.x, this.z, b.polygon)) continue;

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

    // Ray-casting point-in-polygon test (XZ plane, works for any simple polygon)
    pointInPolygon(px, pz, polygon) {
        let inside = false;
        const n = polygon.length;
        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = polygon[i].x, zi = polygon[i].z;
            const xj = polygon[j].x, zj = polygon[j].z;
            if ((zi > pz) !== (zj > pz) &&
                px < (xj - xi) * (pz - zi) / (zj - zi) + xi) {
                inside = !inside;
            }
        }
        return inside;
    }
}

window.RallyCarPhysics = RallyCarPhysics;
