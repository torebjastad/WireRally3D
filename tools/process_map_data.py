import json
import math
import os

SCRATCH_DIR = r"C:\Users\toreb\.gemini\antigravity\brain\65f08b51-ef8a-42f5-aaad-81bab4b9b229\scratch"
DATA_DIR = r"c:\Users\toreb\OneDrive\Code\ÅrøliaRally\data"

# Reference Origin: Central Roundabout in Årølia (Årølivegen / Årølia junction)
LON0 = 7.2801607
LAT0 = 62.7547996
M_PER_DEG_LAT = 111139.0
M_PER_DEG_LON = 111320.0 * math.cos(math.radians(LAT0))

def geo_to_local(lon, lat):
    """Convert lon/lat to local metric coordinates: X=East, Z=North (positive Z = North)"""
    x = (lon - LON0) * M_PER_DEG_LON
    z = (lat - LAT0) * M_PER_DEG_LAT
    return x, z

def local_to_geo(x, z):
    lon = LON0 + x / M_PER_DEG_LON
    lat = LAT0 + z / M_PER_DEG_LAT
    return lon, lat

# Load elevation grid
with open(os.path.join(SCRATCH_DIR, "elevation_grid.json"), "r", encoding="utf-8") as f:
    elev_data = json.load(f)

lon_min = elev_data["lon_min"]
lon_max = elev_data["lon_max"]
grid_nx = int(elev_data["nx"])
lat_min = elev_data["lat_min"]
lat_max = elev_data["lat_max"]
grid_ny = int(elev_data["ny"])
elevations = elev_data["elevations"]

def get_elevation(lon, lat):
    """Bilinear interpolation on elevation grid"""
    u = (lon - lon_min) / (lon_max - lon_min) * (grid_nx - 1)
    v = (lat - lat_min) / (lat_max - lat_min) * (grid_ny - 1)
    
    u = max(0.0, min(grid_nx - 1.0001, u))
    v = max(0.0, min(grid_ny - 1.0001, v))
    
    i0 = int(math.floor(u))
    j0 = int(math.floor(v))
    i1 = min(grid_nx - 1, i0 + 1)
    j1 = min(grid_ny - 1, j0 + 1)
    
    fu = u - i0
    fv = v - j0
    
    z00 = elevations[j0 * grid_nx + i0]
    z10 = elevations[j0 * grid_nx + i1]
    z01 = elevations[j1 * grid_nx + i0]
    z11 = elevations[j1 * grid_nx + i1]
    
    z0 = z00 * (1 - fu) + z10 * fu
    z1 = z01 * (1 - fu) + z11 * fu
    elev = z0 * (1 - fv) + z1 * fv
    return max(0.0, elev)

def get_local_elevation(x, z):
    lon, lat = local_to_geo(x, z)
    return get_elevation(lon, lat)

# Load OSM data
with open(os.path.join(SCRATCH_DIR, "osm_arolia.json"), "r", encoding="utf-8") as f:
    osm_data = json.load(f)

# Process Roads
# All vehicular roads share the vibrant neon cyber green color (#00ffcc) as requested
road_types = {
    'primary': {'width': 8.5, 'color': '#00ffcc', 'priority': 3},
    'trunk': {'width': 9.0, 'color': '#00ffcc', 'priority': 3},
    'primary_link': {'width': 7.5, 'color': '#00ffcc', 'priority': 3},
    'tertiary': {'width': 7.5, 'color': '#00ffcc', 'priority': 3}, # Årølivegen
    'secondary': {'width': 8.0, 'color': '#00ffcc', 'priority': 3},
    'residential': {'width': 6.0, 'color': '#00ffcc', 'priority': 2},
    'living_street': {'width': 5.5, 'color': '#00ffcc', 'priority': 2},
    'unclassified': {'width': 5.5, 'color': '#00ffcc', 'priority': 2},
    'service': {'width': 4.5, 'color': '#00ffcc', 'priority': 1}
}

