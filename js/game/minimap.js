// HUD Minimap calibrated to match the Kartverket map slice
class HUDMinimap {
    constructor(canvas, roads, buildings, checkpoints, projMeta) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.roads = roads;
        this.buildings = buildings;
        this.checkpoints = checkpoints;
        this.proj = projMeta.local_to_pixel;

        // Native map slice bounds
        this.nativeW = projMeta.ref_image_width || 1024;
        this.nativeH = projMeta.ref_image_height || 576;
    }

    worldToMapPx(x, z) {
        const px = this.proj.ax * x + this.proj.bx * z + this.proj.cx;
        const py = this.proj.ay * x + this.proj.by * z + this.proj.cy;
        return {
            x: (px / this.nativeW) * this.canvas.width,
            y: (py / this.nativeH) * this.canvas.height
        };
    }

    draw(playerPhysics, currentCpIdx) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);

        // Background: Deep dark semi-transparent blueprint
        ctx.fillStyle = 'rgba(8, 14, 22, 0.85)';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(0, 0, w, h);

        // 1. Draw Buildings (faint wireframe blocks)
        ctx.strokeStyle = 'rgba(70, 110, 140, 0.35)';
        ctx.lineWidth = 0.8;
        this.buildings.forEach(b => {
            const poly = b.polygon;
            if (poly.length < 3) return;
            ctx.beginPath();
            const p0 = this.worldToMapPx(poly[0].x, poly[0].z);
            ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < poly.length; i++) {
                const pt = this.worldToMapPx(poly[i].x, poly[i].z);
                ctx.lineTo(pt.x, pt.y);
            }
            ctx.closePath();
            ctx.stroke();
        });

        // 2. Draw Road Network (All roads unified in glowing green)
        this.roads.forEach(r => {
            const pts = r.points;
            if (pts.length < 2) return;
            ctx.beginPath();
            const p0 = this.worldToMapPx(pts[0].x, pts[0].z);
            ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < pts.length; i++) {
                const pt = this.worldToMapPx(pts[i].x, pts[i].z);
                ctx.lineTo(pt.x, pt.y);
            }
            if (r.is_closed) {
                ctx.closePath();
            }

            if (r.priority >= 3) {
                // Årølivegen main artery
                ctx.strokeStyle = 'rgba(0, 255, 204, 0.9)';
                ctx.lineWidth = 2.2;
            } else {
                ctx.strokeStyle = 'rgba(0, 255, 204, 0.55)';
                ctx.lineWidth = 1.2;
            }
            ctx.stroke();
        });

        // 3. Draw Checkpoint Gates
        this.checkpoints.forEach((cp, idx) => {
            const pt = this.worldToMapPx(cp.x, cp.z);
            const isTarget = (idx === currentCpIdx);

            ctx.beginPath();
            if (isTarget) {
                const pulse = 4 + Math.sin(Date.now() * 0.008) * 2;
                ctx.arc(pt.x, pt.y, pulse, 0, Math.PI * 2);
                ctx.fillStyle = '#ffff00';
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            } else if (idx < currentCpIdx) {
                ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
                ctx.fillStyle = '#00aa55';
                ctx.fill();
            } else {
                ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
                ctx.fillStyle = (cp.type === 'finish') ? '#ff0055' : '#336699';
                ctx.fill();
            }
        });

        // 4. Draw Player Rally Car (Arrow & Dot)
        const carPt = this.worldToMapPx(playerPhysics.x, playerPhysics.z);
        // Heading angle in screen space:
        // In local 3D, yaw 0 is North (+Z). Map screen Y is inverted (+Y is South).
        // Let's compute heading vector in map space:
        const fx = Math.sin(playerPhysics.yaw);
        const fz = Math.cos(playerPhysics.yaw);
        const nose = this.worldToMapPx(playerPhysics.x + fx * 15.0, playerPhysics.z + fz * 15.0);
        const angle = Math.atan2(nose.y - carPt.y, nose.x - carPt.x);

        ctx.save();
        ctx.translate(carPt.x, carPt.y);
        ctx.rotate(angle);

        // Proportional car arrow icon matching map scale
        ctx.fillStyle = '#ff0055';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(5.5, 0);
        ctx.lineTo(-3.5, -2.8);
        ctx.lineTo(-1.5, 0);
        ctx.lineTo(-3.5, 2.8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();

        // Minimap Title
        ctx.fillStyle = '#00ffcc';
        ctx.font = '9px monospace';
        ctx.fillText('ÅRØLIA KARTUTSNITT', 8, 14);
    }
}

window.HUDMinimap = HUDMinimap;
