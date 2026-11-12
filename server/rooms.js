import { WebSocket } from "ws";
import { CODE_CHARS, TEAMS, TICK_DT, TICK_HZ } from "../shared/constants.js";
import { Game, freshId } from "./game.js";

const rooms = new Map();
const publicWaiting = new Set();

export function generateCode() {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return freshId("R").slice(-4).toUpperCase();
}

export function listPublic() {
  return [...publicWaiting]
    .map((c) => rooms.get(c))
    .filter((r) => r && r.phase === "lobby")
    .map((r) => ({
      code: r.code,
      openSeats: r.openSeats(),
      teamSize: r.game.settings.teamSize,
    }));
}

export function getRoom(code) {
  return rooms.get(String(code || "").trim().toUpperCase()) || null;
}

export class Room {
  constructor({ hostName, teamSize, matchSeconds, difficulty, visibility, hostTeam }) {
    this.code = generateCode();
    this.visibility = visibility === "public" ? "public" : "private";
    this.phase = "lobby";
    this.hostId = null;
    this.clients = new Map(); // playerId -> { ws, token, lastInput }
    this.game = new Game({ teamSize, matchSeconds, difficulty });
    this.createdAt = Date.now();
    this.tickTimer = null;
    this.pendingBots = new Map(); // playerId -> timeout for bot takeover
    this.autoStartAt = visibility === "public" ? Date.now() + 20000 : null;
    const team = TEAMS.includes(hostTeam) ? hostTeam : "red";
    rooms.set(this.code, this);
    if (this.visibility === "public") publicWaiting.add(this.code);
    this.hostName = hostName;
    this.preferredHostTeam = team;
  }

  openSeats() {
    return Object.values(this.game.seatsNeeded()).reduce((a, b) => a + b, 0);
  }

  hasHuman() {
    return [...this.clients.values()].some((c) => c.ws && c.ws.readyState === WebSocket.OPEN);
  }

  lobbySnapshot() {
    const seats = {};
    for (const team of TEAMS) {
      seats[team] = this.game.players
        .filter((p) => p.team === team && !p.isBot)
        .map((p) => ({ id: p.id, name: p.name, ready: this.clients.get(p.id)?.ready || false }));
    }
    return {
      type: "roomUpdate",
      code: this.code,
      phase: this.phase,
      visibility: this.visibility,
      hostId: this.hostId,
      settings: this.game.settings,
      seats,
      openSeats: this.openSeats(),
      autoStartAt: this.autoStartAt,
    };
  }

  broadcast(msg, exceptId = null) {
    const data = JSON.stringify(msg);
    for (const [id, c] of this.clients) {
      if (id === exceptId) continue;
      if (c.ws && c.ws.readyState === WebSocket.OPEN) {
        try {
          c.ws.send(data);
        } catch {
          // ignore a broken socket; heartbeat will drop it
        }
      }
    }
  }

  send(playerId, msg) {
    const c = this.clients.get(playerId);
    if (c?.ws && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(JSON.stringify(msg));
    }
  }

  addHuman({ ws, name, team, token }) {
    if (this.phase !== "lobby") return { error: "This match has already started." };
    let chosen = TEAMS.includes(team) ? team : null;
    if (!chosen) {
      chosen = this.preferredHostTeam && this.game.players.filter((p) => p.team === this.preferredHostTeam).length < this.game.settings.teamSize
        ? this.preferredHostTeam
        : TEAMS.find((t) => this.game.players.filter((p) => p.team === t).length < this.game.settings.teamSize);
    }
    if (!chosen || this.game.players.filter((p) => p.team === chosen).length >= this.game.settings.teamSize) {
      // try any open seat
      chosen = TEAMS.find((t) => this.game.players.filter((p) => p.team === t).length < this.game.settings.teamSize);
    }
    if (!chosen) return { error: "This room is full." };
    const player = this.game.addPlayer({ name, team: chosen, isBot: false });
    if (!player) return { error: "Could not join that team." };
    if (!this.hostId) this.hostId = player.id;
    this.clients.set(player.id, { ws, token: token || freshId("t"), ready: false, name: player.name });
    this.preferredHostTeam = null;
    this.broadcast(this.lobbySnapshot());
    return { player, token: this.clients.get(player.id).token };
  }

