import pytest
import math
from tools.simulate_headless import RallyCarPhysics

def test_car_acceleration_and_top_speed():
    """Test straight-line acceleration from standstill to highway speed."""
    car = RallyCarPhysics(terrain_sampler=lambda x, z: 0.0)
    car.reset(0.0, 0.0, 0.0)
    
    dt = 1.0 / 60.0
    # Accelerate for 5 seconds
    for _ in range(300):
        car.update(throttle=1.0, steer=0.0, brake=0.0, handbrake=False, dt=dt)
        
    speed_kmh = car.speed * 3.6
    print(f"\nSpeed after 5 seconds: {speed_kmh:.1f} km/h (Gear {car.gear}, RPM {car.rpm:.0f})")
    assert speed_kmh > 80.0, f"Acceleration too sluggish: {speed_kmh:.1f} km/h"
    assert speed_kmh <= 310.0, f"Speed exceeded realistic limits: {speed_kmh:.1f} km/h"
    assert car.gear >= 3, "Car should shift up through gears"

def test_braking_and_handbrake_drift():
    """Test braking distance and handbrake lateral slip."""
    car = RallyCarPhysics(terrain_sampler=lambda x, z: 0.0)
    car.reset(0.0, 0.0, 0.0)
    
    dt = 1.0 / 60.0
    # Build up speed to 70 km/h (~19.4 m/s)
    while car.speed < 19.4:
        car.update(throttle=1.0, steer=0.0, brake=0.0, handbrake=False, dt=dt)
        
    start_brake_x = car.x
    start_brake_z = car.z
    # Hard braking
    brake_ticks = 0
    while car.speed > 0.5 and brake_ticks < 180:
        car.update(throttle=0.0, steer=0.0, brake=1.0, handbrake=False, dt=dt)
        brake_ticks += 1
        
    brake_dist = math.hypot(car.x - start_brake_x, car.z - start_brake_z)
    print(f"\nBraking distance from 70 km/h: {brake_dist:.1f}m in {brake_ticks*dt:.2f}s")
    assert brake_dist < 28.0, f"Braking distance too long: {brake_dist:.1f}m"
    
    # Test handbrake drift initiation
    car.reset(0.0, 0.0, 0.0)
    while car.speed < 18.0:
        car.update(throttle=1.0, steer=0.0, brake=0.0, handbrake=False, dt=dt)
    
    # Pull handbrake and turn wheel hard
    for _ in range(30):
        car.update(throttle=0.3, steer=1.0, brake=0.0, handbrake=True, dt=dt)
        
    print(f"Handbrake drift lateral slip: {abs(car.drift_slip):.2f} m/s")
    assert abs(car.drift_slip) > 2.0, "Handbrake failed to induce drift slide"

def test_airborne_jump_and_landing():
    """Test gravity and landing when flying over a sudden crest."""
    # Custom terrain with a sudden 3m drop ramp
    def ramp_terrain(x, z):
        if z < 50.0:
            return 20.0
        else:
            return 14.0 # 6m cliff/crest
            
    car = RallyCarPhysics(terrain_sampler=ramp_terrain)
    car.reset(0.0, 0.0, 0.0)
    
    dt = 1.0 / 60.0
    # Accelerate towards cliff
    airborne_detected = False
    max_air_time = 0.0
    for _ in range(300):
        car.update(throttle=1.0, steer=0.0, brake=0.0, handbrake=False, dt=dt)
        if not car.is_grounded:
            airborne_detected = True
            max_air_time = max(max_air_time, car.air_time)
            
    print(f"\nAirborne jump detected: {airborne_detected}, Max air time: {max_air_time:.2f}s")
    assert airborne_detected, "Car did not take off when flying off crest"
    assert max_air_time > 0.2, "Car did not stay in air during jump"
    assert car.is_grounded, "Car should have landed back on ground after jump"