elements = osm_data.get("elements", [])
raw_ways = []
for elem in elements:
    tags = elem.get("tags", {})
    geom = elem.get("geometry", [])
    if "highway" in tags and len(geom) >= 2:
        hw_type = tags.get("highway")
        if hw_type not in road_types:
            continue
        info = road_types[hw_type]
        name = tags.get("name", "")
        junction = tags.get("junction", "")

        coords = []
        for p in geom:
            x, z = geo_to_local(p["lon"], p["lat"])
            coords.append({"x": x, "z": z, "lon": p["lon"], "lat": p["lat"]})
            
        total_len = sum(math.hypot(coords[k+1]["x"] - coords[k]["x"], coords[k+1]["z"] - coords[k]["z"]) for k in range(len(coords)-1))
        # Skip tiny isolated private carport driveways (< 18m) to avoid disconnected clutter
        if hw_type == 'service' and total_len < 18.0:
            continue

        raw_ways.append({
            "id": elem.get("id"),
            "name": name,
            "type": hw_type,
            "junction": junction,
            "width": info["width"],
            "color": info["color"],
            "priority": info["priority"],
            "coords": coords
        })

def pt_dist(p1, p2):
    return math.hypot(p1["x"] - p2["x"], p1["z"] - p2["z"])

# Phase 1: Stitch roundabouts together so multi-arc roundabouts become closed loops
roundabout_ways = [w for w in raw_ways if w["junction"] == "roundabout"]
other_ways = [w for w in raw_ways if w["junction"] != "roundabout"]

changed = True
while changed:
    changed = False
    for i in range(len(roundabout_ways)):
        if roundabout_ways[i] is None:
            continue
        w1 = roundabout_ways[i]
        c1 = w1["coords"]
        if len(c1) > 2 and pt_dist(c1[0], c1[-1]) < 0.5:
            continue
        for j in range(i + 1, len(roundabout_ways)):
            if roundabout_ways[j] is None:
                continue
            w2 = roundabout_ways[j]
            c2 = w2["coords"]
            if pt_dist(c1[-1], c2[0]) < 1.8:
                c1.extend(c2[1:])
                roundabout_ways[j] = None
                changed = True
                break
            elif pt_dist(c1[-1], c2[-1]) < 1.8:
                c1.extend(reversed(c2[:-1]))
                roundabout_ways[j] = None
                changed = True
                break

roundabout_ways = [w for w in roundabout_ways if w is not None]

# Phase 2: Stitch adjacent road ways into continuous long polylines
all_ways = roundabout_ways + other_ways
changed = True
while changed:
    changed = False
    for i in range(len(all_ways)):
        if all_ways[i] is None:
            continue
        w1 = all_ways[i]
        if w1["junction"] == "roundabout":
            continue
        c1 = w1["coords"]

        for j in range(i + 1, len(all_ways)):
            if all_ways[j] is None:
                continue
            w2 = all_ways[j]
            if w2["junction"] == "roundabout":
                continue
            c2 = w2["coords"]

            same_name = (w1["name"] != "" and w1["name"] == w2["name"])
            compat_type = (w1["priority"] == w2["priority"] and (not w1["name"] or not w2["name"] or w1["name"] == w2["name"]))
            if not (same_name or compat_type):
                continue

            thresh = 2.2 # meters tolerance for connected OSM road endpoints
            if pt_dist(c1[-1], c2[0]) < thresh:
                c1.extend(c2[1:])
                if not w1["name"] and w2["name"]:
                    w1["name"] = w2["name"]
                all_ways[j] = None
                changed = True
                break
            elif pt_dist(c1[-1], c2[-1]) < thresh:
                c1.extend(reversed(c2[:-1]))
                if not w1["name"] and w2["name"]:
                    w1["name"] = w2["name"]
                all_ways[j] = None
                changed = True
                break
            elif pt_dist(c1[0], c2[-1]) < thresh:
                w1["coords"] = list(c2) + c1[1:]
                if not w1["name"] and w2["name"]:
                    w1["name"] = w2["name"]
                all_ways[j] = None
                changed = True
                break
            elif pt_dist(c1[0], c2[0]) < thresh:
                w1["coords"] = list(reversed(c2[1:])) + c1
                if not w1["name"] and w2["name"]:
                    w1["name"] = w2["name"]
                all_ways[j] = None
                changed = True
                break

clean_ways = [w for w in all_ways if w is not None]
print(f"Stitched {len(raw_ways)} raw ways into {len(clean_ways)} continuous road polylines")

