import {
  TEAMS,
  TICK_DT,
  PLAYER_SPEED,
  DEFAULT_MATCH_SECONDS,
} from "../shared/constants.js";
import {
  initialStashes,
  initialScores,
  spawnPoint,
  movePlayer,
  updateGraceAfterMove,
  canPickupFromStash,
  applyPickup,
  shouldAutoDeposit,
  applyDeposit,
  canTag,
  applyTag,
  canRescue,
  applyRescue,
  determineWinner,
  bagsAreConserved,
  isFrozen,
} from "../shared/rules.js";
import { think, defaultBotRoles, botSpeed } from "./ai.js";

let nextId = 1;
export function freshId(prefix = "p") {
  nextId += 1;
  return `${prefix}${nextId.toString(36)}`;
}

export class Game {
  constructor(settings = {}) {
    this.settings = {
      teamSize: settings.teamSize === 3 ? 3 : 2,
      matchSeconds: [600, 900, 1200].includes(settings.matchSeconds)
        ? settings.matchSeconds
        : DEFAULT_MATCH_SECONDS,
      difficulty: ["easy", "normal", "hard"].includes(settings.difficulty)
        ? settings.difficulty
        : "normal",
    };
    this.players = [];
    this.stashes = initialStashes();
    this.scores = initialScores();
    this.timeLeft = this.settings.matchSeconds;
    this.gameTime = 0;
    this.phase = "lobby";
    this.winner = null;
    this.events = [];
    this.now = 0;
  }

  addPlayer({ id, name, team, isBot = false, role = null, difficulty = null }) {
    if (this.phase !== "lobby") return null;
    if (!TEAMS.includes(team)) return null;
    const onTeam = this.players.filter((p) => p.team === team);
    if (onTeam.length >= this.settings.teamSize) return null;
    const slot = onTeam.length;
    const spawn = spawnPoint(team, slot);
    const diff = difficulty || this.settings.difficulty;
    const player = {
      id: id || freshId("p"),
      name: sanitizeName(name, isBot, team, slot),
      team,
      isBot: Boolean(isBot),
      role: isBot ? role : role,
      difficulty: isBot ? diff : null,
      x: spawn.x,
      y: spawn.y,
      angle: spawn.angle,
      vx: 0,
      vy: 0,
      speed: isBot ? botSpeed(diff) : PLAYER_SPEED,
      frozenUntil: 0,
      graceUntil: 0,
      inConeTeam: null,
      carrying: null,
      input: { dx: 0, dy: 0 },
      wanderOff: Math.random() * 20,
      connected: true,
    };
    this.players.push(player);
    return player;
  }

  seatsNeeded() {
    const need = {};
    for (const team of TEAMS) {
      const have = this.players.filter((p) => p.team === team).length;
      need[team] = Math.max(0, this.settings.teamSize - have);
    }
    return need;
  }

  fillBots() {
    const need = this.seatsNeeded();
    for (const team of TEAMS) {
      const existing = this.players.filter((p) => p.team === team);
      const humans = existing.filter((p) => !p.isBot);
      const alreadyBots = existing.filter((p) => p.isBot);
      const toAdd = need[team];
      const roles = defaultBotRoles(this.settings.teamSize, alreadyBots.length + toAdd);
      // Assign roles to existing bots first if they lack one.
      alreadyBots.forEach((b, i) => {
        if (!b.role) b.role = roles[i];
      });
      const startRole = alreadyBots.length;
      for (let i = 0; i < toAdd; i++) {
        const role = roles[startRole + i] || "runner";
        const n = existing.length + i + 1;
        this.addPlayer({
          name: `${cap(team)} ${cap(role)}`,
          team,
          isBot: true,
          role,
          difficulty: this.settings.difficulty,
        });
        void humans;
        void n;
      }
    }
  }

  start() {
    if (this.phase !== "lobby") return false;
    this.fillBots();
    // Re-place everyone at spawn in case they sat in the lobby.
    const counts = { red: 0, blue: 0, yellow: 0, pink: 0 };
    for (const p of this.players) {
      const slot = counts[p.team]++;
      const s = spawnPoint(p.team, slot);
      p.x = s.x;
      p.y = s.y;
      p.angle = s.angle;
      p.carrying = null;
      p.frozenUntil = 0;
      p.graceUntil = 0;
      p.inConeTeam = null;
      p.input = { dx: 0, dy: 0 };
    }
    this.stashes = initialStashes();
    this.scores = initialScores();
    this.timeLeft = this.settings.matchSeconds;
    this.gameTime = 0;
    this.now = 0;
    this.winner = null;
    this.phase = "playing";
    this.events = [{ type: "start" }];
    return true;
  }

