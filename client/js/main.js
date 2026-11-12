import { connect } from "./net.js";
import { createInput } from "./input.js";
import { createRenderer } from "./render.js";
import { play, startMusic, toggleMute, isMuted, unlock } from "./audio.js";

const TEAMS = ["red", "blue", "yellow", "pink"];
const LABELS = { red: "Red", blue: "Blue", yellow: "Yellow", pink: "Pink" };

const screens = {
  splash: $("screen-splash"),
  menu: $("screen-menu"),
  setup: $("screen-setup"),
  lobby: $("screen-lobby"),
  game: $("screen-game"),
  over: $("screen-over"),
};

const nameInput = $("player-name");
nameInput.value = localStorage.getItem("ctf-name") || "";

let net = null;
let setupMode = "create";
let myId = null;
let myToken = null;
let roomCode = null;
let hostId = null;
let lobby = null;
let state = null;
let chosenTeam = "red";
let renderer = null;
let input = null;
let lastSent = { dx: 0, dy: 0, at: 0 };
let anim = 0;

function $(id) {
  return document.getElementById(id);
}

function show(name) {
  for (const [key, el] of Object.entries(screens)) {
    el.classList.toggle("hidden", key !== name);
  }
}

function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2800);
}

function playerName() {
  const n = nameInput.value.trim().slice(0, 16);
  localStorage.setItem("ctf-name", n);
  return n || "Player";
}

function paintTeamPicks(root, selected, onPick) {
  root.innerHTML = "";
  for (const team of TEAMS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `team-btn ${team}${team === selected ? " selected" : ""}`;
    b.textContent = LABELS[team];
    b.addEventListener("click", () => onPick(team));
    root.appendChild(b);
  }
}

function bindTeamPicks() {
  paintTeamPicks($("setup-teams"), chosenTeam, (t) => {
    chosenTeam = t;
    bindTeamPicks();
  });
}
bindTeamPicks();

$("btn-enter").addEventListener("click", () => {
  unlock();
  play("click");
  startMusic();
  show("menu");
});
$("btn-back-splash").addEventListener("click", () => show("splash"));

function openSetup(mode) {
  setupMode = mode;
  $("setup-error").textContent = "";
  const titles = {
    create: "Create a private room",
    join: "Join with a code",
    quick: "Quick Play",
    solo: "Solo vs Bots",
  };
  $("setup-title").textContent = titles[mode];
  $("setup-code-row").classList.toggle("hidden", mode !== "join");
  $("setup-host-options").classList.toggle("hidden", mode === "join");
  show("setup");
}

$("btn-create").addEventListener("click", () => openSetup("create"));
$("btn-join").addEventListener("click", () => openSetup("join"));
$("btn-quick").addEventListener("click", () => openSetup("quick"));
$("btn-solo").addEventListener("click", () => openSetup("solo"));
$("btn-setup-back").addEventListener("click", () => show("menu"));

$("btn-setup-go").addEventListener("click", async () => {
  $("setup-error").textContent = "";
  try {
    await ensureNet();
    const payload = {
      name: playerName(),
      team: chosenTeam,
      teamSize: Number($("team-size").value),
      matchSeconds: Number($("match-length").value),
      difficulty: $("difficulty").value,
    };
    if (setupMode === "create") net.send({ type: "createRoom", visibility: "private", ...payload });
    else if (setupMode === "solo") net.send({ type: "createRoom", visibility: "private", solo: true, ...payload });
    else if (setupMode === "join") {
      const code = $("join-code").value.trim().toUpperCase();
      if (code.length < 3) {
        $("setup-error").textContent = "Enter the 4-letter room code.";
        return;
      }
      net.send({ type: "joinRoom", code, name: payload.name, team: payload.team });
    } else if (setupMode === "quick") net.send({ type: "quickPlay", ...payload });
  } catch (err) {
    $("setup-error").textContent = err.message || "Could not connect.";
  }
});

