# 4 Way Capture the Flag

A four-team online bean-bag capture game created by **London Daly**.

Four teams — Red, Blue, Yellow, and Pink — share one field. Each team is trying to gather all six bean bags of its own color. Those bags start in the other teams' far-corner stashes, behind a ring of cones. Tag rivals who enter your quarter, sit for 12 seconds if you get tagged, and dash home to auto-deposit your bag.

## Play now

Start the server and open [http://localhost:3847](http://localhost:3847) in a browser.

```bash
cd 4way-ctf
npm install
npm test
npm start
```

### A temporary public URL

On a normal home or cloud network, you can share a short-lived HTTPS link with friends:

```bash
./scripts/start-public.sh
```

That runs [Cloudflare's quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) (`cloudflared tunnel --url http://localhost:3847`) and prints a `https://….trycloudflare.com` address. The link lasts **only while that process and this computer stay running**. It does not need a Cloudflare account.

If `cloudflared` cannot reach the Cloudflare edge (some restricted or sandboxed networks intercept those connections), use the local URL above or deploy the app permanently.


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

Use **W A S D** or the arrow keys to run (or the on-screen joystick on a phone). Walking onto a bag of your color picks it up. Walking into your own cone zone deposits it. Tagging and rescuing happen automatically when you touch another player.

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

1. Push this folder to a Git repository.
2. Create a new **Web Service** from that repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Set the instance to stay running (not a sleep-after-idle free web service if you want rooms to survive).

A `Procfile` with `web: npm start` is included for hosts that look for one.

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
