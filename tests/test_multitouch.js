// tests/test_multitouch.js
// Verifies multi-touch concurrent input tracking (accelerating + drag steering simultaneously)

const assert = require('assert');

// Simulate the exact multi-touch state machine from gameLoop.js
class MultiTouchManager {
    constructor() {
        this.keys = { forward: false, backward: false, handbrake: false, left: false, right: false };
        this.mouseSteer = {
            isDragging: false,
            touchId: null,
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0,
            steerValue: 0.0
        };
    }

    onPedalTouchStart(key) {
        this.keys[key] = true;
    }

    onPedalTouchEnd(key) {
        this.keys[key] = false;
    }

    onCanvasTouchStart(touchId, clientX, clientY) {
        if (this.mouseSteer.touchId !== null) return;
        this.mouseSteer.touchId = touchId;
        this.mouseSteer.isDragging = true;
        this.mouseSteer.startX = clientX;
        this.mouseSteer.startY = clientY;
        this.mouseSteer.currentX = clientX;
        this.mouseSteer.currentY = clientY;
        this.mouseSteer.steerValue = 0.0;
    }

    onCanvasTouchMove(changedTouches) {
        if (!this.mouseSteer.isDragging || this.mouseSteer.touchId === null) return;
        for (const t of changedTouches) {
            if (t.identifier === this.mouseSteer.touchId) {
                this.mouseSteer.currentX = t.clientX;
                this.mouseSteer.currentY = t.clientY;
                const dx = t.clientX - this.mouseSteer.startX;
                const maxDrag = 300.0;
                let raw = Math.max(-1.0, Math.min(1.0, dx / maxDrag));
                this.mouseSteer.steerValue = Math.sign(raw) * Math.pow(Math.abs(raw), 1.55);
                break;
            }
        }
    }

    onCanvasTouchEnd(changedTouches) {
        if (this.mouseSteer.touchId === null) return;
        for (const t of changedTouches) {
            if (t.identifier === this.mouseSteer.touchId) {
                this.mouseSteer.touchId = null;
                this.mouseSteer.isDragging = false;
                this.mouseSteer.steerValue = 0.0;
                break;
            }
        }
    }
}

console.log('Running Multi-touch Concurrency Tests...');

// Scenario 1: Press Gas (Pedal), then Start Drag-Steering on Viewport
{
    const mgr = new MultiTouchManager();
    // User places right thumb on Gas (Touch ID 0)
    mgr.onPedalTouchStart('forward');
    assert.strictEqual(mgr.keys.forward, true, 'Gas pedal must be active');
    assert.strictEqual(mgr.mouseSteer.isDragging, false, 'Drag steering not started yet');

    // User places left thumb on screen (Touch ID 1) to steer right
    mgr.onCanvasTouchStart(1, 200, 400);
    assert.strictEqual(mgr.keys.forward, true, 'Gas pedal must still be active when drag starts');
    assert.strictEqual(mgr.mouseSteer.isDragging, true, 'Drag steering is active');
    assert.strictEqual(mgr.mouseSteer.touchId, 1, 'Drag steering tracks Touch ID 1');

    // User drags right by 150px
    mgr.onCanvasTouchMove([{ identifier: 1, clientX: 350, clientY: 400 }]);
    assert.strictEqual(mgr.keys.forward, true, 'Gas pedal still pressed while dragging');
    assert.ok(mgr.mouseSteer.steerValue > 0.2, `Steering should be positive (right), got ${mgr.mouseSteer.steerValue}`);

    // User releases Gas pedal (Touch ID 0)
    mgr.onPedalTouchEnd('forward');
    assert.strictEqual(mgr.keys.forward, false, 'Gas pedal released');
    assert.strictEqual(mgr.mouseSteer.isDragging, true, 'Drag steering MUST persist after releasing gas');
    assert.ok(mgr.mouseSteer.steerValue > 0.2, 'Steering value maintained');

    // User finishes steering turn
    mgr.onCanvasTouchEnd([{ identifier: 1 }]);
    assert.strictEqual(mgr.mouseSteer.isDragging, false, 'Drag steering ended cleanly');
    assert.strictEqual(mgr.mouseSteer.steerValue, 0.0, 'Steering value reset to zero');
    console.log('  -> Scenario 1 PASSED: Gas pressed first, drag steering concurrent.');
}

// Scenario 2: Start Drag-Steering First, then tap Gas & Drift
{
    const mgr = new MultiTouchManager();
    // User places left thumb to steer left (Touch ID 10)
    mgr.onCanvasTouchStart(10, 200, 400);
    mgr.onCanvasTouchMove([{ identifier: 10, clientX: 100, clientY: 400 }]);
    assert.strictEqual(mgr.mouseSteer.isDragging, true);
    assert.ok(mgr.mouseSteer.steerValue < -0.15, `Steering left, got ${mgr.mouseSteer.steerValue}`);

    // Right thumb presses Gas
    mgr.onPedalTouchStart('forward');
    assert.strictEqual(mgr.keys.forward, true);
    assert.ok(mgr.mouseSteer.steerValue < -0.15, 'Steering unchanged by gas press');

    // Right thumb also slides or taps DRIFT
    mgr.onPedalTouchStart('handbrake');
    assert.strictEqual(mgr.keys.handbrake, true);
    assert.strictEqual(mgr.keys.forward, true);

    // Another touch (e.g. spurious touch on bezel or pedal) should not disrupt canvas steering
    mgr.onCanvasTouchMove([{ identifier: 99, clientX: 50, clientY: 50 }]);
    assert.ok(mgr.mouseSteer.steerValue < -0.15, 'Steering ignored unrelated touch identifier');

    // Release drift
    mgr.onPedalTouchEnd('handbrake');
    assert.strictEqual(mgr.keys.handbrake, false);
    assert.strictEqual(mgr.keys.forward, true);
    assert.strictEqual(mgr.mouseSteer.isDragging, true);

    // Release canvas touch
    mgr.onCanvasTouchEnd([{ identifier: 10 }]);
    assert.strictEqual(mgr.mouseSteer.isDragging, false);
    assert.strictEqual(mgr.keys.forward, true, 'Gas pedal still held after steering release');

    // Release gas
    mgr.onPedalTouchEnd('forward');
    assert.strictEqual(mgr.keys.forward, false);
    console.log('  -> Scenario 2 PASSED: Drag steering first, pedals tapped concurrently.');
}

console.log('ALL MULTI-TOUCH CONCURRENCY TESTS PASSED (100%)!');