def test_car_follows_downhill_and_uphill_slopes():
    """Verify that car pitch and 4-wheel contact accurately follow downhill and uphill slopes."""
    # 15% downhill slope facing South (-Z direction in Årølia towards the fjord)
    def downhill_terrain(x, z):
        return 50.0 - 0.15 * z  # downhill when moving in +Z

    car = RallyCarPhysics(terrain_sampler=downhill_terrain)
    car.reset(0.0, 50.0, 0.0)
    car.yaw = 0.0 # Facing +Z (downhill)

    dt = 1.0 / 60.0
    for _ in range(30):
        car.update(throttle=0.0, steer=0.0, brake=0.0, handbrake=False, dt=dt)

    expected_pitch = math.atan2(-0.15 * 2.73, 2.73)
    print(f"\nDownhill test: Car Pitch = {math.degrees(car.pitch):.2f} deg, Expected ~ {math.degrees(expected_pitch):.2f} deg")
    assert car.pitch < -0.05, f"Car nose did not pitch down on downhill slope: {car.pitch}"
    assert abs(car.pitch - expected_pitch) < 0.03, "Pitch did not accurately match slope angle"

    # Uphill test
    car.yaw = math.pi # Facing -Z (uphill)
    for _ in range(30):
        car.update(throttle=0.0, steer=0.0, brake=0.0, handbrake=False, dt=dt)

    print(f"Uphill test: Car Pitch = {math.degrees(car.pitch):.2f} deg")
    assert car.pitch > 0.05, f"Car nose did not pitch up on uphill slope: {car.pitch}"

def test_off_road_slowdown_penalty():
    """Verify that driving off-road applies drag penalty, caps top speed, and decelerates car."""
    # Define a single straight road corridor along Z axis at X=0, width 8m
    roads = [{
        "osm_id": 1,
        "name": "Test Highway",
        "type": "secondary",
        "width": 8.0,
        "points": [{"x": 0.0, "z": -200.0}, {"x": 0.0, "z": 200.0}],
        "is_closed": False
    }]

    dt = 1.0 / 60.0

    # 1. On-road car: driving along center of road
    car_on_road = RallyCarPhysics(terrain_sampler=lambda x, z: 0.0, roads=roads)
    car_on_road.reset(0.0, 0.0, 0.0) # On-road at x=0, z=0 heading +Z
    for _ in range(180): # 3 seconds full throttle
        car_on_road.update(throttle=1.0, steer=0.0, brake=0.0, handbrake=False, dt=dt)

    assert car_on_road.is_on_road, "Car on centerline should be detected as on-road"
    assert car_on_road.off_road_ratio < 0.05, "Car on road should have near-zero off-road ratio"
    assert car_on_road.speed > 25.0, f"Car on road should accelerate freely: {car_on_road.speed:.1f} m/s"

    # 2. Off-road car: driving in terrain at X=40 (far outside 8m road)
    car_off_road = RallyCarPhysics(terrain_sampler=lambda x, z: 0.0, roads=roads)
    car_off_road.reset(40.0, 0.0, 0.0) # Off-road at x=40, z=0 heading +Z
    for _ in range(180): # 3 seconds full throttle
        car_off_road.update(throttle=1.0, steer=0.0, brake=0.0, handbrake=False, dt=dt)

    assert not car_off_road.is_on_road, "Car at x=40 should be detected as off-road"
    assert car_off_road.off_road_ratio > 0.9, "Off-road ratio should ramp up close to 1.0"
    assert car_off_road.speed <= 13.0, f"Off-road top speed should be capped near 12 m/s: {car_off_road.speed:.1f} m/s"
    print(f"\nOn-road speed after 3s: {car_on_road.speed*3.6:.1f} km/h vs Off-road speed: {car_off_road.speed*3.6:.1f} km/h")

    # 3. Off-road deceleration: High-speed car entering terrain slows down automatically
    car_decel = RallyCarPhysics(terrain_sampler=lambda x, z: 0.0, roads=roads)
    car_decel.reset(40.0, 0.0, 0.0)
    car_decel.vx = 0.0
    car_decel.vz = 50.0 # 50 m/s (~180 km/h) into grass
    car_decel.speed = 50.0
    for _ in range(180): # 3 seconds in grass even with full throttle
        car_decel.update(throttle=1.0, steer=0.0, brake=0.0, handbrake=False, dt=dt)

    print(f"Off-road entry from 180 km/h decelerated to: {car_decel.speed*3.6:.1f} km/h in 3s")
    assert car_decel.speed < 15.0, f"Off-road car failed to brake down to grass crawl speed: {car_decel.speed:.1f} m/s"

