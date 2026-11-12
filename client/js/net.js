export function connect() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/ws`);
  const listeners = new Map();

  ws.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    const fns = listeners.get(msg.type) || [];
    const all = listeners.get("*") || [];
    for (const fn of [...fns, ...all]) fn(msg);
  });

  function on(type, fn) {
    const list = listeners.get(type) || [];
    list.push(fn);
    listeners.set(type, list);
  }

  function send(msg) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", () => reject(new Error("Could not connect to the game server.")));
  });

  return { ws, on, send, ready };
}
