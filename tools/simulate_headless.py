import math
import json
import os

class RallyCarPhysics:
    def __init__(self, terrain_sampler=None, roads=None):
        self.terrain_sampler = terrain_sampler or (lambda x, z: 0.0)
        self.roads = roads
        self.road_index = self.prepare_roads(roads)
        self.is_on_road = True
        self.off_road_ratio = 0.0
        self.reset(-838.0, -335.0, math.radians(88.0))
        
        # Vehicle Constants
        self.mass = 1150.0 # kg
        self.wheelbase = 2.5 # m
        self.max_steer = math.radians(35.0)
        self.max_speed = 84.0 # m/s (~302 km/h, doubled from 42.0 m/s)
        self.top_gear_speeds = [0.0, 24.0, 44.0, 62.0, 76.0, 90.0] # m/s
        self.gravity = 9.81

    def prepare_roads(self, roads):
        if not roads:
            return []
        road_index = []
        for r in roads:
            pts = r.get("points", [])
            w = r.get("width", 7.5)
            hw = w * 0.5
            if not pts:
                continue
            xs = [p["x"] for p in pts]
            zs = [p["z"] for p in pts]
            min_x = min(xs) - hw - 4.0
            max_x = max(xs) + hw + 4.0
            min_z = min(zs) - hw - 4.0
            max_z = max(zs) + hw + 4.0
            
            segs = []
            n = len(pts)
            count = n if r.get("is_closed", False) else n - 1
            for i in range(count):
                p1 = pts[i]
                p2 = pts[(i + 1) % n]
                dx = p2["x"] - p1["x"]
                dz = p2["z"] - p1["z"]
                len_sq = dx * dx + dz * dz
                if len_sq > 0.001:
                    segs.append({
                        "x1": p1["x"],
                        "z1": p1["z"],
                        "dx": dx,
                        "dz": dz,
                        "len_sq": len_sq,
                        "hw": hw
                    })
            road_index.append({
                "min_x": min_x,
                "max_x": max_x,
                "min_z": min_z,
                "max_z": max_z,
                "segments": segs
            })
        return road_index

    def check_on_road(self, x, z, tolerance=1.2):
        if not self.road_index:
            return True
        for r in self.road_index:
            if x < r["min_x"] or x > r["max_x"] or z < r["min_z"] or z > r["max_z"]:
                continue
            for s in r["segments"]:
                t = max(0.0, min(1.0, ((x - s["x1"]) * s["dx"] + (z - s["z1"]) * s["dz"]) / s["len_sq"]))
                px = s["x1"] + t * s["dx"]
                pz = s["z1"] + t * s["dz"]
                d_sq = (x - px) ** 2 + (z - pz) ** 2
                thresh = s["hw"] + tolerance
                if d_sq <= thresh * thresh:
                    return True
        return False
        
    def reset(self, x, z, heading_rad):
        self.x = x
        self.z = z
        self.y = self.terrain_sampler(x, z)
        self.vx = 0.0
        self.vy = 0.0
        self.vz = 0.0
        self.yaw = heading_rad
        self.yaw_rate = 0.0
        self.pitch = 0.0
        self.roll = 0.0
        self.speed = 0.0
        self.drift_slip = 0.0
        self.steer_input = 0.0
        self.steer_angle = 0.0
        self.rpm = 900.0
        self.gear = 1
        self.is_grounded = True
        self.air_time = 0.0
        self.handbrake = False
        
    def update(self, throttle, steer, brake, handbrake, dt=1.0/60.0):
        """
        throttle: float [0, 1]
        steer: float [-1 (left), +1 (right)]
        brake: float [0, 1]
        handbrake: bool
        """
        # Smart keyboard steering filter
        # Smooth attack ramping with fast return-to-center and counter-steering
        if steer > 0:
            rate = 9.0 if self.steer_input < 0 else 4.5
            self.steer_input = min(1.0, self.steer_input + rate * dt)
        elif steer < 0:
            rate = 9.0 if self.steer_input > 0 else 4.5
            self.steer_input = max(-1.0, self.steer_input - rate * dt)
        else:
            decay_rate = 7.0
            if self.steer_input > 0:
                self.steer_input = max(0.0, self.steer_input - decay_rate * dt)
            elif self.steer_input < 0:
                self.steer_input = min(0.0, self.steer_input + decay_rate * dt)

        # Non-linear progressive response (soft center for calm lane-keeping)
        curved_input = math.copysign(abs(self.steer_input) ** 1.35, self.steer_input) if self.steer_input != 0 else 0.0

        # Speed-sensitive steering scale (smooth taper at high speed)
        speed_kmh = abs(self.speed) * 3.6
        speed_scale = 1.0 / (1.0 + (speed_kmh / 50.0) * 0.95)
        self.steer_angle = curved_input * self.max_steer * speed_scale
        
        # Forward vector: in our coord system, +X = East, +Z = North
        # Heading 0 = North (+Z), Heading pi/2 = East (+X)
        fx = math.sin(self.yaw)
        fz = math.cos(self.yaw)
        # Right vector
        rx = math.cos(self.yaw)
        rz = -math.sin(self.yaw)
        
        # 4-wheel contact patch terrain sampling
        Lw = 1.365 # half wheelbase
        Ww = 0.98  # half track width

        hFL = self.terrain_sampler(self.x + fx * Lw - rx * Ww, self.z + fz * Lw - rz * Ww)
        hFR = self.terrain_sampler(self.x + fx * Lw + rx * Ww, self.z + fz * Lw + rz * Ww)
        hRL = self.terrain_sampler(self.x - fx * Lw - rx * Ww, self.z - fz * Lw - rz * Ww)
        hRR = self.terrain_sampler(self.x - fx * Lw + rx * Ww, self.z - fz * Lw + rz * Ww)

        hFront = (hFL + hFR) * 0.5
        hRear  = (hRL + hRR) * 0.5
        hRight = (hFR + hRR) * 0.5
        hLeft  = (hFL + hRL) * 0.5

        ground_y = (hFront + hRear) * 0.5
        target_pitch = math.atan2(hFront - hRear, 2.0 * Lw)
        target_roll = math.atan2(hRight - hLeft, 2.0 * Ww)
        
        # Check if grounded
        if self.y <= ground_y + 0.08:
            self.is_grounded = True
            self.y = ground_y
            if self.vy < 0:
                self.vy = 0
            self.air_time = 0.0
            self.pitch += (target_pitch - self.pitch) * min(1.0, dt * 20.0)
            self.roll += (target_roll - self.roll) * min(1.0, dt * 20.0)
        else:
            self.is_grounded = False
            self.air_time += dt
            flight_pitch = math.atan2(self.vy, max(1.0, self.speed))
            self.pitch += (flight_pitch - self.pitch) * min(1.0, dt * 4.0)
            self.roll += (0.0 - self.roll) * min(1.0, dt * 4.0)
            
        if not self.is_grounded:
            # Airborne dynamics: gravity + aerodynamic damping
            self.vy -= self.gravity * dt
            self.y += self.vy * dt
            self.x += self.vx * dt
            self.z += self.vz * dt
            self.yaw += self.yaw_rate * dt * 0.5
            self.speed = math.sqrt(self.vx**2 + self.vz**2)
            return
        
        # Decompose velocity into forward and lateral components
        v_fwd = self.vx * fx + self.vz * fz
        v_lat = self.vx * rx + self.vz * rz
        
        # Check whether car is on asphalt road or off-road in grass/terrain
        self.is_on_road = self.check_on_road(self.x, self.z, 1.2)
        target_off_road = 0.0 if self.is_on_road else 1.0
        self.off_road_ratio += (target_off_road - self.off_road_ratio) * min(1.0, dt * 10.0)

        # Transmission & Engine RPM
        for g in range(1, 6):
            if abs(v_fwd) < self.top_gear_speeds[g] or g == 5:
                self.gear = g
                break
        
        gear_ratio = 1.0 - (self.gear - 1) * 0.155
        target_rpm = 900.0 + (abs(v_fwd) / self.max_speed) * 6000.0 + throttle * 1200.0
        self.rpm += (target_rpm - self.rpm) * min(1.0, dt * 10.0)
        
        # Driving forces with upper-speed acceleration taper
        abs_v = abs(v_fwd)
        high_speed_taper = 1.0
        if abs_v > 45.0:
            progress = (abs_v - 45.0) / (self.max_speed - 45.0)
            high_speed_taper = 1.0 - 0.45 * (min(1.0, progress) ** 1.25)
            
        accel_force = throttle * 22.0 * gear_ratio * high_speed_taper
        if self.off_road_ratio > 0.3 and v_fwd > 12.0:
            accel_force *= max(0.0, 1.0 - (v_fwd - 12.0) / 6.0)

        brake_force = brake * 36.0
        off_road_drag = self.off_road_ratio * 14.0
        rolling_resistance = 0.5 + 0.015 * abs_v + off_road_drag
        aero_drag = 0.0003 * (v_fwd ** 2)
        
        # Slope resistance (gravity component along slope)
        slope_resistance = math.sin(self.pitch) * self.gravity
        
        # Forward acceleration
        net_fwd_accel = accel_force - math.copysign(brake_force, v_fwd if abs(v_fwd) > 0.1 else 1.0) - math.copysign(rolling_resistance + aero_drag, v_fwd) - slope_resistance
        
        # Lateral friction (grip vs drift, grass feels slicker)
        grip_factor = 30.0 - self.off_road_ratio * 14.0
        if handbrake:
            grip_factor = 6.0 - self.off_road_ratio * 2.0
            brake_force += 18.0
            
        lat_accel = -v_lat * grip_factor
        self.drift_slip = v_lat
        
        # Turning rate (Ackermann-like yaw rate)
        target_yaw_rate = (v_fwd / self.wheelbase) * math.tan(self.steer_angle)
        # Add drift oversteer if sliding
        if handbrake or abs(v_lat) > 2.0:
            oversteer = -v_lat * 0.08 * (1.0 if v_fwd >= 0 else -1.0)
            target_yaw_rate += oversteer
            
        self.yaw_rate += (target_yaw_rate - self.yaw_rate) * min(1.0, dt * 12.0)
        
        # High-speed yaw stabilization assist (anti-twitch dampener on straights)
        if not handbrake and abs(self.steer_input) < 0.15:
            stab_factor = min(1.0, abs(v_fwd) / 12.0)
            self.yaw_rate *= max(0.0, 1.0 - dt * 6.0 * stab_factor)

        self.yaw += self.yaw_rate * dt
        
        # Update velocities (clamped while deep off-road)
        v_fwd += net_fwd_accel * dt
        effective_max_speed = self.max_speed * (1.0 - self.off_road_ratio * 0.85)
        v_fwd = max(-18.0, min(effective_max_speed, v_fwd))
        v_lat += lat_accel * dt
        
        # Recombine to world velocity
        self.vx = v_fwd * fx + v_lat * rx
        self.vz = v_fwd * fz + v_lat * rz
        self.speed = math.sqrt(self.vx**2 + self.vz**2)
        
        # Position update
        self.x += self.vx * dt
        self.z += self.vz * dt
        
        # Check if cresting a hill at high speed -> jump!
        new_ground_y = self.terrain_sampler(self.x, self.z)
        y_drop = ground_y - new_ground_y
        if y_drop > 0.4 and abs(v_fwd) > 10.0:
            # Car launched into air over crest
            self.is_grounded = False
            self.vy = max(-1.0, math.sin(self.pitch) * v_fwd)
            self.air_time += dt
        else:
            self.y = new_ground_y

