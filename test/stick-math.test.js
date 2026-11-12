import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_DEADZONE,
  clampPitch,
  clampStickOrigin,
  isLeftMoveZone,
  isRightLookZone,
  lookFromDelta,
  stickFromPointer,
  stickToWorld,
} from "../client/js/stick-math.js";

describe("stickFromPointer", () => {
  it("keeps the origin as a zero vector, even on the yellow knob in the center", () => {
    const v = stickFromPointer(100, 200, 100, 200, 76);
    assert.equal(v.dx, 0);
    assert.equal(v.dy, 0);
    assert.equal(v.inDeadzone, true);
  });

  it("uses a small deadzone of about 10%", () => {
    assert.equal(DEFAULT_DEADZONE, 0.1);
    const inside = stickFromPointer(100 + 7, 200, 100, 200, 100);
    assert.equal(inside.inDeadzone, true);
    assert.equal(inside.dx, 0);
    const outside = stickFromPointer(100 + 20, 200, 100, 200, 100);
    assert.equal(outside.inDeadzone, false);
    assert.ok(outside.dx > 0);
    assert.ok(Math.abs(outside.dy) < 1e-9);
  });

  it("maps screen drag directions exactly: right, left, down, up", () => {
    const r = 80;
    const right = stickFromPointer(200, 100, 100, 100, r);
    const left = stickFromPointer(0, 100, 100, 100, r);
    const down = stickFromPointer(100, 200, 100, 100, r);
    const up = stickFromPointer(100, 0, 100, 100, r);
    assert.ok(right.dx > 0.9 && Math.abs(right.dy) < 1e-9);
    assert.ok(left.dx < -0.9 && Math.abs(left.dy) < 1e-9);
    assert.ok(down.dy > 0.9 && Math.abs(down.dx) < 1e-9);
    assert.ok(up.dy < -0.9 && Math.abs(up.dx) < 1e-9);
  });

  it("clamps vectors longer than the radius to unit length", () => {
    const v = stickFromPointer(400, 100, 100, 100, 50);
    assert.ok(Math.abs(Math.hypot(v.dx, v.dy) - 1) < 1e-9);
    assert.ok(v.dx > 0.99);
  });

  it("uses the stored origin, so a later layout shift cannot flip the heading", () => {
    // Thumb started at (100, 100). Even if the pad's DOM rect later moved to
    // (200, 200) because the page scrolled, we still measure from (100, 100).
    const v = stickFromPointer(100, 40, 100, 100, 80);
    assert.ok(v.dy < -0.7);
    assert.ok(Math.abs(v.dx) < 1e-9);
  });
});

describe("stickToWorld", () => {
  it("matches the screen axes when yaw is 0 (classic top-down)", () => {
    assert.deepEqual(stickToWorld(1, 0, 0), { dx: 1, dy: 0 });
    assert.deepEqual(stickToWorld(-1, 0, 0), { dx: -1, dy: 0 });
    assert.deepEqual(stickToWorld(0, 1, 0), { dx: 0, dy: 1 });
    assert.deepEqual(stickToWorld(0, -1, 0), { dx: 0, dy: -1 });
  });

  it("treats stick-up as forward when the camera has turned right", () => {
    const yaw = Math.PI / 2;
    const forward = stickToWorld(0, -1, yaw);
    assert.ok(forward.dx > 0.99 && Math.abs(forward.dy) < 1e-9);
    const right = stickToWorld(1, 0, yaw);
    assert.ok(right.dy > 0.99 && Math.abs(right.dx) < 1e-9);
  });

  it("treats stick-up as backward on the map when the player faces the bottom", () => {
    const yaw = Math.PI;
    const forward = stickToWorld(0, -1, yaw);
    assert.ok(forward.dy > 0.99 && Math.abs(forward.dx) < 1e-9);
  });
});

describe("look and zones", () => {
  it("splits the screen into a left move half and a right look half", () => {
    assert.equal(isLeftMoveZone(10, 200, 400), true);
    assert.equal(isLeftMoveZone(199, 200, 400), true);
    assert.equal(isLeftMoveZone(200, 200, 400), false);
    assert.equal(isRightLookZone(200, 200, 400), true);
    assert.equal(isRightLookZone(10, 200, 400), false);
  });

  it("turns right when the look pad is dragged right, and looks up when dragged up", () => {
    const right = lookFromDelta(20, 0, 0.01);
    assert.ok(right.yawDelta > 0);
    assert.ok(Math.abs(right.pitchDelta) < 1e-12);
    const up = lookFromDelta(0, -20, 0.01);
    assert.ok(up.pitchDelta > 0);
    const down = lookFromDelta(0, 20, 0.01);
    assert.ok(down.pitchDelta < 0);
  });

  it("clamps pitch so the camera cannot flip over", () => {
    assert.ok(clampPitch(3) < Math.PI / 2);
    assert.ok(clampPitch(-3) > -Math.PI / 2);
    assert.equal(clampPitch(0.2), 0.2);
  });

  it("keeps a spawned stick mostly on screen", () => {
    const c = clampStickOrigin(0, 0, 76, 400, 800, 8);
    assert.ok(c.x >= 84);
    assert.ok(c.y >= 84);
    const br = clampStickOrigin(400, 800, 76, 400, 800, 8);
    assert.ok(br.x <= 400 - 84);
    assert.ok(br.y <= 800 - 84);
  });
});
