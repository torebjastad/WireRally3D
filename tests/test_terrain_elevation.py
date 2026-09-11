import json
import os
import pytest
import numpy as np

def test_elevation_dataset_properties():
    """Verify terrain mesh contains valid elevation values matching Årølia topography."""
    terrain_path = os.path.join("data", "arolia_terrain.json")
    assert os.path.exists(terrain_path), "arolia_terrain.json missing!"
    
    with open(terrain_path, "r", encoding="utf-8") as f:
        terrain = json.load(f)
        
    vertices = terrain["vertices"]
    all_y = [v["y"] for row in vertices for v in row]
    
    min_y = min(all_y)
    max_y = max(all_y)
    print(f"\nTerrain Elevation: Min={min_y:.1f}m, Max={max_y:.1f}m")
    
    # In Årølia, lower parts near E39 are around 15-35m, hilltops reach over 100m
    assert min_y >= 0.0, f"Elevation cannot be below sea level on land: {min_y}"
    assert min_y < 45.0, f"Low elevation unexpectedly high: {min_y}"
    assert max_y > 90.0, f"Hilltop elevation too low: {max_y}"

def test_hillside_slope_gradient():
    """
    Verify the general south-to-north slope in Årølia:
    Rising from the fjord (south, Z < -200) up to the hills (north, Z > +150).
    """
    with open(os.path.join("data", "arolia_terrain.json"), "r", encoding="utf-8") as f:
        terrain = json.load(f)
        
    vertices = terrain["vertices"]
    # Sample south row (near bottom) vs north row (near top)
    south_elevations = [v["y"] for v in vertices[2]]
    north_elevations = [v["y"] for v in vertices[-3]]
    
    avg_south = np.mean(south_elevations)
    avg_north = np.mean(north_elevations)
    print(f"Average elevation South: {avg_south:.1f}m vs North: {avg_north:.1f}m")
    
    assert avg_north > avg_south + 30.0, (
        f"Expected northern hillside to be at least 30m higher than southern terrain. "
        f"South: {avg_south:.1f}m, North: {avg_north:.1f}m"
    )

def test_rally_stage_elevation_continuity():
    """Verify that the rally course path has continuous, realistic road elevations."""
    with open(os.path.join("data", "rally_track.json"), "r", encoding="utf-8") as f:
        track = json.load(f)
        
    cps = track["checkpoints"]
    assert len(cps) >= 8, f"Expected at least 8 checkpoints, found {len(cps)}"
    
    elevs = [cp["y"] for cp in cps]
    print(f"Rally Course checkpoints elevation profile: {elevs}")
    
    # Check that start is at Årøhallen (~40.4m) and course climbs up Årølivegen (up to ~73m)
    assert cps[0]["y"] < 45.0, f"Start elevation too high: {cps[0]['y']}m"
    assert max(elevs) > 65.0, f"Course should climb uphill along Årølivegen"
    
    # Check no massive elevation discontinuity between consecutive checkpoints
    for i in range(len(cps) - 1):
        diff = abs(cps[i+1]["y"] - cps[i]["y"])
        dist = np.hypot(cps[i+1]["x"] - cps[i]["x"], cps[i+1]["z"] - cps[i]["z"])
        grade = diff / max(1.0, dist)
        print(f"Segment {cps[i]['name']} -> {cps[i+1]['name']}: Dist={dist:.1f}m, Grade={grade*100:.1f}%")
        # Normal roads have grade < 25%
        assert grade < 0.25, f"Road grade too steep between checkpoints {i} and {i+1}: {grade*100:.1f}%"