# Subdivide points to max 7 meters and generate continuous ribbons
roads = []
for w in clean_ways:
    coords = w["coords"]
    if len(coords) < 2:
        continue
    pts3d = []
    for idx in range(len(coords)):
        p = coords[idx]
        y = get_elevation(p["lon"], p["lat"])
        pts3d.append({"x": round(p["x"], 2), "y": round(y, 2), "z": round(p["z"], 2), "lon": p["lon"], "lat": p["lat"]})

        if idx < len(coords) - 1:
            p_next = coords[idx + 1]
            seg_dist = math.hypot(p_next["x"] - p["x"], p_next["z"] - p["z"])
            if seg_dist > 7.0:
                steps = int(math.ceil(seg_dist / 7.0))
                for s in range(1, steps):
                    frac = s / steps
                    interp_lon = p["lon"] + frac * (p_next["lon"] - p["lon"])
                    interp_lat = p["lat"] + frac * (p_next["lat"] - p["lat"])
                    ix, iz = geo_to_local(interp_lon, interp_lat)
                    iy = get_elevation(interp_lon, interp_lat)
                    pts3d.append({"x": round(ix, 2), "y": round(iy, 2), "z": round(iz, 2), "lon": interp_lon, "lat": interp_lat})

    N = len(pts3d)
    is_closed = (w["junction"] == "roundabout") or (N > 2 and math.hypot(pts3d[0]["x"] - pts3d[-1]["x"], pts3d[0]["z"] - pts3d[-1]["z"]) < 1.5)
    half_w = w["width"] * 0.5
    left_curb = []
    right_curb = []

    for i in range(N):
        p = pts3d[i]
        if i == 0:
            if is_closed:
                dx_in = p["x"] - pts3d[N-2]["x"]
                dz_in = p["z"] - pts3d[N-2]["z"]
            else:
                dx_in = pts3d[1]["x"] - p["x"]
                dz_in = pts3d[1]["z"] - p["z"]
            dx_out = pts3d[1]["x"] - p["x"]
            dz_out = pts3d[1]["z"] - p["z"]
        elif i == N - 1:
            dx_in = p["x"] - pts3d[N-2]["x"]
            dz_in = p["z"] - pts3d[N-2]["z"]
            if is_closed:
                dx_out = pts3d[1]["x"] - p["x"]
                dz_out = pts3d[1]["z"] - p["z"]
            else:
                dx_out = p["x"] - pts3d[N-2]["x"]
                dz_out = p["z"] - pts3d[N-2]["z"]
        else:
            dx_in = p["x"] - pts3d[i-1]["x"]
            dz_in = p["z"] - pts3d[i-1]["z"]
            dx_out = pts3d[i+1]["x"] - p["x"]
            dz_out = pts3d[i+1]["z"] - p["z"]

        l_in = math.hypot(dx_in, dz_in) or 1.0
        v_in_x, v_in_z = dx_in / l_in, dz_in / l_in

        l_out = math.hypot(dx_out, dz_out) or 1.0
        v_out_x, v_out_z = dx_out / l_out, dz_out / l_out

        tx = v_in_x + v_out_x
        tz = v_in_z + v_out_z
        tl = math.hypot(tx, tz)
        if tl < 0.01:
            tx, tz = v_in_x, v_in_z
            miter = 1.0
        else:
            tx /= tl
            tz /= tl
            dot = v_in_x * v_out_x + v_in_z * v_out_z
            miter = min(1.4, 1.0 / max(0.65, math.sqrt(max(0.01, (1.0 + dot) * 0.5))))

        nx = -tz
        nz = tx

        lx = p["x"] + nx * half_w * miter
        lz = p["z"] + nz * half_w * miter
        ly = get_local_elevation(lx, lz) + 0.22

        rx = p["x"] - nx * half_w * miter
        rz = p["z"] - nz * half_w * miter
        ry = get_local_elevation(rx, rz) + 0.22

        left_curb.append({"x": round(lx, 2), "y": round(ly, 2), "z": round(lz, 2)})
        right_curb.append({"x": round(rx, 2), "y": round(ry, 2), "z": round(rz, 2)})

    roads.append({
        "id": w["id"],
        "name": w["name"],
        "type": w["type"],
        "width": w["width"],
        "color": w["color"],
        "priority": w["priority"],
        "is_closed": is_closed,
        "points": pts3d,
        "left_curb": left_curb,
        "right_curb": right_curb
    })