  switchTeam(playerId, team) {
    if (this.phase !== "lobby") return { error: "The match already started." };
    if (!TEAMS.includes(team)) return { error: "Unknown team." };
    const p = this.game.players.find((x) => x.id === playerId);
    if (!p || p.isBot) return { error: "Cannot move that player." };
    if (p.team === team) return { ok: true };
    const count = this.game.players.filter((x) => x.team === team && !x.isBot).length;
    if (count >= this.game.settings.teamSize) return { error: "That team is full." };
    p.team = team;
    this.broadcast(this.lobbySnapshot());
    return { ok: true };
  }

  setReady(playerId, ready) {
    const c = this.clients.get(playerId);
    if (c) c.ready = Boolean(ready);
    this.broadcast(this.lobbySnapshot());
  }

  startFromHost(playerId) {
    if (playerId !== this.hostId) return { error: "Only the room host can start the match." };
    return this.beginMatch();
  }

  beginMatch() {
    if (this.phase !== "lobby") return { error: "Already started." };
    this.game.start();
    this.phase = "playing";
    publicWaiting.delete(this.code);
    this.autoStartAt = null;
    const state = this.game.getState();
    this.broadcast({ type: "gameStart", code: this.code, hostId: this.hostId, state });
    this.startLoop();
    return { ok: true };
  }

  startLoop() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    const interval = 1000 / TICK_HZ;
    this.tickTimer = setInterval(() => {
      try {
        const state = this.game.tick(TICK_DT);
        this.broadcast({ type: "state", state });
        if (this.game.phase === "over") {
          this.phase = "over";
          this.broadcast({ type: "gameOver", result: this.game.winner, state: this.game.getState() });
          this.stopLoop();
        }
      } catch (err) {
        console.error("tick error", err);
      }
    }, interval);
  }

  stopLoop() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  handleInput(playerId, input) {
    if (this.phase !== "playing") return;
    this.game.setInput(playerId, input);
  }

  disconnect(playerId) {
    const c = this.clients.get(playerId);
    if (c) c.ws = null;
    if (this.phase === "lobby") {
      this.game.players = this.game.players.filter((p) => p.id !== playerId);
      this.clients.delete(playerId);
      if (this.hostId === playerId) {
        const next = [...this.clients.keys()][0] || null;
        this.hostId = next;
      }
      if (!this.hasHuman()) {
        this.destroy();
        return;
      }
      this.broadcast(this.lobbySnapshot());
      return;
    }
    if (this.phase === "playing") {
      if (this.pendingBots.has(playerId)) clearTimeout(this.pendingBots.get(playerId));
      const t = setTimeout(() => {
        this.pendingBots.delete(playerId);
        if (this.phase === "playing") this.game.replaceWithBot(playerId);
      }, 3000);
      this.pendingBots.set(playerId, t);
      if (this.hostId === playerId) {
        const next = [...this.clients.entries()].find(
          ([id, cl]) => id !== playerId && cl.ws && cl.ws.readyState === WebSocket.OPEN
        );
        if (next) this.hostId = next[0];
      }
    }
  }

  reconnect({ ws, token }) {
    for (const [id, c] of this.clients) {
      if (c.token === token) {
        if (this.pendingBots.has(id)) {
          clearTimeout(this.pendingBots.get(id));
          this.pendingBots.delete(id);
        }
        c.ws = ws;
        this.game.reclaim(id);
        if (this.phase === "lobby") {
          this.send(id, { ...this.lobbySnapshot(), type: "welcome", playerId: id, token });
        } else {
          this.send(id, {
            type: "rejoined",
            playerId: id,
            token,
            code: this.code,
            hostId: this.hostId,
            state: this.game.getState(),
          });
        }
        return id;
      }
    }
    return null;
  }

  destroy() {
    this.stopLoop();
    publicWaiting.delete(this.code);
    rooms.delete(this.code);
    for (const t of this.pendingBots.values()) clearTimeout(t);
    this.pendingBots.clear();
  }
}

export function createRoom(opts) {
  return new Room(opts);
}

export function findPublicRoom() {
  for (const code of publicWaiting) {
    const room = rooms.get(code);
    if (room && room.phase === "lobby" && room.openSeats() > 0) return room;
  }
  return null;
}

export function maybeAutoStartPublic() {
  const now = Date.now();
  for (const code of [...publicWaiting]) {
    const room = rooms.get(code);
    if (!room || room.phase !== "lobby" || !room.autoStartAt) continue;
    if (now >= room.autoStartAt) room.beginMatch();
  }
}

export const autoStartTimer = setInterval(maybeAutoStartPublic, 1000);
if (typeof autoStartTimer.unref === "function") autoStartTimer.unref();

export function resetAllRooms() {
  for (const room of rooms.values()) room.destroy();
  rooms.clear();
  publicWaiting.clear();
}

export { rooms };