  setInput(playerId, input) {
    const p = this.players.find((x) => x.id === playerId);
    if (!p || p.isBot) return;
    const dx = clampNum(input?.dx, -1, 1);
    const dy = clampNum(input?.dy, -1, 1);
    p.input = { dx, dy };
  }

  replaceWithBot(playerId) {
    const p = this.players.find((x) => x.id === playerId);
    if (!p || p.isBot) return;
    p.isBot = true;
    p.connected = false;
    p.role = p.role || "runner";
    p.difficulty = this.settings.difficulty;
    p.speed = botSpeed(p.difficulty);
    p.name = p.name.endsWith("(AI)") ? p.name : `${p.name} (AI)`;
  }

  reclaim(playerId) {
    const p = this.players.find((x) => x.id === playerId);
    if (!p) return null;
    p.isBot = false;
    p.connected = true;
    p.speed = PLAYER_SPEED;
    p.input = { dx: 0, dy: 0 };
    p.name = p.name.replace(/ \(AI\)$/, "");
    return p;
  }

  tick(dt = TICK_DT) {
    this.events = [];
    if (this.phase !== "playing") return this.getState();

    this.now += dt;
    this.gameTime += dt;
    this.timeLeft = Math.max(0, this.timeLeft - dt);

    for (const p of this.players) {
      if (p.isBot) p.input = think(p, this, this.now);
      movePlayer(p, dt, this.now);
      updateGraceAfterMove(p, this.now);
    }

    this.resolveDeposits();
    this.resolvePickups();
    this.resolveTags();
    this.resolveRescues();

    const result = determineWinner(this.scores, this.timeLeft);
    if (result) {
      this.winner = result;
      this.phase = "over";
      this.events.push({ type: "gameover", result });
    }
    return this.getState();
  }

  resolveDeposits() {
    for (const p of this.players) {
      if (shouldAutoDeposit(p)) {
        const count = applyDeposit(p, this.scores, this.stashes, this.gameTime);
        this.events.push({ type: "deposit", playerId: p.id, team: p.team, count });
      }
    }
  }

  resolvePickups() {
    for (const p of this.players) {
      if (p.carrying || isFrozen(p, this.now)) continue;
      for (const team of TEAMS) {
        if (canPickupFromStash(p, team, this.stashes, this.now)) {
          applyPickup(p, team, this.stashes);
          this.events.push({ type: "pickup", playerId: p.id, team: p.team, origin: team });
          break;
        }
      }
    }
  }

  resolveTags() {
    const tagged = new Set();
    for (const tagger of this.players) {
      if (isFrozen(tagger, this.now)) continue;
      for (const target of this.players) {
        if (tagged.has(target.id)) continue;
        if (canTag(tagger, target, this.now)) {
          const returned = applyTag(target, this.stashes, this.now);
          tagged.add(target.id);
          this.events.push({
            type: "tag",
            taggerId: tagger.id,
            targetId: target.id,
            returned,
          });
        }
      }
    }
  }

  resolveRescues() {
    const freed = new Set();
    for (const rescuer of this.players) {
      if (isFrozen(rescuer, this.now)) continue;
      for (const target of this.players) {
        if (freed.has(target.id)) continue;
        if (canRescue(rescuer, target, this.now)) {
          applyRescue(target);
          freed.add(target.id);
          this.events.push({ type: "rescue", rescuerId: rescuer.id, targetId: target.id });
        }
      }
    }
  }

  getState() {
    return {
      phase: this.phase,
      timeLeft: this.timeLeft,
      gameTime: this.gameTime,
      settings: this.settings,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        isBot: p.isBot,
        role: p.role,
        x: p.x,
        y: p.y,
        angle: p.angle,
        frozenUntil: p.frozenUntil,
        graceUntil: p.graceUntil,
        carrying: p.carrying,
        connected: p.connected,
      })),
      stashes: this.stashes,
      scores: this.scores,
      winner: this.winner,
      events: this.events,
      now: this.now,
      conserved: bagsAreConserved(this.stashes, this.players),
    };
  }

  /** Run until the match ends (win or timeout). Used by tests. */
  runUntilOver(maxTicks = 20000) {
    if (this.phase === "lobby") this.start();
    let ticks = 0;
    while (this.phase === "playing" && ticks < maxTicks) {
      this.tick(TICK_DT);
      ticks += 1;
    }
    return { ticks, state: this.getState() };
  }
}

function sanitizeName(name, isBot, team, slot) {
  const cleaned = String(name || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16);
  if (cleaned) return cleaned;
  return isBot ? `${cap(team)} Bot ${slot + 1}` : "Player";
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function clampNum(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(lo, Math.min(hi, n));
}