print(f"Final continuous road network: {len(roads)} road ribbons")

# Process Buildings
buildings = []
for elem in elements:
    tags = elem.get("tags", {})
    geom = elem.get("geometry", [])
    if "building" in tags and len(geom) >= 3:
        name = tags.get("name", "")
        b_type = tags.get("building")
        
        poly = []
        elevs = []
        for p in geom:
            x, z = geo_to_local(p["lon"], p["lat"])
            y = get_elevation(p["lon"], p["lat"])
            poly.append({"x": round(x, 2), "z": round(z, 2)})
            elevs.append(y)
            
        base_y = sum(elevs) / len(elevs)
        
        height = 6.0
        if "hall" in name.lower() or "skole" in name.lower() or b_type in ["sports_hall", "school", "industrial", "commercial"]:
            height = 10.5
        elif tags.get("building:levels"):
            try:
                height = float(tags.get("building:levels")) * 3.2
            except:
                pass
                
        buildings.append({
            "id": elem.get("id"),
            "name": name,
            "type": b_type,
            "base_y": round(base_y, 2),
            "height": round(height, 2),
            "polygon": poly
        })

print(f"Processed {len(buildings)} buildings")

# Generate Terrain Wireframe Mesh
grid_step = 35.0
x_min, x_max = -1150.0, 1150.0
z_min, z_max = -750.0, 750.0
nx_mesh = int((x_max - x_min) / grid_step) + 1
nz_mesh = int((z_max - z_min) / grid_step) + 1

terrain_vertices = []
for iz in range(nz_mesh):
    z = z_min + iz * grid_step
    row = []
    for ix in range(nx_mesh):
        x = x_min + ix * grid_step
        y = get_local_elevation(x, z)
        row.append({"x": round(x, 2), "y": round(y, 2), "z": round(z, 2)})
    terrain_vertices.append(row)

terrain_mesh = {
    "x_min": x_min, "x_max": x_max, "nx": nx_mesh,
    "z_min": z_min, "z_max": z_max, "nz": nz_mesh,
    "grid_step": grid_step,
    "vertices": terrain_vertices
}

# Generate Rally Stage & Checkpoints
checkpoints = [
    {
        "id": 0,
        "name": "Start: Årøhallen",
        "type": "start",
        "x": -850.0, "z": -340.0,
        "heading": 85.0,
        "width": 14.0
    },
    {
        "id": 1,
        "name": "Årøhallen Rundkøyring",
        "type": "checkpoint",
        "x": -840.0, "z": -335.0,
        "heading": 80.0,
        "width": 14.0
    },
    {
        "id": 2,
        "name": "Sving mot Kringstadstien",
        "type": "checkpoint",
        "x": -640.0, "z": -320.0,
        "heading": 70.0,
        "width": 14.0
    },
    {
        "id": 3,
        "name": "Vestleg Rundkøyring (Kringstadstien)",
        "type": "checkpoint",
        "x": -480.0, "z": -30.0,
        "heading": 85.0,
        "width": 16.0
    },
    {
        "id": 4,
        "name": "Årølivegen Rettstrekk",
        "type": "checkpoint",
        "x": -250.0, "z": -25.0,
        "heading": 88.0,
        "width": 16.0
    },
    {
        "id": 5,
        "name": "Midtre Rundkøyring (Årølia Sentrum)",
        "type": "checkpoint",
        "x": 0.0, "z": 0.0,
        "heading": 85.0,
        "width": 18.0
    },
    {
        "id": 6,
        "name": "Bakkesving mot Halsmyrbakken",
        "type": "checkpoint",
        "x": 260.0, "z": 45.0,
        "heading": 80.0,
        "width": 16.0
    },
    {
        "id": 7,
        "name": "Austleg Rundkøyring (Årølia Skole)",
        "type": "checkpoint",
        "x": 625.0, "z": 88.0,
        "heading": 75.0,
        "width": 16.0
    },
    {
        "id": 8,
        "name": "Mållinje: Årølia Skole",
        "type": "finish",
        "x": 680.0, "z": 105.0,
        "heading": 70.0,
        "width": 16.0
    }
]