def simulate_rally_lap(max_time=120.0):
    """
    AI Rally Driver: Traverses all checkpoints using pure pursuit guidance.
    Returns (success, lap_time, trajectory)
    """
    with open(os.path.join("data", "rally_track.json"), "r", encoding="utf-8") as f:
        track = json.load(f)
    with open(os.path.join("data", "arolia_terrain.json"), "r", encoding="utf-8") as f:
        terrain = json.load(f)
    with open(os.path.join("data", "arolia_roads.json"), "r", encoding="utf-8") as f:
        roads = json.load(f)
        
    grid_step = terrain["grid_step"]
    x_min = terrain["x_min"]
    z_min = terrain["z_min"]
    nx = terrain["nx"]
    nz = terrain["nz"]
    vertices = terrain["vertices"]
    
    def terrain_height(x, z):
        u = (x - x_min) / grid_step
        v = (z - z_min) / grid_step
        u = max(0.0, min(nx - 1.0001, u))
        v = max(0.0, min(nz - 1.0001, v))
        i0, j0 = int(u), int(v)
        i1 = min(nx - 1, i0 + 1)
        j1 = min(nz - 1, j0 + 1)
        fu, fv = u - i0, v - j0
        y00 = vertices[j0][i0]["y"]
        y10 = vertices[j0][i1]["y"]
        y01 = vertices[j1][i0]["y"]
        y11 = vertices[j1][i1]["y"]
        return (y00*(1-fu) + y10*fu)*(1-fv) + (y01*(1-fu) + y11*fu)*fv

    checkpoints = track["checkpoints"]
    car = RallyCarPhysics(terrain_sampler=terrain_height, roads=roads)
    start_cp = checkpoints[0]
    car.reset(start_cp["x"], start_cp["z"], math.radians(start_cp["heading"]))
    
    current_cp_idx = 1
    total_cps = len(checkpoints)
    
    dt = 1.0 / 60.0
    sim_time = 0.0
    trajectory = []
    
    while sim_time < max_time and current_cp_idx < total_cps:
        target = checkpoints[current_cp_idx]
        dx = target["x"] - car.x
        dz = target["z"] - car.z
        dist = math.hypot(dx, dz)
        
        # Checkpoint hit detection
        if dist < target["width"]:
            current_cp_idx += 1
            if current_cp_idx >= total_cps:
                break
            continue
            
        # Target angle
        target_heading = math.atan2(dx, dz)
        heading_diff = target_heading - car.yaw
        # Normalize angle to [-pi, pi]
        heading_diff = (heading_diff + math.pi) % (2 * math.pi) - math.pi
        
        # Steering PID-like response
        steer_cmd = max(-1.0, min(1.0, heading_diff * 1.8))
        
        # Throttle / brake logic: brake if sharp turn approaching
        if abs(heading_diff) > 0.5 and car.speed > 14.0:
            throttle_cmd = 0.2
            brake_cmd = 0.6
            handbrake_cmd = abs(heading_diff) > 0.9 and car.speed > 16.0
        else:
            throttle_cmd = 1.0
            brake_cmd = 0.0
            handbrake_cmd = False
            
        car.update(throttle_cmd, steer_cmd, brake_cmd, handbrake_cmd, dt)
        sim_time += dt
        
        if int(sim_time / dt) % 10 == 0:
            trajectory.append({
                "t": round(sim_time, 2),
                "x": round(car.x, 1),
                "y": round(car.y, 1),
                "z": round(car.z, 1),
                "speed_kmh": round(car.speed * 3.6, 1),
                "cp": current_cp_idx
            })
            
    success = (current_cp_idx >= total_cps)
    return success, sim_time, trajectory

if __name__ == "__main__":
    success, time_sec, traj = simulate_rally_lap()
    print(f"Rally Lap Simulation: Success={success}, Time={time_sec:.2f}s, Trajectory points={len(traj)}")
    if traj:
        print(f"Max speed: {max(p['speed_kmh'] for p in traj)} km/h")
