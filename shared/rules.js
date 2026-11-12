import {
  TEAMS,
  TEAM_LAYOUT,
  CENTER,
  CONE_ZONE,
  FIELD_SIZE,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  TAG_RANGE,
  PICKUP_RANGE,
  FREEZE_DURATION,
  GRACE_DURATION,
  STARTING_AVAILABLE,
} from "./constants.js";

export function initialStashes() {
  const stashes = {};
  for (const team of TEAMS) {
    stashes[team] = {
      available: { ...STARTING_AVAILABLE[team] },
      deposited: 0,
    };
  }
  return stashes;
}

export function initialScores() {
  const scores = {};
  for (const team of TEAMS) {
    scores[team] = { deposited: 0, reachedAt: {} };
  }
  return scores;
}

/** Which team's quarter contains (x, y). The center is just where quarters meet. */
export function getQuarter(x, y) {
  const left = x < CENTER;
  const top = y < CENTER;
  if (left && top) return "red";
  if (!left && top) return "blue";
  if (left && !top) return "yellow";
  return "pink";
}

export function coneRect(team) {
  const t = TEAM_LAYOUT[team];
  return { x: t.stashX, y: t.stashY, w: CONE_ZONE, h: CONE_ZONE };
}

export function isInConeZone(x, y, team) {
  const r = coneRect(team);
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function coneTeamAt(x, y) {
  for (const team of TEAMS) {
    if (isInConeZone(x, y, team)) return team;
  }
  return null;
}

export function coneCenter(team) {
  const r = coneRect(team);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Point just outside the cone zone, toward the field center, plus a slot offset. */
export function spawnPoint(team, slot = 0) {
  const r = coneRect(team);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = CENTER - cx;
  const dy = CENTER - cy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const outward = CONE_ZONE / 2 + PLAYER_RADIUS + 22;
  const side = (slot - 1) * 44;
  return {
    x: clamp(cx + ux * outward + px * side, PLAYER_RADIUS + 2, FIELD_SIZE - PLAYER_RADIUS - 2),
    y: clamp(cy + uy * outward + py * side, PLAYER_RADIUS + 2, FIELD_SIZE - PLAYER_RADIUS - 2),
    angle: Math.atan2(CENTER - (cy + uy * outward), CENTER - (cx + ux * outward)),
  };
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function isFrozen(player, now) {
  return player.frozenUntil > now;
}

export function isInGrace(player, now) {
  return player.graceUntil > now;
}

/**
 * A player can only be tagged when they are in a rival quarter,
 * outside any cone zone, and not in the 1.5s exit grace.
 * Players are always safe in their own quarter.
 */
export function canBeTagged(player, now) {
  if (isFrozen(player, now)) return false;
  if (coneTeamAt(player.x, player.y)) return false;
  if (isInGrace(player, now)) return false;
  if (getQuarter(player.x, player.y) === player.team) return false;
  return true;
}

/**
 * Only the home team of a quarter may tag, and only visitors in that quarter.
 * Guarding inside your own cones is allowed, but a visitor cannot be tagged
 * until they have left the cones (and their grace has expired).
 */
export function canTag(tagger, target, now) {
  if (!tagger || !target) return false;
  if (tagger.id === target.id) return false;
  if (tagger.team === target.team) return false;
  if (isFrozen(tagger, now)) return false;
  if (getQuarter(target.x, target.y) !== tagger.team) return false;
  if (!canBeTagged(target, now)) return false;
  return dist(tagger.x, tagger.y, target.x, target.y) <= TAG_RANGE;
}

export function canRescue(rescuer, target, now) {
  if (!rescuer || !target) return false;
  if (rescuer.id === target.id) return false;
  if (rescuer.team !== target.team) return false;
  if (isFrozen(rescuer, now)) return false;
  if (!isFrozen(target, now)) return false;
  return dist(rescuer.x, rescuer.y, target.x, target.y) <= TAG_RANGE;
}

export function canPickupFromStash(player, stashTeam, stashes, now) {
  if (!player || !stashes?.[stashTeam]) return false;
  if (isFrozen(player, now)) return false;
  if (player.carrying) return false;
  const available = stashes[stashTeam].available[player.team] || 0;
  if (available <= 0) return false;
  if (!isInConeZone(player.x, player.y, stashTeam) &&
      dist(player.x, player.y, coneCenter(stashTeam).x, coneCenter(stashTeam).y) > PICKUP_RANGE + CONE_ZONE / 2) {
    return false;
  }
  if (!isInConeZone(player.x, player.y, stashTeam)) return false;
  return true;
}

export function shouldAutoDeposit(player) {
  return Boolean(player.carrying && isInConeZone(player.x, player.y, player.team));
}

export function applyPickup(player, stashTeam, stashes) {
  const color = player.team;
  stashes[stashTeam].available[color] -= 1;
  player.carrying = { color, origin: stashTeam };
  return player.carrying;
}

export function applyDeposit(player, scores, stashes, gameTime) {
  if (!player.carrying) return null;
  const team = player.team;
  player.carrying = null;
  stashes[team].deposited += 1;
  scores[team].deposited += 1;
  const count = scores[team].deposited;
  if (scores[team].reachedAt[count] == null) {
    scores[team].reachedAt[count] = gameTime;
  }
  return count;
}

/** Tagged carrier's bag returns to the stash it was taken from. */
export function applyTag(target, stashes, now) {
  const returned = target.carrying ? { ...target.carrying } : null;
  if (target.carrying) {
    const { color, origin } = target.carrying;
    stashes[origin].available[color] += 1;
    target.carrying = null;
  }
  target.frozenUntil = now + FREEZE_DURATION;
  target.vx = 0;
  target.vy = 0;
  return returned;
}

export function applyRescue(target) {
  target.frozenUntil = 0;
}

export function updateGraceAfterMove(player, now) {
  const nowCone = coneTeamAt(player.x, player.y);
  const prevCone = player.inConeTeam ?? null;
  if (prevCone && prevCone !== player.team && nowCone !== prevCone) {
    player.graceUntil = now + GRACE_DURATION;
  }
  player.inConeTeam = nowCone;
  return nowCone;
}

export function movePlayer(player, dt, now) {
  if (isFrozen(player, now)) {
    player.vx = 0;
    player.vy = 0;
    return;
  }
  const dx = player.input?.dx || 0;
  const dy = player.input?.dy || 0;
  const mag = Math.hypot(dx, dy);
  let vx = 0;
  let vy = 0;
  if (mag > 0.01) {
    const speed = (player.speed ?? PLAYER_SPEED);
    vx = (dx / mag) * speed;
    vy = (dy / mag) * speed;
    player.angle = Math.atan2(vy, vx);
  }
  player.vx = vx;
  player.vy = vy;
  player.x = clamp(player.x + vx * dt, PLAYER_RADIUS, FIELD_SIZE - PLAYER_RADIUS);
  player.y = clamp(player.y + vy * dt, PLAYER_RADIUS, FIELD_SIZE - PLAYER_RADIUS);
}

/**
 * Winner rules:
 *  - First team to deposit all 6 own-color bags wins immediately.
 *  - On timeout: most own-color bags, then who reached that count first, then a shared win.
 */
export function determineWinner(scores, timeLeft) {
  const withSix = TEAMS.filter((t) => scores[t].deposited >= 6);
  if (withSix.length === 1) {
    return { type: "win", teams: withSix, reason: "collected-all" };
  }
  if (withSix.length > 1) {
    return pickByFirstToCount(scores, 6, withSix);
  }
  if (timeLeft > 0) return null;
  const max = Math.max(...TEAMS.map((t) => scores[t].deposited));
  const tied = TEAMS.filter((t) => scores[t].deposited === max);
  if (tied.length === 1) {
    return { type: "win", teams: tied, reason: "timeout-most-bags" };
  }
  return pickByFirstToCount(scores, max, tied);
}

function pickByFirstToCount(scores, count, teams) {
  if (count <= 0) {
    return { type: "shared", teams, reason: "timeout-tie" };
  }
  let best = Infinity;
  for (const t of teams) {
    const at = scores[t].reachedAt[count];
    if (at == null) {
      best = Infinity;
      break;
    }
    if (at < best) best = at;
  }
  if (!Number.isFinite(best)) {
    return { type: "shared", teams, reason: "timeout-tie" };
  }
  const first = teams.filter((t) => scores[t].reachedAt[count] === best);
  if (first.length === 1) {
    return { type: "win", teams: first, reason: "timeout-first-to-count" };
  }
  return { type: "shared", teams: first, reason: "timeout-tie" };
}

/** Invariant: each color has exactly 6 bags, in stashes, carried, or deposited. */
export function countBagsOfColor(color, stashes, players) {
  let n = stashes[color]?.deposited || 0;
  for (const team of TEAMS) {
    n += stashes[team]?.available[color] || 0;
  }
  for (const p of players) {
    if (p.carrying && p.carrying.color === color) n += 1;
  }
  return n;
}

export function bagsAreConserved(stashes, players) {
  return TEAMS.every((color) => countBagsOfColor(color, stashes, players) === 6);
}
