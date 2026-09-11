import json
import os

DATA_DIR = r"c:\Users\toreb\OneDrive\Code\ÅrøliaRally\data"
JS_DATA_DIR = r"c:\Users\toreb\OneDrive\Code\ÅrøliaRally\js\data"
os.makedirs(JS_DATA_DIR, exist_ok=True)

bundle = {}
for name in ["arolia_roads", "arolia_buildings", "arolia_terrain", "rally_track", "scenery", "projection_meta"]:
    with open(os.path.join(DATA_DIR, f"{name}.json"), "r", encoding="utf-8") as f:
        bundle[name] = json.load(f)

bundle_js_path = os.path.join(JS_DATA_DIR, "bundle.js")
with open(bundle_js_path, "w", encoding="utf-8") as f:
    f.write("// Auto-generated Årølia Rally Data Bundle\n")
    f.write("window.AROLIA_DATA = ")
    json.dump(bundle, f)
    f.write(";\n")

print(f"Data bundle written to {bundle_js_path} ({os.path.getsize(bundle_js_path) // 1024} KB)")
