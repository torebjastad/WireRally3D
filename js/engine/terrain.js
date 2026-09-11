// Terrain height and surface evaluation using Kartverket DTM1 data
class Terrain {
    constructor(data) {
        this.data = data;
        this.xMin = data.x_min;
        this.xMax = data.x_max;
        this.zMin = data.z_min;
        this.zMax = data.z_max;
        this.nx = data.nx;
        this.nz = data.nz;
        this.step = data.grid_step;
        this.vertices = data.vertices;
    }

    getHeight(x, z) {
        const u = (x - this.xMin) / this.step;
        const v = (z - this.zMin) / this.step;

        const clampedU = Math.max(0, Math.min(this.nx - 1.0001, u));
        const clampedV = Math.max(0, Math.min(this.nz - 1.0001, v));

        const i0 = Math.floor(clampedU);
        const j0 = Math.floor(clampedV);
        const i1 = Math.min(this.nx - 1, i0 + 1);
        const j1 = Math.min(this.nz - 1, j0 + 1);

        const fu = clampedU - i0;
        const fv = clampedV - j0;

        const y00 = this.vertices[j0][i0].y;
        const y10 = this.vertices[j0][i1].y;
        const y01 = this.vertices[j1][i0].y;
        const y11 = this.vertices[j1][i1].y;

        const y0 = y00 * (1 - fu) + y10 * fu;
        const y1 = y01 * (1 - fu) + y11 * fu;

        return y0 * (1 - fv) + y1 * fv;
    }

    getNormal(x, z, delta = 1.0) {
        const hL = this.getHeight(x - delta, z);
        const hR = this.getHeight(x + delta, z);
        const hD = this.getHeight(x, z - delta);
        const hU = this.getHeight(x, z + delta);

        const normal = new Vector3(
            (hL - hR) / (2 * delta),
            1.0,
            (hD - hU) / (2 * delta)
        );
        return normal.normalize();
    }
}

window.Terrain = Terrain;
