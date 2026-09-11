// Full Headless Node Integration Test for Årølia Rally Game
const fs = require('fs');

// Mock browser environment
const window = {};
global.window = window;
global.performance = { now: () => Date.now() };

// Mock Canvas & 2D Context
class MockContext2D {
    constructor() {
        this.globalAlpha = 1.0;
        this.lineWidth = 1.0;
        this.strokeStyle = '#fff';
        this.fillStyle = '#000';
    }
    clearRect() {}
    fillRect() {}
    strokeRect() {}
    beginPath() {}
    moveTo() {}
    lineTo() {}
    closePath() {}
    stroke() {}
    fill() {}
    arc() {}
    save() {}
    restore() {}
    translate() {}
    rotate() {}
    fillText() {}
}

class MockCanvas {
    constructor(w = 1280, h = 720) {
        this.width = w;
        this.height = h;
    }
    getContext() {
        return new MockContext2D();
    }
}

// Load scripts in dependency order
const scripts = [
    'js/data/bundle.js',
    'js/engine/math3d.js',
    'js/engine/terrain.js',
    'js/engine/physics.js',
    'js/engine/wireframeRenderer.js',
    'js/engine/audio.js',
    'js/game/car.js',
    'js/game/track.js',
    'js/game/minimap.js'
];

for (const s of scripts) {
    const code = fs.readFileSync(s, 'utf-8');
    eval(code);
}

// Mirror window properties to global
for (const k of Object.keys(window)) {
    global[k] = window[k];
}

console.log('All game scripts loaded into Node environment successfully!');

// Test Subsystems
const data = window.AROLIA_DATA;
if (!data) throw new Error('Data bundle missing!');

const terrain = new window.Terrain(data.arolia_terrain);
const carPhysics = new window.RallyCarPhysics(terrain, data.arolia_buildings);
const carModel = new window.WireframeCar();
const track = new window.RallyTrack(data.rally_track, null);
const renderCanvas = new MockCanvas(1280, 720);
const minimapCanvas = new MockCanvas(280, 158);
const renderer = new window.WireframeRenderer(renderCanvas);
const minimap = new window.HUDMinimap(
    minimapCanvas,
    data.arolia_roads,
    data.arolia_buildings,
    track.checkpoints,
    data.projection_meta
);

console.log('Subsystems instantiated successfully!');

// Run 300 physics & render frames (5 seconds of simulated driving)
const dt = 1.0 / 60.0;
track.startRace();

for (let frame = 0; frame < 300; frame++) {
    // Steer towards next checkpoint
    const targetCp = track.checkpoints[track.currentCheckpointIndex] || track.checkpoints[0];
    const dx = targetCp.x - carPhysics.x;
    const dz = targetCp.z - carPhysics.z;
    const targetHeading = Math.atan2(dx, dz);
    let diff = targetHeading - carPhysics.yaw;
    diff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;

    const steer = Math.max(-1.0, Math.min(1.0, diff * 1.5));
    const throttle = 1.0;
    const brake = 0.0;
    const handbrake = false;

    carPhysics.update(throttle, steer, brake, handbrake, dt);
    carModel.updateParticles(dt);
    track.update(carPhysics, dt);

    // Update camera and render
    const fx = Math.sin(carPhysics.yaw);
    const fz = Math.cos(carPhysics.yaw);
    const camPos = new window.Vector3(carPhysics.x - fx * 7.0, carPhysics.y + 3.0, carPhysics.z - fz * 7.0);
    const camTarget = new window.Vector3(carPhysics.x + fx * 15.0, carPhysics.y + 1.2, carPhysics.z + fz * 15.0);
    renderer.setCamera(camPos, camTarget);

    renderer.renderScene(
        terrain,
        data.arolia_roads,
        data.arolia_buildings,
        data.scenery,
        carModel,
        carPhysics,
        track
    );

    minimap.draw(carPhysics, track.currentCheckpointIndex);
}

console.log(`Simulation complete! 300 frames passed.`);
console.log(`Car Position: (${carPhysics.x.toFixed(1)}, ${carPhysics.y.toFixed(1)}, ${carPhysics.z.toFixed(1)})`);
console.log(`Car Speed: ${(carPhysics.speed * 3.6).toFixed(1)} km/h`);
console.log(`Checkpoint Reached: ${track.currentCheckpointIndex}/${track.totalCheckpoints}`);

if (carPhysics.speed > 5.0 && track.currentCheckpointIndex >= 2) {
    console.log('PASS: Headless integration test succeeded!');
} else {
    console.error('FAIL: Car did not make progress');
    process.exit(1);
}
