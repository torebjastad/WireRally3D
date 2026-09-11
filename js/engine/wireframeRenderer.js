// High Performance 3D Wireframe Vector Engine
class WireframeRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.fov = 72.0 * Math.PI / 180.0;
        this.near = 0.8;
        this.far = 1400.0;

        this.viewProj = new Matrix4();
        this.cameraPos = new Vector3();
        this.cameraTarget = new Vector3();

        // Cached road ribbons
        this.roadRibbons = null;
    }

    resize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
        }
    }

    setCamera(pos, target) {
        this.cameraPos.copy(pos);
        this.cameraTarget.copy(target);

        // Normalized camera forward vector
        const fx = target.x - pos.x;
        const fy = target.y - pos.y;
        const fz = target.z - pos.z;
        const fLen = Math.hypot(fx, fy, fz) || 1.0;
        this.camFwd = new Vector3(fx / fLen, fy / fLen, fz / fLen);

        const aspect = this.canvas.width / this.canvas.height;
        const proj = new Matrix4().perspective(this.fov, aspect, this.near, this.far);
        const view = new Matrix4().lookAt(pos, target, new Vector3(0, 1, 0));
        this.viewProj = proj.multiply(view);
    }

    projectPoint(p, out) {
        const res = this.viewProj.transformPoint(p, out);
        if (res.w <= this.near * 0.9) return null;

        const screenX = (res.point.x + 1.0) * 0.5 * this.canvas.width;
        const screenY = (1.0 - res.point.y) * 0.5 * this.canvas.height;

        return { x: screenX, y: screenY, z: res.w };
    }

    // Exact analytical line clipping against the camera near plane
    clipAndProjectLine(p1, p2, pt1Out, pt2Out) {
        const c = this.cameraPos;
        const f = this.camFwd;
        const near = this.near;

        // Signed distance of each endpoint along the camera forward axis
        const d1 = (p1.x - c.x) * f.x + (p1.y - c.y) * f.y + (p1.z - c.z) * f.z;
        const d2 = (p2.x - c.x) * f.x + (p2.y - c.y) * f.y + (p2.z - c.z) * f.z;

        if (d1 < near && d2 < near) {
            return null; // Both points behind near plane
        }

        let pt1 = p1;
        let pt2 = p2;

        if (d1 < near) {
            // p1 is behind near plane, clip towards p2
            const t = (near - d1) / (d2 - d1);
            pt1 = new Vector3(
                p1.x + t * (p2.x - p1.x),
                p1.y + t * (p2.y - p1.y),
                p1.z + t * (p2.z - p1.z)
            );
        } else if (d2 < near) {
            // p2 is behind near plane, clip towards p1
            const t = (near - d1) / (d2 - d1);
            pt2 = new Vector3(
                p1.x + t * (p2.x - p1.x),
                p1.y + t * (p2.y - p1.y),
                p1.z + t * (p2.z - p1.z)
            );
        }

        const proj1 = this.projectPoint(pt1, pt1Out);
        const proj2 = this.projectPoint(pt2, pt2Out);

        if (!proj1 || !proj2) return null;
        return { s1: proj1, s2: proj2 };
    }

    renderScene(terrain, roads, buildings, scenery, carModel, carPhysics, track) {
        this.resize();
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Clear Background (Deep Midnight Cyber Blue)
        ctx.fillStyle = '#060913';
        ctx.fillRect(0, 0, w, h);

        const temp1 = new Vector3();
        const temp2 = new Vector3();

        // Helper to draw a batch of 3D lines
        const draw3DLine = (p1, p2, color, lineWidth = 1.0, maxDist = 700.0) => {
            const dist = Math.hypot(p1.x - this.cameraPos.x, p1.z - this.cameraPos.z);
            if (dist > maxDist) return;

            const res = this.clipAndProjectLine(p1, p2, temp1, temp2);
            if (!res) return;

            // Distance attenuation / depth fade
            const alpha = Math.max(0.12, 1.0 - (dist / maxDist) * 0.88);
            ctx.strokeStyle = color;
            ctx.globalAlpha = alpha;
            ctx.lineWidth = Math.max(0.8, lineWidth * (1.0 - (dist / maxDist) * 0.4));

            ctx.beginPath();
            ctx.moveTo(res.s1.x, res.s1.y);
            ctx.lineTo(res.s2.x, res.s2.y);
            ctx.stroke();
        };

        // 1. TERRAIN TOPOGRAPHY WIREFRAME GRID
        if (terrain) {
            const verts = terrain.vertices;
            const nz = terrain.nz;
            const nx = terrain.nx;
            const gridColor = '#0d3830'; // subtle emerald wireframe

            // Draw horizontal and vertical grid lines
            for (let j = 0; j < nz; j += 1) {
                for (let i = 0; i < nx - 1; i += 1) {
                    const p1 = verts[j][i];
                    const p2 = verts[j][i + 1];
                    draw3DLine(p1, p2, gridColor, 1.0, 550.0);
                }
            }
            for (let i = 0; i < nx; i += 1) {
                for (let j = 0; j < nz - 1; j += 1) {
                    const p1 = verts[j][i];
                    const p2 = verts[j + 1][i];
                    draw3DLine(p1, p2, gridColor, 1.0, 550.0);
                }
            }
        }

        // 2. ROAD NETWORK (Glowing Ribbons, Curbs & Centerlines)
        if (roads) {
            roads.forEach(r => {
                const pts = r.points;
                if (pts.length < 2) return;
                const halfW = r.width * 0.5;
                const isMain = (r.priority >= 3);
                const roadColor = isMain ? '#00ffcc' : '#0099ff';
                const centerColor = '#ffffaa';

                for (let i = 0; i < pts.length - 1; i++) {
                    const a = pts[i];
                    const b = pts[i + 1];

                    // Perpendicular vector in XZ plane
                    const dx = b.x - a.x;
                    const dz = b.z - a.z;
                    const len = Math.hypot(dx, dz) || 1.0;
                    const nx = -dz / len * halfW;
                    const nz =  dx / len * halfW;

                    // Terrain-following curb elevation with +0.22m offset to prevent ground sinking
                    const yAL = terrain ? terrain.getHeight(a.x + nx, a.z + nz) + 0.22 : a.y + 0.22;
                    const yBL = terrain ? terrain.getHeight(b.x + nx, b.z + nz) + 0.22 : b.y + 0.22;
                    const yAR = terrain ? terrain.getHeight(a.x - nx, a.z - nz) + 0.22 : a.y + 0.22;
                    const yBR = terrain ? terrain.getHeight(b.x - nx, b.z - nz) + 0.22 : b.y + 0.22;

                    // Left curb
                    const aL = new Vector3(a.x + nx, yAL, a.z + nz);
                    const bL = new Vector3(b.x + nx, yBL, b.z + nz);
                    draw3DLine(aL, bL, roadColor, isMain ? 2.2 : 1.4, 750.0);

                    // Right curb
                    const aR = new Vector3(a.x - nx, yAR, a.z - nz);
                    const bR = new Vector3(b.x - nx, yBR, b.z - nz);
                    draw3DLine(aR, bR, roadColor, isMain ? 2.2 : 1.4, 750.0);

                    // Dashed centerline for main roads
                    if (isMain && (i % 2 === 0)) {
                        const yAC = terrain ? terrain.getHeight(a.x, a.z) + 0.25 : a.y + 0.25;
                        const yBC = terrain ? terrain.getHeight(b.x, b.z) + 0.25 : b.y + 0.25;
                        const aC = new Vector3(a.x, yAC, a.z);
                        const bC = new Vector3(b.x, yBC, b.z);
                        draw3DLine(aC, bC, centerColor, 1.4, 600.0);
                    }
                }
            });
        }

        // 3. 3D WIREFRAME BUILDINGS (Extruded Polygons)
        if (buildings) {
            buildings.forEach(b => {
                const poly = b.polygon;
                const baseY = b.base_y;
                const topY = baseY + b.height;
                const isSpecial = (b.height > 8.0); // Årøhallen or school
                const bColor = isSpecial ? '#ff00aa' : '#3388cc';
                const roofColor = isSpecial ? '#ff55cc' : '#55bbff';

                for (let i = 0; i < poly.length; i++) {
                    const p1 = poly[i];
                    const p2 = poly[(i + 1) % poly.length];

                    const b1 = new Vector3(p1.x, baseY, p1.z);
                    const b2 = new Vector3(p2.x, baseY, p2.z);
                    const t1 = new Vector3(p1.x, topY, p1.z);
                    const t2 = new Vector3(p2.x, topY, p2.z);

                    // Ground outline
                    draw3DLine(b1, b2, bColor, 1.2, 700.0);
                    // Roof outline
                    draw3DLine(t1, t2, roofColor, 1.6, 700.0);
                    // Vertical pillars
                    draw3DLine(b1, t1, bColor, 1.2, 700.0);
                }
            });
        }

        // 4. WIREFRAME TREES
        if (scenery && scenery.trees) {
            scenery.trees.forEach(tr => {
                const base = new Vector3(tr.x, tr.y, tr.z);
                const trunkTop = new Vector3(tr.x, tr.y + tr.height * 0.4, tr.z);
                const tip = new Vector3(tr.x, tr.y + tr.height, tr.z);

                // Trunk
                draw3DLine(base, trunkTop, '#885522', 1.5, 400.0);

                // Canopy wireframe cone (4 ribs)
                const r = tr.radius;
                const cPts = [
                    new Vector3(tr.x + r, trunkTop.y, tr.z),
                    new Vector3(tr.x, trunkTop.y, tr.z + r),
                    new Vector3(tr.x - r, trunkTop.y, tr.z),
                    new Vector3(tr.x, trunkTop.y, tr.z - r)
                ];
                for (let i = 0; i < 4; i++) {
                    draw3DLine(cPts[i], cPts[(i + 1) % 4], '#00aa55', 1.0, 400.0);
                    draw3DLine(cPts[i], tip, '#00ff88', 1.0, 400.0);
                }
            });
        }

        // 5. STICK-FIGURE SPECTATORS ("STICK-MAN-STIL")
        if (scenery && scenery.spectators) {
            const time = performance.now() * 0.006;
            scenery.spectators.forEach((spec, idx) => {
                const sx = spec.x;
                const sy = spec.y;
                const sz = spec.z;
                const color = spec.color || '#ffff00';

                // Torso
                const foot = new Vector3(sx, sy, sz);
                const hip = new Vector3(sx, sy + 0.8, sz);
                const neck = new Vector3(sx, sy + 1.5, sz);
                const head = new Vector3(sx, sy + 1.8, sz);

                draw3DLine(foot, hip, color, 1.5, 350.0);
                draw3DLine(hip, neck, color, 2.0, 350.0);
                draw3DLine(neck, head, color, 3.0, 350.0); // Head dot/line

                // Cheering arms animation!
                const wave = Math.sin(time + idx * 1.5) * 0.4;
                const armL = new Vector3(sx - 0.4, sy + 1.6 + wave, sz);
                const armR = new Vector3(sx + 0.4, sy + 1.6 - wave, sz);
                draw3DLine(neck, armL, color, 1.5, 350.0);
                draw3DLine(neck, armR, color, 1.5, 350.0);
            });
        }

        // 6. RALLY TRACK CHECKPOINT GATES
        if (track) {
            const gateLines = track.getGateLines();
            gateLines.forEach(g => {
                draw3DLine(g.p1, g.p2, g.color, g.width, 900.0);
            });
        }

        // 7. RALLY CAR MODEL & WHEELS & DRIVER
        if (carModel && carPhysics) {
            const carLines = carModel.getLines(carPhysics);
            carLines.forEach(cl => {
                draw3DLine(cl.p1, cl.p2, cl.color, cl.width, 800.0);
            });

            // Dust & Sparks particles
            carModel.particles.forEach(p => {
                const p1 = new Vector3(p.x, p.y, p.z);
                const p2 = new Vector3(p.x + p.size, p.y + p.size * 0.5, p.z);
                draw3DLine(p1, p2, 'rgba(0, 255, 200, 0.4)', 1.2, 300.0);
            });
            carModel.sparks.forEach(s => {
                const p1 = new Vector3(s.x, s.y, s.z);
                const p2 = new Vector3(s.x + s.vx * 0.05, s.y + s.vy * 0.05, s.z + s.vz * 0.05);
                draw3DLine(p1, p2, '#ffcc00', 2.0, 300.0);
            });
        }

        ctx.globalAlpha = 1.0;
    }
}

window.WireframeRenderer = WireframeRenderer;
