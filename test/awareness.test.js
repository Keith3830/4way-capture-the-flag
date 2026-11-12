import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { edgeIndicator } from "../client/js/awareness.js";
import { lookDirection } from "../client/js/stick-math.js";

describe("edge indicators", () => {
  it("hides the arrow when a rival is comfortably on screen", () => {
    assert.equal(edgeIndicator(0, 0, false, 800, 600), null);
    assert.equal(edgeIndicator(0.4, 0.4, false, 800, 600), null);
  });

  it("pins an off-screen target to the matching screen edge", () => {
    const right = edgeIndicator(1.4, 0, false, 800, 600, 40);
    assert.ok(right);
    assert.ok(right.x > 700);
    assert.ok(Math.abs(right.y - 300) < 40);
    const left = edgeIndicator(-1.4, 0, false, 800, 600, 40);
    assert.ok(left.x < 100);
    const up = edgeIndicator(0, 1.4, false, 800, 600, 40);
    assert.ok(up.y < 100);
    const down = edgeIndicator(0, -1.4, false, 800, 600, 40);
    assert.ok(down.y > 500);
  });

  it("flips a target behind the camera to the opposite edge", () => {
    // A point in front-right, if it were behind, should flip to the left.
    const flipped = edgeIndicator(1.2, 0, true, 800, 600, 40);
    assert.ok(flipped.x < 100);
  });
});

describe("3D look direction", () => {
  it("looks toward the top of the map when yaw is 0", () => {
    const d = lookDirection(0, 0);
    assert.ok(Math.abs(d.x) < 1e-9);
    assert.ok(Math.abs(d.y) < 1e-9);
    assert.ok(d.z < -0.99);
  });

  it("looks right when yaw is 90 degrees", () => {
    const d = lookDirection(Math.PI / 2, 0);
    assert.ok(d.x > 0.99);
    assert.ok(Math.abs(d.z) < 1e-9);
  });
});
