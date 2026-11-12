import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { WebSocket } from "ws";
import { closeServer, server } from "../server/index.js";
import { resetAllRooms } from "../server/rooms.js";

function listen() {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function connect(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const inbox = [];
  const waiters = [];
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    inbox.push(msg);
    for (let i = 0; i < waiters.length; i++) {
      if (waiters[i].match(msg)) {
        const w = waiters.splice(i, 1)[0];
        w.resolve(msg);
        break;
      }
    }
  });
  const open = new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
  function waitFor(match, ms = 4000) {
    const fn = typeof match === "function" ? match : (m) => m.type === match;
    const queued = inbox.find(fn);
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        const types = inbox.map((m) => m.type).join(", ") || "(none)";
        reject(new Error(`timed out waiting; seen: ${types}`));
      }, ms);
      waiters.push({
        match: fn,
        resolve: (msg) => {
          clearTimeout(t);
          resolve(msg);
        },
      });
    });
  }
  function send(msg) {
    ws.send(JSON.stringify(msg));
  }
  return { ws, open, waitFor, send, inbox };
}

describe("multiplayer sync", () => {
  after(async () => {
    resetAllRooms();
    await closeServer();
  });

  it("keeps two clients in the same room in sync through start and early play", async () => {
    const port = await listen();
    const a = connect(port);
    const b = connect(port);
    await Promise.all([a.open, b.open]);

    a.send({
      type: "createRoom",
      name: "London",
      team: "red",
      teamSize: 2,
      matchSeconds: 600,
      difficulty: "easy",
      visibility: "private",
    });
    const welcomeA = await a.waitFor("welcome");
    assert.ok(welcomeA.code);
    assert.equal(welcomeA.playerId, welcomeA.hostId);

    b.send({ type: "joinRoom", code: welcomeA.code, name: "Keith", team: "blue" });
    const welcomeB = await b.waitFor("welcome");
    assert.equal(welcomeB.code, welcomeA.code);
    assert.notEqual(welcomeB.playerId, welcomeA.playerId);

    const lobbyA = await a.waitFor((m) => m.type === "roomUpdate" && m.seats?.blue?.some((p) => p.name === "Keith"));
    assert.ok(lobbyA.seats.red.some((p) => p.name === "London"));

    a.send({ type: "start" });
    const startA = await a.waitFor("gameStart");
    const startB = await b.waitFor("gameStart");
    assert.equal(startA.state.phase, "playing");
    assert.equal(startB.state.phase, "playing");
    assert.equal(startA.state.players.length, 8);
    assert.equal(startB.state.players.length, startA.state.players.length);
    const humanA = startA.state.players.find((p) => p.id === welcomeA.playerId);
    const humanB = startB.state.players.find((p) => p.id === welcomeB.playerId);
    assert.equal(humanA.team, "red");
    assert.equal(humanB.team, "blue");

    a.send({ type: "input", dx: 1, dy: 1 });
    b.send({ type: "input", dx: -1, dy: 1 });

    const laterA = await a.waitFor("state");
    const laterB = await b.waitFor("state");
    assert.equal(laterA.state.players.length, laterB.state.players.length);
    assert.equal(Number(laterA.state.timeLeft.toFixed(2)), Number(laterB.state.timeLeft.toFixed(2)));
    const pa = laterA.state.players.find((p) => p.id === welcomeA.playerId);
    const pb = laterB.state.players.find((p) => p.id === welcomeA.playerId);
    assert.ok(Math.abs(pa.x - pb.x) < 0.001);
    assert.ok(Math.abs(pa.y - pb.y) < 0.001);
    assert.equal(laterA.state.conserved, true);

    a.ws.close();
    b.ws.close();
  });
});
