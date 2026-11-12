import {
  DEFAULT_DEADZONE,
  clampPitch,
  isLeftMoveZone,
  lookFromDelta,
  stickFromPointer,
  stickToWorld,
} from "./stick-math.js";

const BASE_SIZE = 152;
const KNOB_SIZE = 72;
const RADIUS = BASE_SIZE / 2;
const PASSIVE_FALSE = { passive: false };

function uiTarget(el) {
  return el?.closest?.("button, input, select, textarea, a, #hud-tools, label");
}

function hasPointerEvents() {
  return typeof window !== "undefined" && "PointerEvent" in window;
}

export function createInput({
  moveZone,
  base,
  knob,
  lookZone = null,
  getYaw = () => 0,
  getPitch = () => 0,
  setLook = null,
  lookEnabled = () => false,
} = {}) {
  const keys = new Set();
  let usesTouch = false;
  let move = {
    pointerId: null,
    touchId: null,
    originX: 0,
    originY: 0,
    dx: 0,
    dy: 0,
    held: false,
  };
  let look = {
    pointerId: null,
    touchId: null,
    lastX: 0,
    lastY: 0,
  };

  function keyDir() {
    let dx = 0;
    let dy = 0;
    if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) dx -= 1;
    if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) dx += 1;
    if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) dy -= 1;
    if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) dy += 1;
    return { dx, dy };
  }

  function dir() {
    if (move.held) return stickToWorld(move.dx, move.dy, getYaw() || 0);
    return stickToWorld(keyDir().dx, keyDir().dy, getYaw() || 0);
  }

  window.addEventListener("keydown", (e) => {
    keys.add(e.key);
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key));
  window.addEventListener("blur", endAll);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) endAll();
  });

  function restPosition() {
    const pad = 20;
    const bottom = 20 + (Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("dummy"), 10) || 0);
    const safe = 0;
    try {
      // env() isn't readable from JS; use the visual viewport and a generous inset.
      return {
        x: pad + RADIUS,
        y: window.innerHeight - pad - RADIUS - safe,
      };
    } catch {
      return { x: pad + RADIUS, y: (window.innerHeight || 640) - pad - RADIUS };
    }
  }

  function placeBase(originX, originY) {
    if (!base) return;
    base.style.left = `${originX - RADIUS}px`;
    base.style.top = `${originY - RADIUS}px`;
    base.classList.add("active");
  }

  function placeKnob(clientX, clientY, originX, originY) {
    if (!knob) return;
    let lx = clientX - originX;
    let ly = clientY - originY;
    const mag = Math.hypot(lx, ly);
    if (mag > RADIUS) {
      lx = (lx / mag) * RADIUS;
      ly = (ly / mag) * RADIUS;
    }
    // knob is position:absolute inside the base; origin is the base center
    const cx = RADIUS - KNOB_SIZE / 2;
    knob.style.left = `${cx + lx}px`;
    knob.style.top = `${cx + ly}px`;
  }

  function resetKnob() {
    if (!knob) return;
    const cx = RADIUS - KNOB_SIZE / 2;
    knob.style.left = `${cx}px`;
    knob.style.top = `${cx}px`;
  }

  function showRestingBase() {
    if (!base || !moveZone || moveZone.classList.contains("hidden")) return;
    const rest = restPosition();
    placeBase(rest.x, rest.y);
    base.classList.remove("active");
    resetKnob();
  }

  function startMove(clientX, clientY, pointerId, touchId) {
    usesTouch = true;
    moveZone?.classList.remove("hidden");
    move = {
      pointerId,
      touchId,
      originX: clientX,
      originY: clientY,
      dx: 0,
      dy: 0,
      held: true,
    };
    placeBase(clientX, clientY);
    placeKnob(clientX, clientY, clientX, clientY);
  }

  function updateMove(clientX, clientY) {
    if (!move.held) return;
    const v = stickFromPointer(clientX, clientY, move.originX, move.originY, RADIUS, DEFAULT_DEADZONE);
    move.dx = v.dx;
    move.dy = v.dy;
    placeKnob(clientX, clientY, move.originX, move.originY);
  }

  function endMove() {
    move = {
      pointerId: null,
      touchId: null,
      originX: 0,
      originY: 0,
      dx: 0,
      dy: 0,
      held: false,
    };
    showRestingBase();
  }

  function applyLookDelta(dx, dy) {
    if (!setLook || !lookEnabled()) return;
    const turn = lookFromDelta(dx, dy);
    const yaw = (getYaw() || 0) + turn.yawDelta;
    const pitch = clampPitch((getPitch() || 0) + turn.pitchDelta);
    setLook(yaw, pitch);
  }

  function startLook(clientX, clientY, pointerId, touchId) {
    look = { pointerId, touchId, lastX: clientX, lastY: clientY };
  }

  function updateLook(clientX, clientY) {
    if (look.pointerId == null && look.touchId == null) return;
    applyLookDelta(clientX - look.lastX, clientY - look.lastY);
    look.lastX = clientX;
    look.lastY = clientY;
  }

  function endLook() {
    look = { pointerId: null, touchId: null, lastX: 0, lastY: 0 };
  }

  function endAll() {
    endMove();
    endLook();
    keys.clear();
  }

  function capturePointer(el, ev) {
    if (el?.setPointerCapture && ev.pointerId != null) {
      try {
        el.setPointerCapture(ev.pointerId);
      } catch {
        /* some browsers reject capture on an inactive pointer */
      }
    }
  }

  function onMovePointerDown(ev) {
    if (uiTarget(ev.target)) return;
    if (move.held) return;
    if (!isLeftMoveZone(ev.clientX, ev.clientY, window.innerWidth)) return;
    ev.preventDefault();
    ev.stopPropagation();
    usesTouch = ev.pointerType !== "mouse" || usesTouch;
    capturePointer(moveZone, ev);
    startMove(ev.clientX, ev.clientY, ev.pointerId, null);
  }

  function onMovePointerMove(ev) {
    if (!move.held || ev.pointerId !== move.pointerId) return;
    ev.preventDefault();
    updateMove(ev.clientX, ev.clientY);
  }

  function onMovePointerUp(ev) {
    if (ev.pointerId !== move.pointerId) return;
    ev.preventDefault();
    if (moveZone?.hasPointerCapture?.(ev.pointerId)) {
      try {
        moveZone.releasePointerCapture(ev.pointerId);
      } catch {
        /* already released */
      }
    }
    endMove();
  }

  function onLookPointerDown(ev) {
    if (!lookEnabled() || uiTarget(ev.target)) return;
    if (look.pointerId != null) return;
    ev.preventDefault();
    ev.stopPropagation();
    capturePointer(lookZone, ev);
    startLook(ev.clientX, ev.clientY, ev.pointerId, null);
  }

  function onLookPointerMove(ev) {
    if (ev.pointerId !== look.pointerId) return;
    ev.preventDefault();
    updateLook(ev.clientX, ev.clientY);
  }

  function onLookPointerUp(ev) {
    if (ev.pointerId !== look.pointerId) return;
    ev.preventDefault();
    if (lookZone?.hasPointerCapture?.(ev.pointerId)) {
      try {
        lookZone.releasePointerCapture(ev.pointerId);
      } catch {
        /* already released */
      }
    }
    endLook();
  }

  function bindPointer(el, onDown, onMove, onUp) {
    if (!el) return;
    el.addEventListener("pointerdown", onDown, PASSIVE_FALSE);
    el.addEventListener("pointermove", onMove, PASSIVE_FALSE);
    el.addEventListener("pointerup", onUp, PASSIVE_FALSE);
    el.addEventListener("pointercancel", onUp, PASSIVE_FALSE);
    el.addEventListener("lostpointercapture", onUp, PASSIVE_FALSE);
  }

  // Touch fallback when Pointer Events are missing (older WebViews).
  function touchById(list, id) {
    if (!list) return null;
    for (let i = 0; i < list.length; i++) {
      if (list[i].identifier === id) return list[i];
    }
    return null;
  }

  function onTouchStart(ev, which) {
    if (uiTarget(ev.target)) return;
    const t = ev.changedTouches?.[0];
    if (!t) return;
    if (which === "move") {
      if (move.held) return;
      if (!isLeftMoveZone(t.clientX, t.clientY, window.innerWidth)) return;
      ev.preventDefault();
      usesTouch = true;
      startMove(t.clientX, t.clientY, null, t.identifier);
    } else {
      if (!lookEnabled() || look.touchId != null) return;
      ev.preventDefault();
      startLook(t.clientX, t.clientY, null, t.identifier);
    }
  }

  function onTouchMove(ev, which) {
    const id = which === "move" ? move.touchId : look.touchId;
    if (id == null) return;
    const t = touchById(ev.touches, id) || touchById(ev.changedTouches, id);
    if (!t) return;
    ev.preventDefault();
    if (which === "move") updateMove(t.clientX, t.clientY);
    else updateLook(t.clientX, t.clientY);
  }

  function onTouchEnd(ev, which) {
    const id = which === "move" ? move.touchId : look.touchId;
    if (id == null) return;
    if (!touchById(ev.changedTouches, id)) return;
    ev.preventDefault();
    if (which === "move") endMove();
    else endLook();
  }

  function bindTouch(el, which) {
    if (!el) return;
    el.addEventListener("touchstart", (ev) => onTouchStart(ev, which), PASSIVE_FALSE);
    el.addEventListener("touchmove", (ev) => onTouchMove(ev, which), PASSIVE_FALSE);
    el.addEventListener("touchend", (ev) => onTouchEnd(ev, which), PASSIVE_FALSE);
    el.addEventListener("touchcancel", (ev) => onTouchEnd(ev, which), PASSIVE_FALSE);
  }

  function bindGestureBlock(el) {
    if (!el) return;
    el.addEventListener("gesturestart", (ev) => ev.preventDefault(), PASSIVE_FALSE);
    el.addEventListener("gesturechange", (ev) => ev.preventDefault(), PASSIVE_FALSE);
  }

  if (moveZone) {
    if (hasPointerEvents()) bindPointer(moveZone, onMovePointerDown, onMovePointerMove, onMovePointerUp);
    else bindTouch(moveZone, "move");
    bindGestureBlock(moveZone);
  }
  if (lookZone) {
    if (hasPointerEvents()) bindPointer(lookZone, onLookPointerDown, onLookPointerMove, onLookPointerUp);
    else bindTouch(lookZone, "look");
    bindGestureBlock(lookZone);
  }

  if (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches) {
    usesTouch = true;
    moveZone?.classList.remove("hidden");
    showRestingBase();
  }

  return {
    dir,
    isHeld: () => move.held,
    usesTouch: () => usesTouch,
    showJoystick() {
      moveZone?.classList.remove("hidden");
      if (lookEnabled()) lookZone?.classList.remove("hidden");
      else lookZone?.classList.add("hidden");
      showRestingBase();
    },
    hideJoystick() {
      moveZone?.classList.add("hidden");
      lookZone?.classList.add("hidden");
      endAll();
    },
    setLookEnabled(on) {
      if (on && usesTouch) lookZone?.classList.remove("hidden");
      else lookZone?.classList.add("hidden");
    },
  };
}

export function haptic(ms = 40) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore unsupported or blocked vibration */
  }
}
