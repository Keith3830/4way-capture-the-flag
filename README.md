# 4 Way Capture the Flag

A four-team online bean-bag capture game created by **London Daly**.

Four teams — Red, Blue, Yellow, and Pink — share one field. Each team is trying to gather all six bean bags of its own color. Those bags start in the other teams' far-corner stashes, behind a ring of cones. Tag rivals who enter your quarter, sit for 12 seconds if you get tagged, and dash home to auto-deposit your bag.

## Play now

The game is live at [https://fourway-ctf-london-daly.onrender.com](https://fourway-ctf-london-daly.onrender.com).

This is a Render **free-tier** web service. After about 15 minutes with no traffic, the instance goes to sleep. The first visit after that can take about 30 to 60 seconds to wake up — wait for the splash screen rather than assuming it is down. Open games are also lost when the service sleeps or restarts, because rooms live in memory.

Source: [github.com/Keith3830/4way-capture-the-flag](https://github.com/Keith3830/4way-capture-the-flag).

## Run locally

You need Node.js 18 or newer.

```bash
cd 4way-ctf
npm install
npm test
npm start
```

Then open [http://localhost:3847](http://localhost:3847). The server listens on port `3847` unless you set `PORT`.

## How to play

- **Create a private room** and share the 4-character code with friends.
- **Join with a code** to sit at an open team seat.
- **Quick Play** puts you in a public room with strangers; empty seats fill with AI bots after a short wait, or the host can start sooner.
- **Solo vs Bots** starts a match immediately with you plus AI teammates and rivals.

The default camera is **over-the-shoulder 3D** (comfortable on a phone). Use the **Camera** button to switch to **first person** or the original **classic top-down** view if 3D feels slow.

- **Desktop:** W A S D or the arrow keys to run, and click the field to look around with the mouse. Movement follows the way you are facing.
- **Phone:** press and drag on the **left half** of the screen to run (a yellow stick appears under your thumb). In a 3D view, drag on the **right half** to look and turn. Walking onto a bag of your color picks it up. Walking into your own cone zone deposits it. Tagging and rescuing happen automatically when you touch another player.

### The rules, short form

- 2 or 3 players per team (people, AI, or a mix). 2-player teams are allowed.
- Carry **one bag at a time**, and only bags of your own color.
- If you are tagged while carrying, the bag **returns to the stash it came from**. You sit for **12 seconds**, or until a teammate tags you free.
- Inside a rival's cones you cannot be tagged. After you leave those cones you get a **1.5 second** safe dash so defenders cannot camp the exit.
- Only the **home team** can tag in its quarter. You are safe in your own quarter.
- You may guard inside your own cones, but you cannot tag a visitor until they have left the cones (and their grace has ended).
- Bags you have deposited cannot be stolen.
- The host chooses a match length of **10, 15, or 20 minutes** (default 10). First team to 6 own-color bags wins. If time runs out, most bags wins; if still tied, whoever reached that count first wins; if that is also a tie, the teams share the win.

## Deploy permanently

The game is a single Node.js process that serves the web client and an authoritative WebSocket game server. Any host that can run `npm start` with a public HTTPS URL and WebSocket support will work. You do **not** need a separate database.

What you need:

- A Node 18+ service with one instance to start (rooms live in memory).
- An HTTPS URL with WebSocket upgrade support (`wss://`).
- Environment variable `PORT` (most hosts inject this for you).
- About 512 MB of RAM is plenty for early playtests.

### Render

This game is already deployed as a free-plan Node web service:

- Live URL: [https://fourway-ctf-london-daly.onrender.com](https://fourway-ctf-london-daly.onrender.com)
- Repo: [https://github.com/Keith3830/4way-capture-the-flag](https://github.com/Keith3830/4way-capture-the-flag)
- Build command: `npm ci`
- Start command: `npm start`
- Health check: `/health`

The free plan sleeps after about 15 minutes idle, with a 30–60 second cold start, and in-memory rooms do not survive sleep or a restart. A paid always-on instance would be needed if you want matches to stay up between visits. A `Procfile` with `web: npm start` is included for hosts that look for one.

To deploy a fresh copy, create a new Web Service from this repo's `main` branch, use those build and start commands, and leave the plan on **free** unless you intentionally upgrade.

### Fly.io

```bash
# once, from this folder, after installing flyctl and logging in
fly launch --name 4way-ctf --internal-port 3847 --no-deploy
# in fly.toml, set the app to use PORT=3847 or change the internal port to whatever Fly assigns
fly deploy
```

In `fly.toml`, use `internal_port = 3847` (or set `PORT` to Fly's chosen port) and enable an HTTPS service on port 443. Fly already supports WebSockets.

### Railway

1. Create a new project from this Git repo.
2. Railway will detect Node, run `npm install`, and start with `npm start` or the `Procfile`.
3. Expose the service's public HTTP domain. WebSockets work on that same domain.

### Notes for any host

- Rooms and matches are stored in memory. Restarting the process drops open games. That is fine for v1.
- If you later run more than one instance, players in the same room must land on the same process (sticky sessions or a shared adapter). Start with a **single instance**.
- You do not need to store personal data. A display name and a room code are enough to play.

## Tests

```bash
npm test
```

This runs unit tests for the rules, a headless all-bot match played to completion, and a two-client WebSocket test that checks both players see the same room and the same field state.
