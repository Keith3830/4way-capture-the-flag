const COLORS = {
  red: "#E23B3B",
  blue: "#2F6FED",
  yellow: "#E0B000",
  pink: "#E85A9B",
};
const FIELD = 1000;
const CENTER = 500;
const CONE_ZONE = 168;
const NEARBY = 320;
const TEAMS = ["red", "blue", "yellow", "pink"];

/**
 * Place an arrow on the screen edge pointing at a target.
 * ndcX / ndcY are clip-space coords (x right, y up). `behind` is true when the
 * target is behind the camera and should be flipped to the opposite edge.
 * Returns null when the target is comfortably on-screen.
 */
export function edgeIndicator(ndcX, ndcY, behind, width, height, margin = 36) {
  let x = ndcX;
  let y = ndcY;
  if (behind) {
    x = -x;
    y = -y;
  }
  const onScreen = !behind && Math.abs(x) <= 0.85 && Math.abs(y) <= 0.85;
  if (onScreen) return null;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  let px = x;
  let py = y;
  const scale = 1 / Math.max(ax, ay, 1e-6);
  px *= scale;
  py *= scale;
  const sx = Math.min(Math.max((px * 0.5 + 0.5) * width, margin), width - margin);
  const sy = Math.min(Math.max((-py * 0.5 + 0.5) * height, margin), height - margin);
  return {
    x: sx,
    y: sy,
    angle: Math.atan2(sy - height / 2, sx - width / 2),
  };
}

export function createMinimap(canvas) {
  const ctx = canvas.getContext("2d");

  function draw(state, meId) {
    const w = canvas.width;
    const h = canvas.height;
    const pad = 8;
    const size = Math.min(w, h) - pad * 2;
    const ox = (w - size) / 2;
    const oy = (h - size) / 2;
    const s = size / FIELD;
    const to = (x, y) => [ox + x * s, oy + y * s];

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(6, 16, 39, 0.72)";
    ctx.beginPath();
    ctx.roundRect?.(0, 0, w, h, 12);
    if (!ctx.roundRect) ctx.rect(0, 0, w, h);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const tints = {
      red: "#f4b4b0",
      blue: "#b3c8f6",
      yellow: "#ead56a",
      pink: "#f0b5d1",
    };
    const quarters = [
      [0, 0, CENTER, CENTER, tints.red],
      [CENTER, 0, CENTER, CENTER, tints.blue],
      [0, CENTER, CENTER, CENTER, tints.yellow],
      [CENTER, CENTER, CENTER, CENTER, tints.pink],
    ];
    for (const [x, y, qw, qh, c] of quarters) {
      const [sx, sy] = to(x, y);
      ctx.fillStyle = c;
      ctx.fillRect(sx, sy, qw * s, qh * s);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(...to(0, 0), FIELD * s, FIELD * s);
    ctx.beginPath();
    ctx.moveTo(...to(CENTER, 0));
    ctx.lineTo(...to(CENTER, FIELD));
    ctx.moveTo(...to(0, CENTER));
    ctx.lineTo(...to(FIELD, CENTER));
    ctx.stroke();

    for (const team of TEAMS) {
      const r = stashRect(team);
      ctx.strokeStyle = "#E67A2A";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      const [sx, sy] = to(r.x, r.y);
      ctx.strokeRect(sx, sy, CONE_ZONE * s, CONE_ZONE * s);
      ctx.setLineDash([]);
      const stash = state?.stashes?.[team];
      if (stash) {
        for (const color of TEAMS) {
          const n = stash.available?.[color] || 0;
          if (!n) continue;
          ctx.fillStyle = COLORS[color];
          const [bx, by] = to(r.x + CONE_ZONE / 2, r.y + CONE_ZONE / 2);
          ctx.beginPath();
          ctx.arc(bx + (TEAMS.indexOf(color) - 1.5) * 5, by, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    const me = state?.players?.find((p) => p.id === meId);
    for (const p of state?.players || []) {
      const [sx, sy] = to(p.x, p.y);
      ctx.fillStyle = COLORS[p.team];
      ctx.beginPath();
      ctx.arc(sx, sy, p.id === meId ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (p.id === meId) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        const ang = p.angle || 0;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(ang) * 9, sy + Math.sin(ang) * 9);
        ctx.stroke();
      }
      if (p.carrying) {
        ctx.fillStyle = COLORS[p.carrying.color];
        ctx.fillRect(sx + 3, sy - 7, 5, 4);
      }
    }
    if (me) {
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(...to(me.x, me.y), 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  return { draw };
}

function stashRect(team) {
  if (team === "red") return { x: 0, y: 0 };
  if (team === "blue") return { x: FIELD - CONE_ZONE, y: 0 };
  if (team === "yellow") return { x: 0, y: FIELD - CONE_ZONE };
  return { x: FIELD - CONE_ZONE, y: FIELD - CONE_ZONE };
}

export function createAwareness(canvas) {
  const ctx = canvas.getContext("2d");

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    return dpr;
  }

  function draw(state, meId, projectFn, now) {
    const dpr = canvas.width / Math.max(1, canvas.clientWidth || window.innerWidth);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const me = state?.players?.find((p) => p.id === meId);
    if (!me || !projectFn) return;
    for (const p of state.players || []) {
      if (p.id === meId || p.team === me.team) continue;
      const dist = Math.hypot(p.x - me.x, p.y - me.y);
      if (dist > NEARBY) continue;
      const proj = projectFn(p.x, p.y);
      if (!proj) continue;
      const edge = edgeIndicator(proj.ndcX, proj.ndcY, proj.behind, w, h);
      if (!edge) continue;
      drawArrow(ctx, edge.x, edge.y, edge.angle, COLORS[p.team], p.frozenUntil > now);
    }
  }

  return { draw, resize };
}

function drawArrow(ctx, x, y, angle, color, frozen) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-8, 9);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-8, -9);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = frozen ? 0.45 : 0.95;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}
