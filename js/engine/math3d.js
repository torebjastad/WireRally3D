// 3D Mathematics and Projection Library for Wireframe Engine
class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    set(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
    }

    copy(v) {
        this.x = v.x;
        this.y = v.y;
        this.z = v.z;
        return this;
    }

    clone() {
        return new Vector3(this.x, this.y, this.z);
    }

    add(v) {
        this.x += v.x;
        this.y += v.y;
        this.z += v.z;
        return this;
    }

    sub(v) {
        this.x -= v.x;
        this.y -= v.y;
        this.z -= v.z;
        return this;
    }

    multiplyScalar(s) {
        this.x *= s;
        this.y *= s;
        this.z *= s;
        return this;
    }

    length() {
        return Math.hypot(this.x, this.y, this.z);
    }

    normalize() {
        const len = this.length();
        if (len > 0.00001) {
            this.x /= len;
            this.y /= len;
            this.z /= len;
        }
        return this;
    }

    dot(v) {
        return this.x * v.x + this.y * v.y + this.z * v.z;
    }

    cross(v) {
        const x = this.y * v.z - this.z * v.y;
        const y = this.z * v.x - this.x * v.z;
        const z = this.x * v.y - this.y * v.x;
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
    }
}

class Matrix4 {
    constructor() {
        this.elements = new Float32Array(16);
        this.identity();
    }

    identity() {
        const e = this.elements;
        e[0] = 1; e[4] = 0; e[8]  = 0; e[12] = 0;
        e[1] = 0; e[5] = 1; e[9]  = 0; e[13] = 0;
        e[2] = 0; e[6] = 0; e[10] = 1; e[14] = 0;
        e[3] = 0; e[7] = 0; e[11] = 0; e[15] = 1;
        return this;
    }

    lookAt(eye, target, up) {
        const zAxis = new Vector3(eye.x - target.x, eye.y - target.y, eye.z - target.z).normalize();
        const xAxis = new Vector3().copy(zAxis).cross(up).normalize();
        const yAxis = new Vector3().copy(xAxis).cross(zAxis).normalize();

        const e = this.elements;
        e[0] = xAxis.x; e[4] = xAxis.y; e[8]  = xAxis.z; e[12] = -xAxis.dot(eye);
        e[1] = yAxis.x; e[5] = yAxis.y; e[9]  = yAxis.z; e[13] = -yAxis.dot(eye);
        e[2] = zAxis.x; e[6] = zAxis.y; e[10] = zAxis.z; e[14] = -zAxis.dot(eye);
        e[3] = 0;       e[7] = 0;       e[11] = 0;       e[15] = 1;
        return this;
    }

    perspective(fovRad, aspect, near, far) {
        const f = 1.0 / Math.tan(fovRad / 2);
        const nf = 1 / (near - far);
        const e = this.elements;
        e[0] = f / aspect; e[4] = 0; e[8]  = 0;                     e[12] = 0;
        e[1] = 0;          e[5] = f; e[9]  = 0;                     e[13] = 0;
        e[2] = 0;          e[6] = 0; e[10] = (far + near) * nf;     e[14] = (2 * far * near) * nf;
        e[3] = 0;          e[7] = 0; e[11] = -1;                    e[15] = 0;
        return this;
    }

    multiply(m) {
        const a = this.elements;
        const b = m.elements;
        const r = new Float32Array(16);

        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                r[j * 4 + i] = 
                    a[i]      * b[j * 4]     + 
                    a[i + 4]  * b[j * 4 + 1] + 
                    a[i + 8]  * b[j * 4 + 2] + 
                    a[i + 12] * b[j * 4 + 3];
            }
        }
        this.elements = r;
        return this;
    }

    transformPoint(p, out = new Vector3()) {
        const e = this.elements;
        const x = p.x, y = p.y, z = p.z;
        const w = e[3] * x + e[7] * y + e[11] * z + e[15];
        
        out.x = (e[0] * x + e[4] * y + e[8]  * z + e[12]) / w;
        out.y = (e[1] * x + e[5] * y + e[9]  * z + e[13]) / w;
        out.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) / w;
        return { point: out, w: w };
    }
}

// Export to window and global
if (typeof window !== 'undefined') {
    window.Vector3 = Vector3;
    window.Matrix4 = Matrix4;
}
if (typeof global !== 'undefined') {
    global.Vector3 = Vector3;
    global.Matrix4 = Matrix4;
}
