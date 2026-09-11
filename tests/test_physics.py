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
    assert speed_kmh <= 155.0, f"Speed exceeded realistic limits: {speed_kmh:.1f} km/h"
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
