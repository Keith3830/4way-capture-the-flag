/** Default analog deadzone as a fraction of the stick radius. */
export const DEFAULT_DEADZONE = 0.1;

/**
 * Compute a clamped analog stick vector from a pointer and a fixed origin.
 * `dx` is right and `dy` is down, matching CSS / screen space. Values are in
 * [-1, 1]. The origin must be the grab point in client coordinates (not a live
 * DOM rect) so a page scroll cannot flip the direction mid-gesture.
 */
export function stickFromPointer(
  clientX,
  clientY,
  originX,
  originY,
  radius,
  deadzone = DEFAULT_DEADZONE,
) {
  const r = radius > 0 ? radius : 1;
  const dz = Math.min(Math.max(deadzone, 0), 0.5);
  let dx = (clientX - originX) / r;
  let dy = (clientY - originY) / r;
  const rawMag = Math.hypot(dx, dy);
  if (rawMag > 1) {
    dx /= rawMag;
    dy /= rawMag;
  }
  const mag = Math.min(rawMag, 1);
  if (mag <= dz) {
    return { dx: 0, dy: 0, mag, inDeadzone: true };
  }
  const scaled = (mag - dz) / (1 - dz);
  const current = Math.hypot(dx, dy) || 1;
  const factor = scaled / current;
  return { dx: dx * factor, dy: dy * factor, mag: scaled, inDeadzone: false };
}

/**
 * Map a screen-space stick vector (dx right, dy down) into field axes
 * (x right, y down on the classic top-down map).
 * yaw = 0 looks toward -Y (the top of the map). Positive yaw turns right.
 */
export function stickToWorld(stickDx, stickDy, yaw = 0) {
  const forward = -stickDy;
  const right = stickDx;
  return {
    dx: Math.cos(yaw) * right + Math.sin(yaw) * forward,
    dy: Math.sin(yaw) * right - Math.cos(yaw) * forward,
  };
}

/** Keep a circular pad of `radius` mostly on-screen. */
export function clampStickOrigin(x, y, radius, width, height, margin = 8) {
  const r = Math.max(0, radius) + margin;
  const w = Math.max(r * 2, width || 0);
  const h = Math.max(r * 2, height || 0);
  return {
    x: Math.min(Math.max(x, r), w - r),
    y: Math.min(Math.max(y, r), h - r),
  };
}

export function isLeftMoveZone(clientX, _clientY, viewportWidth) {
  return clientX < viewportWidth * 0.5;
}

export function isRightLookZone(clientX, _clientY, viewportWidth) {
  return clientX >= viewportWidth * 0.5;
}

/**
 * Convert a look-drag in CSS pixels into yaw / pitch deltas.
 * Dragging right turns right (positive yaw). Dragging up looks up (negative pitch).
 */
export function lookFromDelta(deltaX, deltaY, sensitivity = 0.005) {
  return {
    yawDelta: deltaX * sensitivity,
    pitchDelta: -deltaY * sensitivity,
  };
}

export function clampPitch(pitch, limit = Math.PI / 2 - 0.08) {
  return Math.min(Math.max(pitch, -limit), limit);
}

/** Unit look vector in field/3D space. yaw 0 looks toward -Z (top of the map). */
export function lookDirection(yaw, pitch = 0) {
  const cp = Math.cos(pitch);
  return {
    x: Math.sin(yaw) * cp,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * cp,
  };
}
