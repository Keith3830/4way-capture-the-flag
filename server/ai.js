import {
  TEAMS,
  BOT_SPEED,
  PLAYER_SPEED,
  TAG_RANGE,
  TEAM_LAYOUT,
  CONE_ZONE,
  CENTER,
} from "../shared/constants.js";
import {
  coneCenter,
  coneRect,
  canTag,
  canRescue,
  dist,
  getQuarter,
  isFrozen,
  isInConeZone,
} from "../shared/rules.js";

export function assignRoles(humansAndBotsByTeam, teamSize) {
  const used = new Set(humansAndBotsByTeam.filter((p) => p.role).map((p) => p.role));
  const preferred = teamSize >= 3 ? ["guard", "runner", "rescuer"] : ["guard", "runner"];
  const result = [];
  for (const p of humansAndBotsByTeam) {
    if (p.role) {
      result.push(p.role);
      continue;
    }
    const next = preferred.find((r) => !used.has(r)) || "runner";
    used.add(next);
    result.push(next);
  }
  return result;
}

export function defaultBotRoles(teamSize, botCount) {
  const preferred = teamSize >= 3 ? ["guard", "runner", "rescuer"] : ["guard", "runner"];
  const roles = [];
  for (let i = 0; i < botCount; i++) roles.push(preferred[i % preferred.length]);
  // If a team is all bots, ensure at least one guard and one runner.
  if (botCount >= 2 && !roles.includes("guard")) roles[0] = "guard";
  if (botCount >= 2 && !roles.includes("runner")) roles[1] = "runner";
  return roles;
}

export function botSpeed(difficulty) {
  return PLAYER_SPEED * (BOT_SPEED[difficulty] || BOT_SPEED.normal);
}

/**
 * Choose a movement direction for a bot this tick. Returns {dx, dy}.
 */
export function think(bot, game, now) {
  if (isFrozen(bot, now)) return { dx: 0, dy: 0 };

  const role = bot.role || "runner";
  if (role === "rescuer") {
    const frozenPal = nearestFrozenTeammate(bot, game.players, now);
    if (frozenPal) return steerToward(bot, frozenPal.x, frozenPal.y);
    return runnerThink(bot, game, now);
  }
  if (role === "guard") return guardThink(bot, game, now);
  return runnerThink(bot, game, now);
}

function nearestFrozenTeammate(bot, players, now) {
  let best = null;
  let bestD = Infinity;
  for (const p of players) {
    if (p.id === bot.id || p.team !== bot.team) continue;
    if (!isFrozen(p, now)) continue;
    const d = dist(bot.x, bot.y, p.x, p.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function guardThink(bot, game, now) {
  const visitors = game.players.filter(
    (p) => p.team !== bot.team && getQuarter(p.x, p.y) === bot.team && !isFrozen(p, now)
  );
  // Chase a visitable (taggable or almost taggable) rival.
  let target = null;
  let best = Infinity;
  for (const v of visitors) {
    const d = dist(bot.x, bot.y, v.x, v.y);
    if (canTag(bot, v, now) || d < best) {
      if (d < best) {
        best = d;
        target = v;
      }
    }
  }
  if (target) {
    // If they are still in cones or in grace, wait near the exit closest to them.
    if (isInConeZone(target.x, target.y, bot.team) || target.graceUntil > now) {
      const wait = exitWaitPoint(bot.team, target);
      return steerToward(bot, wait.x, wait.y);
    }
    return steerToward(bot, target.x, target.y);
  }
  const post = exitWaitPoint(bot.team, null);
  return steerToward(bot, post.x, post.y);
}

function runnerThink(bot, game, now) {
  if (bot.carrying) {
    const home = coneCenter(bot.team);
    return steerToward(bot, home.x, home.y, game, now);
  }
  const stash = chooseTargetStash(bot, game.stashes);
  if (!stash) {
    const frozenPal = nearestFrozenTeammate(bot, game.players, now);
    if (frozenPal) return steerToward(bot, frozenPal.x, frozenPal.y);
    const post = exitWaitPoint(bot.team, null);
    return steerToward(bot, post.x, post.y);
  }
  const c = coneCenter(stash);
  // Aim slightly into the stash so pickup triggers reliably.
  return steerToward(bot, c.x, c.y, game, now);
}

function chooseTargetStash(bot, stashes) {
  let best = null;
  let bestD = Infinity;
  for (const team of TEAMS) {
    if (team === bot.team) continue;
    const n = stashes[team].available[bot.team] || 0;
    if (n <= 0) continue;
    const c = coneCenter(team);
    const d = dist(bot.x, bot.y, c.x, c.y);
    if (d < bestD) {
      bestD = d;
      best = team;
    }
  }
  return best;
}

/** A post just outside (or at the lip of) the home cone zone, toward center / a visitor. */
function exitWaitPoint(team, visitor) {
  const r = coneRect(team);
  const lipX = r.x < CENTER ? r.x + r.w + 10 : r.x - 10;
  const lipY = r.y < CENTER ? r.y + r.h + 10 : r.y - 10;
  if (!visitor) return { x: lipX, y: lipY };
  // Bias the wait point toward the visitor's current position.
  const towardX = visitor.x < r.x ? r.x + 8 : visitor.x > r.x + r.w ? r.x + r.w - 8 : visitor.x;
  const towardY = visitor.y < r.y ? r.y + 8 : visitor.y > r.y + r.h ? r.y + r.h - 8 : visitor.y;
  // Stand just outside the side they're leaving toward.
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = (visitor.x - cx) || 1;
  const dy = (visitor.y - cy) || 1;
  const leavingRight = visitor.x >= cx;
  const leavingDown = visitor.y >= cy;
  const x = leavingRight ? r.x + r.w + 12 : r.x - 12;
  const y = leavingDown ? r.y + r.h + 12 : r.y - 12;
  return { x: (x + lipX) / 2, y: (y + lipY) / 2, towardX, towardY };
}

function steerToward(bot, tx, ty, game, now) {
  let dx = tx - bot.x;
  let dy = ty - bot.y;
  // Hard bots veer slightly away from enemy defenders while carrying or entering a rival quarter.
  if (bot.difficulty === "hard" && game) {
    const avoid = nearestThreat(bot, game.players, now);
    if (avoid) {
      const d = dist(bot.x, bot.y, avoid.x, avoid.y);
      if (d < TAG_RANGE * 3 && d > 1) {
        dx += ((bot.x - avoid.x) / d) * 80;
        dy += ((bot.y - avoid.y) / d) * 80;
      }
    }
  }
  // Easy bots add a little wander so they are less clinical.
  if (bot.difficulty === "easy") {
    const t = (now + bot.wanderOff) * 1.1;
    dx += Math.sin(t) * 40;
    dy += Math.cos(t * 0.9) * 40;
  }
  const mag = Math.hypot(dx, dy);
  if (mag < 4) return { dx: 0, dy: 0 };
  return { dx: dx / mag, dy: dy / mag };
}

function nearestThreat(bot, players, now) {
  const q = getQuarter(bot.x, bot.y);
  if (q === bot.team) return null;
  let best = null;
  let bestD = Infinity;
  for (const p of players) {
    if (p.team !== q) continue;
    if (isFrozen(p, now)) continue;
    const d = dist(bot.x, bot.y, p.x, p.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

// Silence unused layout import warning if bundlers care; used via coneRect.
void TEAM_LAYOUT;
void CONE_ZONE;