async function ensureNet() {
  if (net && net.ws.readyState === WebSocket.OPEN) return net;
  net = connect();
  await net.ready;
  net.on("welcome", onWelcome);
  net.on("roomUpdate", onRoom);
  net.on("gameStart", onGameStart);
  net.on("state", onState);
  net.on("gameOver", onGameOver);
  net.on("rejoined", onRejoined);
  net.on("error", (msg) => {
    const text = msg.message || "Error";
    if (!screens.lobby.classList.contains("hidden")) $("lobby-error").textContent = text;
    else if (!screens.setup.classList.contains("hidden")) $("setup-error").textContent = text;
    else toast(text);
  });
  net.ws.addEventListener("close", () => {
    if (!screens.game.classList.contains("hidden") || !screens.lobby.classList.contains("hidden")) {
      toast("Connection lost. Trying to reconnect…");
      setTimeout(tryReconnect, 800);
    }
  });
  return net;
}

function tryReconnect() {
  if (!roomCode || !myToken) return;
  ensureNet()
    .then(() => net.send({ type: "reconnect", code: roomCode, token: myToken }))
    .catch(() => toast("Still offline. Check your connection."));
}

function onWelcome(msg) {
  myId = msg.playerId;
  myToken = msg.token;
  roomCode = msg.code;
  hostId = msg.hostId;
  lobby = msg;
  renderLobby(msg);
  show("lobby");
}

function onRoom(msg) {
  lobby = msg;
  roomCode = msg.code;
  hostId = msg.hostId;
  renderLobby(msg);
}

function renderLobby(msg) {
  $("lobby-code").textContent = msg.code || roomCode || "----";
  $("lobby-error").textContent = "";
  const s = msg.settings || {};
  const mins = Math.round((s.matchSeconds || 600) / 60);
  $("lobby-settings").textContent = `${s.teamSize || 2} per team · ${mins} min · bots ${s.difficulty || "normal"}`;
  $("lobby-share").textContent =
    msg.visibility === "public"
      ? "This is a public Quick Play room. Others can join, and empty seats will fill with AI bots."
      : "Share this code with friends so they can join. Empty seats fill with AI bots when the match starts.";
  const isHost = myId && msg.hostId === myId;
  $("btn-start").classList.toggle("hidden", !isHost);
  $("lobby-wait").textContent = isHost
    ? "Start when you are ready. Empty seats become AI teammates."
    : "Waiting for the host to start the match…";

  const root = $("lobby-teams");
  root.innerHTML = "";
  for (const team of TEAMS) {
    const card = document.createElement("div");
    card.className = `team-card ${team}`;
    const title = document.createElement("h2");
    title.textContent = LABELS[team];
    const list = document.createElement("ul");
    const seats = (msg.seats && msg.seats[team]) || [];
    for (const p of seats) {
      const li = document.createElement("li");
      const you = p.id === myId ? " (you)" : "";
      const ready = p.ready ? " — ready" : "";
      li.textContent = `${p.name}${you}${ready}`;
      list.appendChild(li);
    }
    const open = (s.teamSize || 2) - seats.length;
    for (let i = 0; i < open; i++) {
      const li = document.createElement("li");
      li.className = "open";
      li.textContent = "Open seat (AI will fill)";
      list.appendChild(li);
    }
    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = `team-btn ${team}`;
    pick.textContent = myId && seats.some((p) => p.id === myId) ? "Your team" : "Join team";
    pick.disabled = Boolean(seats.some((p) => p.id === myId));
    pick.addEventListener("click", () => net?.send({ type: "selectTeam", team }));
    card.append(title, list, pick);
    root.appendChild(card);
  }
}

$("btn-start").addEventListener("click", () => net?.send({ type: "start" }));
$("btn-ready").addEventListener("click", () => net?.send({ type: "ready", ready: true }));
$("btn-leave-lobby").addEventListener("click", leaveToMenu);
$("btn-leave-game").addEventListener("click", leaveToMenu);
$("btn-again").addEventListener("click", leaveToMenu);

function leaveToMenu() {
  try {
    net?.send({ type: "leave" });
  } catch {
    /* ignore */
  }
  cancelAnimationFrame(anim);
  input?.hideJoystick();
  myId = null;
  myToken = null;
  roomCode = null;
  hostId = null;
  lobby = null;
  state = null;
  show("menu");
}

function onGameStart(msg) {
  hostId = msg.hostId;
  roomCode = msg.code;
  state = msg.state;
  enterGame();
  play("start");
}

