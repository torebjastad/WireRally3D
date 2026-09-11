import json
import math
import numpy as np
from PIL import Image

# Let's inspect the actual centers of the roundabouts and corners on the map image
img = Image.open(r"C:/Users/toreb/.gemini/antigravity/brain/65f08b51-ef8a-42f5-aaad-81bab4b9b229/.user_uploaded/media_1789153016187.png").convert("L")
arr = np.array(img)

# Let's load the OSM ways for roundabouts to get their exact centroid
with open(r"c:\Users\toreb\OneDrive\Code\ÅrøliaRally\data\arolia_roads.json", "r", encoding="utf-8") as f:
    roads = json.load(f)

# Find roundabouts in roads:
# 1. Årøhallen: x ~ -850, z ~ -337
# 2. West (Kringstadstien): x ~ -482, z ~ -30
# 3. Mid (Årølia): x ~ 0, z ~ 0
# 4. East (Skole): x ~ 625, z ~ 88

# Let's find the circle centers in the image by cross-correlating a circle template
def find_circle_center(x_approx, y_approx, search_rad=25, r=6.5):
    patch = arr[y_approx - search_rad : y_approx + search_rad, x_approx - search_rad : x_approx + search_rad]
    best_score = -9999
    best_cx, best_cy = x_approx, y_approx
    margin = int(math.ceil(r)) + 2
    for dy in range(margin, patch.shape[0] - margin):
        for dx in range(margin, patch.shape[1] - margin):
            angles = np.linspace(0, 2*np.pi, 24)
            ring = [patch[int(round(dy + r*np.sin(a))), int(round(dx + r*np.cos(a)))] for a in angles]
            center = patch[dy, dx]
            score = float(center) - np.mean(ring)
            if score > best_score:
                best_score = score
                best_cx = (x_approx - search_rad) + dx
                best_cy = (y_approx - search_rad) + dy
    return best_cx, best_cy, best_score

rb1_x, rb1_y, s1 = find_circle_center(55, 357)
rb2_x, rb2_y, s2 = find_circle_center(198, 187)
rb3_x, rb3_y, s3 = find_circle_center(500, 210)
rb4_x, rb4_y, s4 = find_circle_center(888, 196)

print(f"Refined image pixel centers:")
print(f"RB1 (Årøhallen):     ({rb1_x}, {rb1_y})")
print(f"RB2 (Kringstadstien):({rb2_x}, {rb2_y})")
print(f"RB3 (Mid Årølia):    ({rb3_x}, {rb3_y})")
print(f"RB4 (Årølia skole):  ({rb4_x}, {rb4_y})")

# Let's find the exact centroid of these 4 roundabouts in local 3D coords from OSM
with open(r"C:\Users\toreb\.gemini\antigravity\brain\65f08b51-ef8a-42f5-aaad-81bab4b9b229\scratch\osm_arolia.json", "r", encoding="utf-8") as f:
    osm = json.load(f)

# Origin constants
LON0 = 7.2801607
LAT0 = 62.7547996
M_PER_DEG_LAT = 111139.0
import math
M_PER_DEG_LON = 111320.0 * math.cos(math.radians(LAT0))

roundabouts_local = {}
for e in osm.get("elements", []):
    if e.get("tags", {}).get("junction") == "roundabout":
        geom = e.get("geometry", [])
        avg_lon = sum(p["lon"] for p in geom) / len(geom)
        avg_lat = sum(p["lat"] for p in geom) / len(geom)
        lx = (avg_lon - LON0) * M_PER_DEG_LON
        lz = (avg_lat - LAT0) * M_PER_DEG_LAT
        if -900 < lx < -800:
            roundabouts_local["rb1"] = (lx, lz)
        elif -550 < lx < -450:
            roundabouts_local["rb2"] = (lx, lz)
        elif -50 < lx < 50:
            roundabouts_local["rb3"] = (lx, lz)
        elif 550 < lx < 700:
            roundabouts_local["rb4"] = (lx, lz)

print("OSM 3D Local Centroids:")
for k, v in roundabouts_local.items():
    print(f"  {k}: {v[0]:.2f}, {v[1]:.2f}")

# Fit affine matrix from (lx, lz) -> (px, py)
# [lx, lz, 1] * [m00, m01; m10, m11; m20, m21] = [px, py]
P_3d = np.array([
    [roundabouts_local["rb1"][0], roundabouts_local["rb1"][1], 1.0],
    [roundabouts_local["rb2"][0], roundabouts_local["rb2"][1], 1.0],
    [roundabouts_local["rb3"][0], roundabouts_local["rb3"][1], 1.0],
    [roundabouts_local["rb4"][0], roundabouts_local["rb4"][1], 1.0],
])

P_img_x = np.array([rb1_x, rb2_x, rb3_x, rb4_x])
P_img_y = np.array([rb1_y, rb2_y, rb3_y, rb4_y])

coeff_x, _, _, _ = np.linalg.lstsq(P_3d, P_img_x, rcond=None)
coeff_y, _, _, _ = np.linalg.lstsq(P_3d, P_img_y, rcond=None)

print(f"\nDirect Local-to-Image Affine Transform:")
print(f"px_x = {coeff_x[0]:.6f} * X + {coeff_x[1]:.6f} * Z + {coeff_x[2]:.2f}")
print(f"px_y = {coeff_y[0]:.6f} * X + {coeff_y[1]:.6f} * Z + {coeff_y[2]:.2f}")

errs = []
for i, name in enumerate(["RB1", "RB2", "RB3", "RB4"]):
    pred_x = P_3d[i].dot(coeff_x)
    pred_y = P_3d[i].dot(coeff_y)
    act_x = P_img_x[i]
    act_y = P_img_y[i]
    e = np.hypot(pred_x - act_x, pred_y - act_y)
    errs.append(e)
    print(f"{name}: actual ({act_x}, {act_y}) pred ({pred_x:.2f}, {pred_y:.2f}) err: {e:.2f}px")

print(f"Max error: {max(errs):.2f}px, RMS: {np.sqrt(np.mean(np.array(errs)**2)):.2f}px")
