const COLORS = {
  red: "#E23B3B",
  blue: "#2F6FED",
  yellow: "#E0B000",
  pink: "#E85A9B",
};
const QUARTER_TINT = {
  red: "#f4b4b0",
  blue: "#b3c8f6",
  yellow: "#ead56a",
  pink: "#f0b5d1",
};
const GRASS_A = "#7bc45a";
const GRASS_B = "#6ab34c";
const CONE = "#E67A2A";
const FIELD = 1000;
const CENTER = 500;
const CONE_ZONE = 168;

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  let dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
  }
  resize();
  window.addEventListener("resize", resize);

  function frame(state, meId, now) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const pad = Math.max(18, Math.min(w, h) * 0.04);
    const size = Math.min(w, h) - pad * 2;
    const ox = (w - size) / 2;
    const oy = (h - size) / 2 + 10 * dpr;
    ctx.fillStyle = "#061027";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(ox, oy);
    const s = size / FIELD;
    ctx.scale(s, s);
    drawField();
    if (state) {
      drawStashes(state);
      const players = [...(state.players || [])].sort((a, b) => a.y - b.y);
      for (const p of players) drawPlayer(p, p.id === meId, state.now ?? now);
    }
    ctx.restore();
  }

  function drawField() {
    // Grass stripes
    for (let y = 0; y < FIELD; y += 28) {
      ctx.fillStyle = (y / 28) % 2 === 0 ? GRASS_A : GRASS_B;
      ctx.fillRect(0, y, FIELD, 28);
    }
    const quarters = [
      [0, 0, CENTER, CENTER, QUARTER_TINT.red],
      [CENTER, 0, CENTER, CENTER, QUARTER_TINT.blue],
      [0, CENTER, CENTER, CENTER, QUARTER_TINT.yellow],
      [CENTER, CENTER, CENTER, CENTER, QUARTER_TINT.pink],
    ];
    for (const [x, y, w, h, c] of quarters) {
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.38;
      ctx.fillRect(x, y, w, h);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 8;
    ctx.strokeRect(0, 0, FIELD, FIELD);
    ctx.beginPath();
    ctx.moveTo(CENTER, 0);
    ctx.lineTo(CENTER, FIELD);
    ctx.moveTo(0, CENTER);
    ctx.lineTo(FIELD, CENTER);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1a3a12";
    ctx.lineWidth = 3;
    ctx.stroke();

    labelQuarter("RED", 250, 250, COLORS.red);
    labelQuarter("BLUE", 750, 250, COLORS.blue);
    labelQuarter("YELLOW", 250, 750, COLORS.yellow);
    labelQuarter("PINK", 750, 750, COLORS.pink);
  }

  function labelQuarter(text, x, y, color) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = color;
    ctx.font = "800 54px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function stashRect(team) {
    if (team === "red") return { x: 0, y: 0 };
    if (team === "blue") return { x: FIELD - CONE_ZONE, y: 0 };
    if (team === "yellow") return { x: 0, y: FIELD - CONE_ZONE };
    return { x: FIELD - CONE_ZONE, y: FIELD - CONE_ZONE };
  }

  function drawStashes(state) {
    for (const team of ["red", "blue", "yellow", "pink"]) {
      const r = stashRect(team);
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(r.x + 6, r.y + 6, CONE_ZONE - 12, CONE_ZONE - 12);
      ctx.setLineDash([12, 8]);
      ctx.strokeStyle = CONE;
      ctx.lineWidth = 5;
      ctx.strokeRect(r.x + 6, r.y + 6, CONE_ZONE - 12, CONE_ZONE - 12);
      ctx.setLineDash([]);
      const corners = [
        [r.x + 10, r.y + 16, true],
        [r.x + CONE_ZONE - 10, r.y + 16, true],
        [r.x + 10, r.y + CONE_ZONE - 8, false],
        [r.x + CONE_ZONE - 10, r.y + CONE_ZONE - 8, false],
        [r.x + CONE_ZONE / 2, r.y + 16, true],
        [r.x + CONE_ZONE / 2, r.y + CONE_ZONE - 8, false],
      ];
      for (const [cx, cy, up] of corners) drawCone(cx, cy, up);

      const stash = state.stashes?.[team];
      if (stash) {
        let i = 0;
        for (const color of ["red", "blue", "yellow", "pink"]) {
          const n = stash.available[color] || 0;
          for (let k = 0; k < n; k++) {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const bx = r.x + 40 + col * 44;
            const by = r.y + 58 + row * 36;
            drawBag(bx, by, color);
            i += 1;
          }
        }
        const dep = stash.deposited || 0;
        for (let k = 0; k < dep; k++) {
          const bx = r.x + 28 + (k % 6) * 20;
          const by = r.y + CONE_ZONE - 28;
          drawBag(bx, by, team, 0.7);
        }
      }
      ctx.fillStyle = "rgba(20,30,20,0.7)";
      ctx.font = "700 16px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${team.toUpperCase()} STASH`, r.x + CONE_ZONE / 2, r.y + 36);
      ctx.restore();
    }
  }

  function drawCone(x, y, pointUp) {
    ctx.save();
    ctx.translate(x, y);
    if (!pointUp) ctx.scale(1, -1);
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(11, 10);
    ctx.lineTo(-11, 10);
    ctx.closePath();
    ctx.fillStyle = CONE;
    ctx.fill();
    ctx.strokeStyle = "#9a3d10";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#f4f4f4";
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(6, 0);
    ctx.lineTo(-6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#3a2416";
    ctx.fillRect(-12, 9, 24, 4);
    ctx.restore();
  }

  function drawBag(x, y, color, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    roundRect(-13, -7, 28, 22, 6);
    ctx.fill();
    ctx.fillStyle = COLORS[color];
    ctx.beginPath();
    roundRect(-15, -12, 28, 22, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, -2);
    ctx.lineTo(8, -2);
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 6);
    ctx.stroke();
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPlayer(p, isMe, now) {
    const frozen = (p.frozenUntil || 0) > now;
    const sit = frozen ? 1 : 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(0, 16, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    const facing = p.angle || 0;
    ctx.rotate(facing + Math.PI / 2);

    // legs
    ctx.fillStyle = "#2c3a6a";
    if (sit) {
      ctx.fillRect(-11, 8, 8, 8);
      ctx.fillRect(3, 8, 8, 8);
    } else {
      ctx.fillRect(-9, 6, 6, 14);
      ctx.fillRect(3, 6, 6, 14);
    }

    // body
    ctx.fillStyle = isMe ? "#fff6d8" : "#f3d2b5";
    ctx.beginPath();
    ctx.roundRect?.(-11, -10, 22, 22, 7);
    if (!ctx.roundRect) {
      ctx.rect(-11, -10, 22, 22);
    }
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // arms
    ctx.fillStyle = "#f3d2b5";
    ctx.fillRect(-18, -6, 8, 6);
    ctx.fillRect(10, -6, 8, 6);
    // arm bands
    ctx.fillStyle = COLORS[p.team];
    ctx.fillRect(-18, -3, 8, 5);
    ctx.fillRect(10, -3, 8, 5);

    // carried bag
    if (p.carrying) {
      ctx.save();
      ctx.translate(0, -2);
      ctx.rotate(-0.3);
      drawBag(16, 8, p.carrying.color, 0.85);
      ctx.restore();
    }

    // head
    ctx.beginPath();
    ctx.arc(0, -20, 11, 0, Math.PI * 2);
    ctx.fillStyle = "#f3d2b5";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.stroke();
    // hair
    ctx.fillStyle = hairColor(p.id);
    ctx.beginPath();
    ctx.arc(0, -24, 9, Math.PI, 0);
    ctx.fill();
    // eyes
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(-3.5, -20, 1.4, 0, Math.PI * 2);
    ctx.arc(3.5, -20, 1.4, 0, Math.PI * 2);
    ctx.fill();
    // smile or worried if frozen
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (sit) {
      ctx.arc(0, -16.5, 3, 0.15 * Math.PI, 0.85 * Math.PI, true);
    } else {
      ctx.arc(0, -18, 3.2, 0.15 * Math.PI, 0.85 * Math.PI);
    }
    ctx.stroke();

    ctx.rotate(-(facing + Math.PI / 2));

    // name
    ctx.fillStyle = isMe ? "#fff" : "rgba(20,30,20,0.8)";
    ctx.font = "700 11px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const label = p.isBot ? `${p.name}` : p.name;
    ctx.fillText(label, 0, -36);
    if (isMe) {
      ctx.fillStyle = COLORS[p.team];
      ctx.fillText("YOU", 0, -47);
    }
    if (frozen) {
      const left = Math.max(0, p.frozenUntil - now);
      ctx.fillStyle = "#1a1303";
      ctx.font = "800 13px Trebuchet MS, sans-serif";
      ctx.fillText(`${left.toFixed(1)}s`, 0, 32);
    }
    ctx.restore();
  }

  function hairColor(id) {
    const pal = ["#2b1b12", "#6a3b16", "#c47a2c", "#1d3557", "#4a2a5a", "#3d3d3d"];
    let n = 0;
    for (const ch of String(id)) n = (n + ch.charCodeAt(0)) % pal.length;
    return pal[n];
  }

  function project(fieldX, fieldY) {
    const w = canvas.width;
    const h = canvas.height;
    const pad = Math.max(18, Math.min(w, h) * 0.04);
    const size = Math.min(w, h) - pad * 2;
    const ox = (w - size) / 2;
    const oy = (h - size) / 2 + 10 * dpr;
    const s = size / FIELD;
    const cssW = canvas.clientWidth || window.innerWidth || 1;
    const cssH = canvas.clientHeight || window.innerHeight || 1;
    const x = (ox + fieldX * s) / dpr;
    const y = (oy + fieldY * s) / dpr;
    return {
      x,
      y,
      ndcX: (x / cssW) * 2 - 1,
      ndcY: 1 - (y / cssH) * 2,
      behind: false,
    };
  }

  return { frame, resize, project, is3d: false };
}
