#!/usr/bin/env python3
"""
Årølia Rally - Master Autonomous Verification Suite
Runs all mathematical, physical, topological, visual, and browser engine tests.
"""
import subprocess
import sys
import time

def run_step(name, cmd):
    print(f"\n=======================================================")
    print(f"RUNNING: {name}")
    print(f"COMMAND: {' '.join(cmd)}")
    print(f"=======================================================")
    t0 = time.time()
    res = subprocess.run(cmd, capture_output=True, text=True)
    dt = time.time() - t0
    
    if res.stdout:
        print(res.stdout.strip())
    if res.stderr:
        print(res.stderr.strip())
        
    if res.returncode == 0:
        print(f"--> [PASSED] {name} in {dt:.2f}s")
        return True
    else:
        print(f"--> [FAILED] {name} (Exit code {res.returncode}) in {dt:.2f}s")
        return False

def main():
    print("=======================================================")
    print("   ÅRØLIA RALLY 3D - AUTONOMOUS VERIFICATION LOOP      ")
    print("=======================================================")
    
    steps = [
        ("Python & Map Data Calibration Tests (pytest)", [sys.executable, "-m", "pytest", "-v"]),
        ("Math3D Matrix & Projection Unit Test", ["node", "tests/test_math3d.js"]),
        ("Full Game Engine Headless Integration Test", ["node", "tests/test_game_headless.js"]),
        ("Multi-touch Concurrency & Input State Test", ["node", "tests/test_multitouch.js"]),
        ("Strict Cache-Busting & Freshness Verification", ["node", "tests/test_cache_busting.js"]),
        ("3D Perspective Render & Visual Artifact Generator", [sys.executable, "tools/render_3d_preview.py"]),
    ]
    
    all_passed = True
    for name, cmd in steps:
        ok = run_step(name, cmd)
        if not ok:
            all_passed = False
            break
            
    print("\n=======================================================")
    if all_passed:
        print("[SUCCESS] ALL TESTS PASSED! Arolia Rally is 100% verified and ready to play.")
        print("Open http://localhost:8080 or index.html in any modern browser.")
        print("=======================================================")
        return 0
    else:
        print("[FAILED] VERIFICATION FAILED. Review errors above.")
        print("=======================================================")
        return 1

if __name__ == "__main__":
    sys.exit(main())