for cp in checkpoints:
    cp["y"] = round(get_local_elevation(cp["x"], cp["z"]), 2)

rally_stage = {
    "name": "Årølia Rally Grand Prix",
    "description": "Fartsfylt etappe frå Årøhallen langs Årølivegen til Årølia skole",
    "total_checkpoints": len(checkpoints),
    "checkpoints": checkpoints
}

# Generate Stick Figures / Spectators and Wireframe Trees
import random
random.seed(42)
spectators = []
for cp in checkpoints:
    for _ in range(4):
        offset_dist = random.uniform(cp["width"]/2 + 2, cp["width"]/2 + 7)
        side = 1 if random.random() > 0.5 else -1
        ang = math.radians(cp["heading"] + 90 * side)
        sx = cp["x"] + offset_dist * math.sin(ang)
        sz = cp["z"] + offset_dist * math.cos(ang)
        sy = get_local_elevation(sx, sz)
        spectators.append({
            "x": round(sx, 2),
            "y": round(sy, 2),
            "z": round(sz, 2),
            "pose": random.choice(["cheer", "wave", "clap", "jump"]),
            "color": random.choice(["#ffff00", "#ff0055", "#00ff88", "#00d4ff", "#ffffff"])
        })

trees = []
for _ in range(120):
    tx = random.uniform(x_min + 50, x_max - 50)
    tz = random.uniform(z_min + 50, z_max - 50)
    ty = get_local_elevation(tx, tz)
    if ty > 35.0:
        trees.append({
            "x": round(tx, 2), "y": round(ty, 2), "z": round(tz, 2),
            "height": round(random.uniform(5.0, 9.0), 2),
            "radius": round(random.uniform(2.0, 4.0), 2)
        })

scenery = {
    "spectators": spectators,
    "trees": trees
}

proj_meta = {
    "ref_image_width": 1024,
    "ref_image_height": 576,
    "origin": {
        "name": "Mid Roundabout (Årølia sentrum)",
        "lon": LON0, "lat": LAT0,
        "elev": get_elevation(LON0, LAT0)
    },
    "m_per_deg_lon": M_PER_DEG_LON,
    "m_per_deg_lat": M_PER_DEG_LAT,
    "local_to_pixel": {
        "ax": 0.663353,
        "bx": -0.361538,
        "cx": 507.34,
        "ay": 0.081813,
        "by": -0.681947,
        "cy": 205.29
    },
    "pixel_to_local": {
        "ax": 1.61244,
        "bx": -0.85484,
        "cx": -642.54,
        "ay": 0.19344,
        "by": -1.56847,
        "cy": 223.82
    },
    "landmarks": [
        {"name": "Årøhallen Roundabout", "local_x": -849.13, "local_z": -337.39, "pixel_x": 66, "pixel_y": 366},
        {"name": "West Roundabout (Kringstadstien)", "local_x": -482.33, "local_z": -30.19, "pixel_x": 198, "pixel_y": 187},
        {"name": "Mid Roundabout (Årølia sentrum)", "local_x": 0.00, "local_z": 0.01, "pixel_x": 508, "pixel_y": 204},
        {"name": "East Roundabout (Årølia skole)", "local_x": 625.29, "local_z": 88.03, "pixel_x": 890, "pixel_y": 197}
    ]
}

os.makedirs(DATA_DIR, exist_ok=True)
with open(os.path.join(DATA_DIR, "arolia_roads.json"), "w", encoding="utf-8") as f:
    json.dump(roads, f)

with open(os.path.join(DATA_DIR, "arolia_buildings.json"), "w", encoding="utf-8") as f:
    json.dump(buildings, f)

with open(os.path.join(DATA_DIR, "arolia_terrain.json"), "w", encoding="utf-8") as f:
    json.dump(terrain_mesh, f)

with open(os.path.join(DATA_DIR, "rally_track.json"), "w", encoding="utf-8") as f:
    json.dump(rally_stage, f)

with open(os.path.join(DATA_DIR, "scenery.json"), "w", encoding="utf-8") as f:
    json.dump(scenery, f)

with open(os.path.join(DATA_DIR, "projection_meta.json"), "w", encoding="utf-8") as f:
    json.dump(proj_meta, f, indent=2)

print("All game data successfully written to data/ folder!")
