import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { createRoom, findPublicRoom, getRoom, listPublic } from "./rooms.js";
import { freshId } from "./game.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 3847;
const HOST = process.env.HOST || "0.0.0.0";

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  if (req.path.startsWith("/vendor/")) {
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
  } else {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "4way-ctf", publicRooms: listPublic().length });
});
app.use("/vendor/three", express.static(path.join(ROOT, "node_modules/three")));
app.use("/shared", express.static(path.join(ROOT, "shared")));
app.use(express.static(path.join(ROOT, "client")));
app.get("*", (_req, res) => {
  res.sendFile(path.join(ROOT, "client", "index.html"));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

wss.on("connection", (ws) => {
  let playerId = null;
  let room = null;
  let alive = true;

  ws.on("pong", () => {
    alive = true;
  });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return send(ws, { type: "error", message: "Invalid message." });
    }
    try {
      handle(msg);
    } catch (err) {
      console.error(err);
      send(ws, { type: "error", message: "Something went wrong." });
    }
  });

  function handle(msg) {
    const type = msg?.type;
    if (type === "createRoom") {
      room = createRoom({
        hostName: msg.name,
        teamSize: msg.teamSize,
        matchSeconds: msg.matchSeconds,
        difficulty: msg.difficulty,
        visibility: msg.visibility === "public" ? "public" : "private",
        hostTeam: msg.team,
      });
      const joined = room.addHuman({ ws, name: msg.name, team: msg.team });
      if (joined.error) return send(ws, { type: "error", message: joined.error });
      playerId = joined.player.id;
      send(ws, {
        ...room.lobbySnapshot(),
        type: "welcome",
        playerId,
        token: joined.token,
      });
      if (msg.solo) room.beginMatch();
      return;
    }
    if (type === "joinRoom") {
      room = getRoom(msg.code);
      if (!room) return send(ws, { type: "error", message: "No room uses that code." });
      const joined = room.addHuman({ ws, name: msg.name, team: msg.team });
      if (joined.error) return send(ws, { type: "error", message: joined.error });
      playerId = joined.player.id;
      return send(ws, {
        ...room.lobbySnapshot(),
        type: "welcome",
        playerId,
        token: joined.token,
      });
    }
    if (type === "quickPlay") {
      room = findPublicRoom();
      if (!room) {
        room = createRoom({
          hostName: msg.name,
          teamSize: msg.teamSize || 3,
          matchSeconds: msg.matchSeconds || 600,
          difficulty: msg.difficulty || "normal",
          visibility: "public",
          hostTeam: msg.team,
        });
      }
      const joined = room.addHuman({ ws, name: msg.name, team: msg.team });
      if (joined.error) return send(ws, { type: "error", message: joined.error });
      playerId = joined.player.id;
      return send(ws, {
        ...room.lobbySnapshot(),
        type: "welcome",
        playerId,
        token: joined.token,
      });
    }
    if (type === "reconnect") {
      room = getRoom(msg.code);
      if (!room) return send(ws, { type: "error", message: "That room is gone." });
      const id = room.reconnect({ ws, token: msg.token });
      if (!id) return send(ws, { type: "error", message: "Could not reconnect." });
      playerId = id;
      return;
    }
    if (!room || !playerId) return send(ws, { type: "error", message: "Join a room first." });
    if (type === "selectTeam") return void room.switchTeam(playerId, msg.team);
    if (type === "ready") return void room.setReady(playerId, msg.ready !== false);
    if (type === "start") {
      const result = room.startFromHost(playerId);
      if (result?.error) send(ws, { type: "error", message: result.error });
      return;
    }
    if (type === "input") return void room.handleInput(playerId, msg);
    if (type === "leave") {
      room.disconnect(playerId);
      room = null;
      playerId = null;
      return send(ws, { type: "left" });
    }
  }

  ws.on("close", () => {
    if (room && playerId) room.disconnect(playerId);
  });

  const beat = setInterval(() => {
    if (!alive) {
      clearInterval(beat);
      try {
        ws.terminate();
      } catch {
        /* already closed */
      }
      return;
    }
    alive = false;
    try {
      ws.ping();
    } catch {
      /* ignore */
    }
  }, 15000);

  ws.on("close", () => clearInterval(beat));
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, HOST, () => {
    console.log(`4 Way Capture the Flag listening on http://${HOST}:${PORT}`);
  });
}

export function closeServer() {
  return new Promise((resolve) => {
    for (const client of wss.clients) {
      try { client.terminate(); } catch { /* ignore */ }
    }
    wss.close();
    if (server.listening) server.close(() => resolve());
    else resolve();
  });
}

export { server, app, PORT, wss };
void freshId;
