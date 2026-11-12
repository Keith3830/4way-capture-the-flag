export function createInput(joystickRoot, knob) {
  const keys = new Set();
  let touch = { active: false, dx: 0, dy: 0 };
  let usesTouch = false;

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
    if (touch.active) return { dx: touch.dx, dy: touch.dy };
    return keyDir();
  }

  window.addEventListener("keydown", (e) => {
    keys.add(e.key);
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key));
  window.addEventListener("blur", () => keys.clear());

  function setKnob(dx, dy) {
    const r = 33;
    knob.style.left = `${33 + dx * r}px`;
    knob.style.top = `${33 + dy * r}px`;
  }

  function fromPointer(ev) {
    const base = joystickRoot.querySelector("#joystick-base") || joystickRoot;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = (ev.clientX - cx) / (rect.width / 2);
    let dy = (ev.clientY - cy) / (rect.height / 2);
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }
    touch = { active: mag > 0.08, dx, dy };
    setKnob(dx, dy);
  }

  function endTouch() {
    touch = { active: false, dx: 0, dy: 0 };
    setKnob(0, 0);
  }

  if (joystickRoot) {
    const onDown = (ev) => {
      usesTouch = true;
      joystickRoot.classList.remove("hidden");
      ev.preventDefault();
      fromPointer(ev.touches ? ev.touches[0] : ev);
    };
    const onMove = (ev) => {
      if (!touch.active && !(ev.buttons & 1) && !ev.touches) return;
      ev.preventDefault();
      fromPointer(ev.touches ? ev.touches[0] : ev);
    };
    joystickRoot.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endTouch);
    window.addEventListener("pointercancel", endTouch);
  }

  if (window.matchMedia("(pointer: coarse)").matches) {
    usesTouch = true;
    joystickRoot?.classList.remove("hidden");
  }

  return {
    dir,
    usesTouch: () => usesTouch,
    showJoystick() {
      if (usesTouch) joystickRoot?.classList.remove("hidden");
    },
    hideJoystick() {
      joystickRoot?.classList.add("hidden");
      endTouch();
    },
  };
}