function onRejoined(msg) {
  myId = msg.playerId;
  myToken = msg.token;
  roomCode = msg.code;
  hostId = msg.hostId;
  state = msg.state;
  if (state?.phase === "playing") enterGame();
  else if (state?.phase === "over") onGameOver({ result: state.winner, state });
  else show("lobby");
}

function onState(msg) {
  state = msg.state;
  if (state?.events) {
    for (const ev of state.events) {
      if (ev.type === "pickup") play("pickup");
      if (ev.type === "deposit") play("deposit");
      if (ev.type === "tag") play("tag");
      if (ev.type === "rescue") play("rescue");
    }
  }
  updateHud();
}

function onGameOver(msg) {
  state = msg.state || state;
  play("gameover");
  const result = msg.result || state?.winner;
  const names = (result?.teams || []).map((t) => LABELS[t]).join(" and ");
  if (result?.type === "shared") {
    $("over-title").textContent = `Shared win: ${names}`;
  } else {
    $("over-title").textContent = `${names} wins!`;
  }
  const reasons = {
    "collected-all": "First team to gather all 6 bean bags of their color.",
    "timeout-most-bags": "Time ran out. This team had the most own-color bags.",
    "timeout-first-to-count": "Time ran out in a tie, and this team reached that count first.",
    "timeout-tie": "Time ran out in a true tie, so the teams share the win.",
  };
  $("over-reason").textContent = reasons[result?.reason] || "";
  const root = $("over-scores");
  root.innerHTML = "";
  for (const team of TEAMS) {
    const card = document.createElement("div");
    card.className = `team-card ${team}`;
    const n = state?.scores?.[team]?.deposited ?? 0;
    card.innerHTML = `<h2>${LABELS[team]}</h2><ul><li>${n} / 6 bags</li></ul>`;
    root.appendChild(card);
  }
  input?.hideJoystick();
  show("over");
}

function enterGame() {
  show("game");
  const canvas = $("field");
  if (!renderer) renderer = createRenderer(canvas);
  else renderer.resize();
  if (!input) input = createInput($("joystick"), $("joystick-knob"));
  input.showJoystick();
  $("touch-hint").classList.toggle("hidden", !input.usesTouch());
  updateHud();
  cancelAnimationFrame(anim);
  loop();
}

function loop() {
  anim = requestAnimationFrame(loop);
  if (renderer && state) renderer.frame(state, myId, state.now || 0);
  const dir = input ? input.dir() : { dx: 0, dy: 0 };
  const t = performance.now();
  if (t - lastSent.at > 40 || dir.dx !== lastSent.dx || dir.dy !== lastSent.dy) {
    lastSent = { ...dir, at: t };
    net?.send({ type: "input", dx: dir.dx, dy: dir.dy });
  }
}

function updateHud() {
  if (!state) return;
  const t = Math.max(0, Math.ceil(state.timeLeft || 0));
  const m = Math.floor(t / 60);
  const s = String(t % 60).padStart(2, "0");
  $("hud-timer").textContent = `${m}:${s}`;
  const scores = $("hud-scores");
  scores.innerHTML = "";
  const me = state.players?.find((p) => p.id === myId);
  for (const team of TEAMS) {
    const pill = document.createElement("div");
    pill.className = `score-pill ${team}${me?.team === team ? " you" : ""}`;
    const n = state.scores?.[team]?.deposited ?? 0;
    pill.textContent = `${LABELS[team]} ${n}/6`;
    scores.appendChild(pill);
  }
  let status = "";
  if (me) {
    if ((me.frozenUntil || 0) > (state.now || 0)) {
      const left = me.frozenUntil - state.now;
      status = `Frozen! Sit still — ${left.toFixed(1)}s or wait for a teammate to tag you free.`;
    } else if (me.carrying) {
      status = `Carrying a ${me.carrying.color} bean bag. Get it home to your cones!`;
    } else if ((me.graceUntil || 0) > (state.now || 0)) {
      status = "Safe dash — you just left the cones.";
    } else {
      status = "Run to a rival stash and grab a bag of your color.";
    }
  }
  $("hud-status").textContent = status;
}

$("btn-mute").addEventListener("click", () => {
  const m = toggleMute();
  $("btn-mute").textContent = m ? "Sound off" : "Sound on";
});

window.addEventListener("pointerdown", () => unlock(), { once: true });
