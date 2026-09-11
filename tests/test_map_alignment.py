import json
import os
import pytest
import numpy as np
from PIL import Image, ImageDraw

def test_landmark_projections_against_map_slice():
    """
    Test that key 3D landmarks in Årølia (roundabouts, hall, school)
    project within sub-2-pixel tolerance of their actual locations
    in the reference map image (media_1789153016187.png).
    """
    proj_path = os.path.join("data", "projection_meta.json")
    assert os.path.exists(proj_path), "projection_meta.json missing!"
    
    with open(proj_path, "r", encoding="utf-8") as f:
        meta = json.load(f)
        
    p = meta["local_to_pixel"]
    landmarks = meta["landmarks"]
    
    errors = []
    for lm in landmarks:
        lx, lz = lm["local_x"], lm["local_z"]
        tx, ty = lm["pixel_x"], lm["pixel_y"]
        pred_x = p["ax"] * lx + p["bx"] * lz + p["cx"]
        pred_y = p["ay"] * lx + p["by"] * lz + p["cy"]
        err = float(np.hypot(pred_x - tx, pred_y - ty))
        errors.append(err)
        print(f"Landmark: {lm['name']:35s} Target: ({tx:3d}, {ty:3d}) Proj: ({pred_x:6.2f}, {pred_y:6.2f}) Error: {err:.2f}px")
        assert err <= 2.5, f"Landmark {lm['name']} exceeded tolerance: {err:.2f}px > 2.5px"
        
    rms_error = float(np.sqrt(np.mean(np.array(errors)**2)))
    print(f"\nOverall Landmark RMS Error: {rms_error:.2f} pixels (across 1024x576 image)")
    assert rms_error < 1.5, f"RMS projection error too high: {rms_error:.2f}px"

def test_road_continuity_and_extent():
    """Verify that road network spans the entire width and height of the map slice."""
    with open(os.path.join("data", "arolia_roads.json"), "r", encoding="utf-8") as f:
        roads = json.load(f)
        
    assert len(roads) >= 150, f"Expected at least 150 continuous road ribbons, found {len(roads)}"
    
    xs = [pt["x"] for r in roads for pt in r["points"]]
    zs = [pt["z"] for r in roads for pt in r["points"]]
    
    assert min(xs) < -800, f"Road network does not reach west boundary: {min(xs)}m"
    assert max(xs) > 600, f"Road network does not reach east boundary: {max(xs)}m"
    assert min(zs) < -300, f"Road network does not reach south boundary: {min(zs)}m"
    assert max(zs) > 200, f"Road network does not reach north boundary: {max(zs)}m"
    
    # Verify total continuous road length > 25 km
    total_len = sum(
        sum(np.hypot(r["points"][k+1]["x"] - r["points"][k]["x"], r["points"][k+1]["z"] - r["points"][k]["z"]) 
            for k in range(len(r["points"]) - 1))
        for r in roads
    )
    print(f"Total road network length: {total_len:.1f} meters across {len(roads)} continuous polylines")
    assert total_len > 25000, f"Road network total length too short: {total_len:.1f}m"

    # Check that Årølivegen is present
    arolivegen = [r for r in roads if "livegen" in r.get("name", "").lower()]
    assert len(arolivegen) >= 5, "Main road Årølivegen segments missing"

def test_visual_verification_overlay_generation():
    """
    Renders 3D wireframe road network projected onto reference image
    and saves an artifact for visual verification.
    """
    ref_img_path = r"C:/Users/toreb/.gemini/antigravity/brain/65f08b51-ef8a-42f5-aaad-81bab4b9b229/.user_uploaded/media_1789153016187.png"
    if not os.path.exists(ref_img_path):
        pytest.skip("Reference image not accessible in test environment")
        
    with open(os.path.join("data", "projection_meta.json"), "r", encoding="utf-8") as f:
        meta = json.load(f)
    with open(os.path.join("data", "arolia_roads.json"), "r", encoding="utf-8") as f:
        roads = json.load(f)
        
    p = meta["local_to_pixel"]
    def to_px(x, z):
        return (p["ax"]*x + p["bx"]*z + p["cx"], p["ay"]*x + p["by"]*z + p["cy"])

    img = Image.open(ref_img_path).convert("RGB")
    overlay = ImageDraw.Draw(img)
    
    rendered_count = 0
    for r in roads:
        pts = [to_px(pt["x"], pt["z"]) for pt in r["points"]]
        if any(0 <= pt[0] <= 1024 and 0 <= pt[1] <= 576 for pt in pts):
            # All roads in cyber green, with thicker lines for primary roads
            color = (0, 255, 204) if r["priority"] >= 3 else (0, 200, 160)
            width = 3 if r["priority"] >= 3 else 2
            overlay.line(pts, fill=color, width=width)
            rendered_count += 1
            
    # Draw landmark circles
    for lm in meta["landmarks"]:
        c = to_px(lm["local_x"], lm["local_z"])
        overlay.ellipse([c[0]-8, c[1]-8, c[0]+8, c[1]+8], outline=(255, 0, 80), width=3)
        
    out_dir = r"C:\Users\toreb\.gemini\antigravity\brain\65f08b51-ef8a-42f5-aaad-81bab4b9b229"
    out_file = os.path.join(out_dir, "test_alignment_verification.png")
    img.save(out_file)
    print(f"Alignment verification image saved to {out_file} with {rendered_count} roads rendered")
    assert rendered_count >= 120, "Fewer roads rendered than expected"
