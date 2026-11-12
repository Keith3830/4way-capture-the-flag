let ctx = null;
let muted = false;
let musicTimer = null;
let started = false;

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = Boolean(value);
  if (muted) stopMusic();
  else if (started) startMusic();
}

export function toggleMute() {
  setMuted(!muted);
  return muted;
}

export function unlock() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  started = true;
}

function now() {
  if (!ctx) unlock();
  return ctx.currentTime;
}

function tone(freq, t, dur, type = "sine", gain = 0.08, attack = 0.01) {
  if (muted || !ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function play(kind) {
  if (muted) return;
  unlock();
  const t = now();
  if (kind === "pickup") {
    tone(520, t, 0.12, "triangle", 0.07);
    tone(780, t + 0.06, 0.12, "triangle", 0.06);
  } else if (kind === "deposit") {
    tone(392, t, 0.2, "triangle", 0.08);
    tone(494, t + 0.06, 0.22, "triangle", 0.07);
    tone(587, t + 0.12, 0.28, "triangle", 0.07);
  } else if (kind === "tag") {
    tone(180, t, 0.16, "square", 0.04);
    tone(110, t + 0.05, 0.2, "sine", 0.06);
  } else if (kind === "rescue") {
    tone(440, t, 0.12, "sine", 0.06);
    tone(660, t + 0.08, 0.16, "sine", 0.05);
  } else if (kind === "gameover") {
    tone(523, t, 0.2, "triangle", 0.08);
    tone(659, t + 0.14, 0.22, "triangle", 0.07);
    tone(784, t + 0.28, 0.4, "triangle", 0.08);
  } else if (kind === "start") {
    tone(392, t, 0.15, "triangle", 0.06);
    tone(523, t + 0.12, 0.2, "triangle", 0.06);
  } else if (kind === "click") {
    tone(700, t, 0.05, "sine", 0.03);
  }
}

export function startMusic() {
  if (muted) return;
  unlock();
  stopMusic();
  const notes = [262, 330, 392, 523, 392, 330, 294, 349, 440, 349];
  let i = 0;
  const step = () => {
    if (muted || !ctx) return;
    const t = now();
    tone(notes[i % notes.length], t, 0.28, "sine", 0.025);
    tone(notes[(i + 2) % notes.length], t, 0.28, "triangle", 0.012);
    i += 1;
  };
  step();
  musicTimer = setInterval(step, 420);
}

export function stopMusic() {
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}
