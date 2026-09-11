import json
import math
import numpy as np
from PIL import Image, ImageDraw

def render_3d_preview():
    # Load 3D data
    with open("data/arolia_roads.json", "r", encoding="utf-8") as f:
        roads = json.load(f)
    with open("data/arolia_buildings.json", "r", encoding="utf-8") as f:
        buildings = json.load(f)
    with open("data/arolia_terrain.json", "r", encoding="utf-8") as f:
        terrain = json.load(f)
    with open("data/rally_track.json", "r", encoding="utf-8") as f:
        track = json.load(f)
    with open("data/scenery.json", "r", encoding="utf-8") as f:
        scenery = json.load(f)

    w, h = 1280, 720
    img = Image.new("RGB", (w, h), (6, 9, 19))
    draw = ImageDraw.Draw(img)

    # Place camera in Chase mode behind car on Årølivegen near Central Roundabout
    # Car at (0, 62.2, 0), heading 85 degrees (East)
    car_x, car_y, car_z = -20.0, 62.5, 0.0
    heading = math.radians(85.0)

    # Forward vector
    fx = math.sin(heading)
    fz = math.cos(heading)

    cam_dist = 11.0
    cam_x = car_x - fx * cam_dist
    cam_y = car_y + 4.5
    cam_z = car_z - fz * cam_dist

    target_x = car_x + fx * 18.0
    target_y = car_y + 1.2
    target_z = car_z + fz * 18.0

    # Camera LookAt Matrix
    eye = np.array([cam_x, cam_y, cam_z])
    target = np.array([target_x, target_y, target_z])
    up = np.array([0.0, 1.0, 0.0])

    forward = target - eye
    forward /= np.linalg.norm(forward)
    x_axis = np.cross(up, forward)
    x_axis /= np.linalg.norm(x_axis)
    y_axis = np.cross(forward, x_axis)
    y_axis /= np.linalg.norm(y_axis)

    fov = math.radians(72.0)
    aspect = w / h
    f = 1.0 / math.tan(fov / 2.0)
    near = 0.5

    def project_3d(x, y, z):
        p = np.array([x, y, z]) - eye
        zc = np.dot(forward, p)
        if zc <= near:
            return None
        xc = np.dot(x_axis, p)
        yc = np.dot(y_axis, p)
        # Perspective projection
        xp = (f / aspect) * xc / zc
        yp = f * yc / zc
        # Screen coords
        sx = (xp + 1.0) * 0.5 * w
        sy = (1.0 - yp) * 0.5 * h
        return (sx, sy, zc)

    def draw_3d_line(p1, p2, color, width=1):
        # Clip against near plane
        dist = math.hypot(p1[0] - cam_x, p1[2] - cam_z)
        if dist > 800.0:
            return
        proj1 = project_3d(p1[0], p1[1], p1[2])
        proj2 = project_3d(p2[0], p2[1], p2[2])
        if proj1 and proj2:
            draw.line([(proj1[0], proj1[1]), (proj2[0], proj2[1])], fill=color, width=width)

    # 1. Terrain Grid
    verts = terrain["vertices"]
    grid_color = (13, 56, 48)
    for j in range(0, terrain["nz"], 1):
        for i in range(0, terrain["nx"] - 1, 1):
            p1 = (verts[j][i]["x"], verts[j][i]["y"], verts[j][i]["z"])
            p2 = (verts[j][i+1]["x"], verts[j][i+1]["y"], verts[j][i+1]["z"])
            draw_3d_line(p1, p2, grid_color, 1)
    for i in range(0, terrain["nx"], 1):
        for j in range(0, terrain["nz"] - 1, 1):
            p1 = (verts[j][i]["x"], verts[j][i]["y"], verts[j][i]["z"])
            p2 = (verts[j+1][i]["x"], verts[j+1][i]["y"], verts[j+1][i]["z"])
            draw_3d_line(p1, p2, grid_color, 1)

    # 2. Roads (Continuous Gapless Ribbons)
    col = (0, 255, 204)
    center_col = (255, 234, 117)
    for r in roads:
        is_main = r["priority"] >= 3
        curb_w = 2 if is_main else 1
        lc = r.get("left_curb")
        rc = r.get("right_curb")
        pts = r.get("points", [])

        if lc and rc and len(lc) >= 2:
            N = len(lc)
            for i in range(N - 1):
                draw_3d_line((lc[i]["x"], lc[i]["y"], lc[i]["z"]),
                             (lc[i+1]["x"], lc[i+1]["y"], lc[i+1]["z"]), col, curb_w)
                draw_3d_line((rc[i]["x"], rc[i]["y"], rc[i]["z"]),
                             (rc[i+1]["x"], rc[i+1]["y"], rc[i+1]["z"]), col, curb_w)
                if is_main and (i % 2 == 0):
                    draw_3d_line((pts[i]["x"], pts[i]["y"], pts[i]["z"]),
                                 (pts[i+1]["x"], pts[i+1]["y"], pts[i+1]["z"]), center_col, 1)

            if r.get("is_closed"):
                draw_3d_line((lc[N-1]["x"], lc[N-1]["y"], lc[N-1]["z"]),
                             (lc[0]["x"], lc[0]["y"], lc[0]["z"]), col, curb_w)
                draw_3d_line((rc[N-1]["x"], rc[N-1]["y"], rc[N-1]["z"]),
                             (rc[0]["x"], rc[0]["y"], rc[0]["z"]), col, curb_w)
        else:
            for i in range(len(pts) - 1):
                draw_3d_line((pts[i]["x"], pts[i]["y"], pts[i]["z"]),
                             (pts[i+1]["x"], pts[i+1]["y"], pts[i+1]["z"]), col, curb_w)

    # 3. Buildings
    for b in buildings:
        poly = b["polygon"]
        by = b["base_y"]
        ty = by + b["height"]
        is_spec = b["height"] > 8.0
        b_col = (255, 0, 170) if is_spec else (51, 136, 204)
        r_col = (255, 85, 204) if is_spec else (85, 187, 255)
        for i in range(len(poly)):
            p1 = poly[i]
            p2 = poly[(i+1) % len(poly)]
            # base, roof, pillars
            draw_3d_line((p1["x"], by, p1["z"]), (p2["x"], by, p2["z"]), b_col, 1)
            draw_3d_line((p1["x"], ty, p1["z"]), (p2["x"], ty, p2["z"]), r_col, 2)
            draw_3d_line((p1["x"], by, p1["z"]), (p1["x"], ty, p1["z"]), b_col, 1)

    # 4. Trees
    for tr in scenery["trees"][:60]:
        base = (tr["x"], tr["y"], tr["z"])
        ttop = (tr["x"], tr["y"] + tr["height"] * 0.4, tr["z"])
        tip = (tr["x"], tr["y"] + tr["height"], tr["z"])
        draw_3d_line(base, ttop, (136, 85, 34), 2)
        r = tr["radius"]
        cpts = [
            (tr["x"] + r, ttop[1], tr["z"]),
            (tr["x"], ttop[1], tr["z"] + r),
            (tr["x"] - r, ttop[1], tr["z"]),
            (tr["x"], ttop[1], tr["z"] - r)
        ]
        for i in range(4):
            draw_3d_line(cpts[i], cpts[(i+1)%4], (0, 170, 85), 1)
            draw_3d_line(cpts[i], tip, (0, 255, 136), 1)

    # 5. Stick-Figure Spectators
    for spec in scenery["spectators"]:
        sx, sy, sz = spec["x"], spec["y"], spec["z"]
        col = (255, 255, 0)
        foot = (sx, sy, sz)
        hip = (sx, sy + 0.8, sz)
        neck = (sx, sy + 1.5, sz)
        head = (sx, sy + 1.8, sz)
        draw_3d_line(foot, hip, col, 2)
        draw_3d_line(hip, neck, col, 2)
        draw_3d_line(neck, head, col, 3)
        # waving arms
        draw_3d_line(neck, (sx - 0.4, sy + 1.8, sz), col, 2)
        draw_3d_line(neck, (sx + 0.4, sy + 1.8, sz), col, 2)

    # 6. Checkpoint Gate (Mid Roundabout)
    cp = track["checkpoints"][5]
    w_cp = cp["width"] * 0.5
    h_cp = 5.5
    ang = math.radians(cp["heading"])
    px = math.cos(ang)
    pz = -math.sin(ang)
    gate_col = (0, 255, 136)
    lb = (cp["x"] - px*w_cp, cp["y"], cp["z"] - pz*w_cp)
    rb = (cp["x"] + px*w_cp, cp["y"], cp["z"] + pz*w_cp)
    lt = (cp["x"] - px*w_cp, cp["y"] + h_cp, cp["z"] - pz*w_cp)
    rt = (cp["x"] + px*w_cp, cp["y"] + h_cp, cp["z"] + pz*w_cp)
    draw_3d_line(lb, lt, gate_col, 3)
    draw_3d_line(rb, rt, gate_col, 3)
    draw_3d_line(lt, rt, gate_col, 3)
    draw_3d_line(lb, rb, (255, 255, 0), 3)

    # 7. 3D Rally Car Model on Road (Following Terrain Gradient)
    car_col = (255, 255, 255)
    cy = math.cos(heading)
    sy = math.sin(heading)
    fx = math.sin(heading)
    fz = math.cos(heading)
    rx = math.cos(heading)
    rz = -math.sin(heading)

    verts_grid = terrain["vertices"]
    x_min_t = terrain["x_min"]
    z_min_t = terrain["z_min"]
    step_t = terrain["grid_step"]
    nx_t = terrain["nx"]
    nz_t = terrain["nz"]

    def get_terrain_h(x, z):
        u = max(0.0, min(nx_t - 1.0001, (x - x_min_t) / step_t))
        v = max(0.0, min(nz_t - 1.0001, (z - z_min_t) / step_t))
        i0 = int(math.floor(u))
        j0 = int(math.floor(v))
        i1 = min(nx_t - 1, i0 + 1)
        j1 = min(nz_t - 1, j0 + 1)
        fu, fv = u - i0, v - j0
        y00 = verts_grid[j0][i0]["y"]
        y10 = verts_grid[j0][i1]["y"]
        y01 = verts_grid[j1][i0]["y"]
        y11 = verts_grid[j1][i1]["y"]
        y0 = y00 * (1 - fu) + y10 * fu
        y1 = y01 * (1 - fu) + y11 * fu
        return y0 * (1 - fv) + y1 * fv

    Lw = 1.365
    Ww = 0.98
    hFL = get_terrain_h(car_x + fx * Lw - rx * Ww, car_z + fz * Lw - rz * Ww)
    hFR = get_terrain_h(car_x + fx * Lw + rx * Ww, car_z + fz * Lw + rz * Ww)
    hRL = get_terrain_h(car_x - fx * Lw - rx * Ww, car_z - fz * Lw - rz * Ww)
    hRR = get_terrain_h(car_x - fx * Lw + rx * Ww, car_z - fz * Lw + rz * Ww)

    hFront = (hFL + hFR) * 0.5
    hRear  = (hRL + hRR) * 0.5
    hRight = (hFR + hRR) * 0.5
    hLeft  = (hFL + hRL) * 0.5

    car_ground_y = (hFront + hRear) * 0.5
    pitch = math.atan2(hFront - hRear, 2.0 * Lw)
    roll = math.atan2(hRight - hLeft, 2.0 * Ww)

    cp = math.cos(pitch)
    sp = math.sin(pitch)
    cr = math.cos(roll)
    sr = math.sin(roll)
    wheel_radius = 0.38
    base_py = car_ground_y + wheel_radius

    def c_to_w(lx, ly, lz):
        # Roll
        x1 = lx * cr - ly * sr
        y1 = lx * sr + ly * cr
        z1 = lz
        # Pitch
        x2 = x1
        y2 = y1 * cp + z1 * sp
        z2 = -y1 * sp + z1 * cp
        # Yaw
        wx = car_x + z2 * sy + x2 * cy
        wy = base_py + y2
        wz = car_z + z2 * cy - x2 * sy
        return (wx, wy, wz)

    # Lower bumper
    draw_3d_line(c_to_w(-0.9, 0.2, 2.1), c_to_w(0.9, 0.2, 2.1), (0, 255, 204), 3)
    draw_3d_line(c_to_w(0.9, 0.2, 2.1), c_to_w(0.9, 0.2, -2.1), car_col, 2)
    draw_3d_line(c_to_w(0.9, 0.2, -2.1), c_to_w(-0.9, 0.2, -2.1), (255, 0, 85), 3)
    draw_3d_line(c_to_w(-0.9, 0.2, -2.1), c_to_w(-0.9, 0.2, 2.1), car_col, 2)

    # Waist & Roof
    draw_3d_line(c_to_w(-0.9, 0.6, 2.0), c_to_w(0.9, 0.6, 2.0), (0, 255, 204), 2)
    draw_3d_line(c_to_w(-0.85, 0.72, 0.7), c_to_w(0.85, 0.72, 0.7), car_col, 2)
    draw_3d_line(c_to_w(-0.65, 1.35, 0.1), c_to_w(0.65, 1.35, 0.1), (0, 229, 255), 2)
    draw_3d_line(c_to_w(-0.65, 1.35, -1.0), c_to_w(0.65, 1.35, -1.0), car_col, 2)
    draw_3d_line(c_to_w(-0.65, 1.35, 0.1), c_to_w(-0.65, 1.35, -1.0), car_col, 2)
    draw_3d_line(c_to_w(0.65, 1.35, 0.1), c_to_w(0.65, 1.35, -1.0), car_col, 2)

    # Windshield pillars
    draw_3d_line(c_to_w(-0.85, 0.72, 0.7), c_to_w(-0.65, 1.35, 0.1), (0, 229, 255), 2)
    draw_3d_line(c_to_w(0.85, 0.72, 0.7), c_to_w(0.65, 1.35, 0.1), (0, 229, 255), 2)

    # Rear spoiler
    draw_3d_line(c_to_w(-0.8, 1.15, -2.0), c_to_w(0.8, 1.15, -2.0), (255, 0, 85), 3)

    # Stick-figure driver!
    driver_seat = c_to_w(-0.32, 0.4, -0.2)
    driver_neck = c_to_w(-0.32, 0.9, -0.1)
    driver_head = c_to_w(-0.32, 1.05, -0.08)
    draw_3d_line(driver_seat, driver_neck, (0, 255, 136), 2)
    draw_3d_line(driver_neck, driver_head, (0, 255, 136), 3)
    # Arms holding steering wheel
    sw = c_to_w(-0.32, 0.75, 0.35)
    draw_3d_line(driver_neck, sw, (0, 255, 136), 2)

    # Wheels (centered at ly = 0, resting on ground)
    for wx, wz in [(-1.0, 1.365), (1.0, 1.365), (-1.0, -1.365), (1.0, -1.365)]:
        for a in range(6):
            a1 = (a / 6) * math.pi * 2
            a2 = ((a + 1) / 6) * math.pi * 2
            p1 = c_to_w(wx, wheel_radius * math.cos(a1), wz + wheel_radius * math.sin(a1))
            p2 = c_to_w(wx, wheel_radius * math.cos(a2), wz + wheel_radius * math.sin(a2))
            draw_3d_line(p1, p2, (0, 255, 204), 2)

    out_file = r"C:\Users\toreb\.gemini\antigravity\brain\65f08b51-ef8a-42f5-aaad-81bab4b9b229\arolia_rally_3d_preview.png"
    img.save(out_file)
    print(f"3D Wireframe preview saved to {out_file}")

if __name__ == "__main__":
    render_3d_preview()
