import pytest
from tools.simulate_headless import simulate_rally_lap

def test_ai_driver_completes_rally_course():
    """
    Simulate full stage from Årøhallen to Årølia skole.
    Verify that AI driver triggers all checkpoints within realistic time limit (< 90 seconds).
    """
    success, lap_time, trajectory = simulate_rally_lap(max_time=90.0)
    
    print(f"\nRally Stage Simulation Result:")
    print(f"  Course Completed: {success}")
    print(f"  Stage Time:       {lap_time:.2f} seconds")
    print(f"  Trajectory Points:{len(trajectory)}")
    
    assert success, "AI driver failed to navigate the full rally course within 90 seconds"
    assert 25.0 < lap_time < 80.0, f"Lap time outside reasonable range: {lap_time:.2f}s"
    assert len(trajectory) > 100, "Too few trajectory waypoints recorded"
    
    # Check that car drove through the key regions of Årølia:
    # 1. Start near Årøhallen (X < -800)
    # 2. Mid roundabout (X near 0)
    # 3. Finish near Årølia skole (X > 600)
    xs = [p["x"] for p in trajectory]
    assert min(xs) < -800, f"Car never visited Årøhallen start: min X={min(xs)}"
    assert any(abs(x) < 40 for x in xs), "Car never passed through central roundabout"
    assert max(xs) > 650, f"Car never reached Årølia skole finish: max X={max(xs)}"
