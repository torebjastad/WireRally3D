// Test 3D Math, LookAt and Perspective Projection
const fs = require('fs');
const code = fs.readFileSync('js/engine/math3d.js', 'utf-8');
// Mock window
const window = {};
eval(code);

const Vector3 = window.Vector3;
const Matrix4 = window.Matrix4;

// Test eye, target, up
const eye = new Vector3(-20, 67, 0);
const target = new Vector3(0, 63, 0);
const up = new Vector3(0, 1, 0);

const view = new Matrix4().lookAt(eye, target, up);
const proj = new Matrix4().perspective(72 * Math.PI / 180, 16/9, 0.8, 1200);
const viewProj = proj.multiply(view);

// Project target point (which is right in front of camera)
const out = new Vector3();
const res = viewProj.transformPoint(target, out);

// Compute camera right vector:
const fwd = new Vector3(target.x - eye.x, target.y - eye.y, target.z - eye.z).normalize();
// If looking forward along +Z (North), right is +X (East): fwd x up in our system
// Or using the view matrix row 0:
const camRight = new Vector3(view.elements[0], view.elements[4], view.elements[8]);

// Project a point to the RIGHT of the camera: target + camRight * 5.0
const ptRight = new Vector3(target.x + camRight.x * 5.0, target.y + camRight.y * 5.0, target.z + camRight.z * 5.0);
const resRight = viewProj.transformPoint(ptRight);

// Project a point to the LEFT of the camera: target - camRight * 5.0
const ptLeft = new Vector3(target.x - camRight.x * 5.0, target.y - camRight.y * 5.0, target.z - camRight.z * 5.0);
const resLeft = viewProj.transformPoint(ptLeft);

console.log('Projected target point NDC: x=' + res.point.x.toFixed(4) + ', w=' + res.w.toFixed(2));
console.log('Projected RIGHT point NDC:  x=' + resRight.point.x.toFixed(4));
console.log('Projected LEFT point NDC:   x=' + resLeft.point.x.toFixed(4));

// Assert that target is centered, RIGHT point has positive NDC x, LEFT point has negative NDC x
if (Math.abs(res.point.x) < 0.01 && resRight.point.x > 0.1 && resLeft.point.x < -0.1) {
    console.log('PASS: math3d.js camera projection and left/right orientation work perfectly!');
} else {
    console.error('FAIL: math3d.js camera projection direction error');
    process.exit(1);
}
