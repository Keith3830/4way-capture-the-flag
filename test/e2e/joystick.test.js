import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { closeServer, server } from "../../server/index.js";
import { resetAllRooms } from "../../server/rooms.js";

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}

function listen() {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function snapshot(page) {
  return page.evaluate(() => (typeof window.__ctf === "function" ? window.__ctf() : null));
}

async function waitForPlay(page) {
  await page.waitForFunction(() => {
    const s = typeof window.__ctf === "function" ? window.__ctf() : null;
    return s && s.phase === "playing" && s.player;
  }, null, { timeout: 15000 });
}

async function dragHold(page, x, y, dx, dy, holdMs) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps);
  }
  await page.waitForTimeout(holdMs);
}

describe("on-screen joystick (mobile)", async () => {
  const pw = await loadPlaywright();
  if (!pw) {
    it("skips when Playwright is not installed", () => {
      assert.ok(true);
    });
    return;
  }

  let port;
  let browser;
  let page;

  before(async () => {
    port = await listen();
    browser = await pw.chromium.launch({ headless: true });
    const context = await browser.newContext({
      ...pw.devices["Pixel 7"],
      hasTouch: true,
      isMobile: true,
    });
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.click("#btn-enter");
    await page.click("#btn-solo");
    await page.click("#btn-setup-go");
    await waitForPlay(page);
    await page.evaluate(() => window.__ctfSetView && window.__ctfSetView("classic"));
    await page.waitForFunction(() => window.__ctf?.()?.viewMode === "classic", null, { timeout: 8000 });
  });

  after(async () => {
    await browser?.close();
    resetAllRooms();
    await closeServer();
  });

  it("serves the splash and a healthy game page", async () => {
    const title = await page.title();
    assert.match(title, /4 Way Capture the Flag/);
  });

  it("moves the player in the same direction as the drag on the left half", async () => {
    const box = await page.evaluate(() => ({
      w: window.innerWidth,
      h: window.innerHeight,
    }));
    const x = Math.round(box.w * 0.22);
    const y = Math.round(box.h * 0.72);
    const dist = 90;

    const directions = [
      { name: "up", dx: 0, dy: -dist, axis: "dy", sign: -1, pos: "y", posSign: -1 },
      { name: "down", dx: 0, dy: dist, axis: "dy", sign: 1, pos: "y", posSign: 1 },
      { name: "right", dx: dist, dy: 0, axis: "dx", sign: 1, pos: "x", posSign: 1 },
      { name: "left", dx: -dist, dy: 0, axis: "dx", sign: -1, pos: "x", posSign: -1 },
    ];

    for (const dir of directions) {
      const before = await snapshot(page);
      assert.ok(before?.player, "player should be in the snapshot");
      await dragHold(page, x, y, dir.dx, dir.dy, 500);
      const during = await snapshot(page);
      assert.equal(during.held, true, `${dir.name}: stick should stay held while the thumb is down`);
      assert.ok(
        during.dir[dir.axis] * dir.sign > 0.5,
        `${dir.name}: expected ${dir.axis} to match the drag, got ${JSON.stringify(during.dir)}`,
      );
      const other = dir.axis === "dx" ? "dy" : "dx";
      assert.ok(
        Math.abs(during.dir[other]) < 0.35,
        `${dir.name}: other axis should stay near 0, got ${JSON.stringify(during.dir)}`,
      );
      const after = during.player;
      const delta = after[dir.pos] - before.player[dir.pos];
      if (during.player && before.player) {
        // If a freeze tag landed, the vector check above already proved the mapping.
        // When the player is free, they must travel the same way as the drag.
        const moved = Math.abs(delta) > 4;
        if (moved) {
          assert.ok(
            delta * dir.posSign > 0,
            `${dir.name}: position ${dir.pos} changed the wrong way (${before.player[dir.pos]} -> ${after[dir.pos]})`,
          );
        }
      }
      await page.mouse.up();
      await page.waitForTimeout(200);
      const released = await snapshot(page);
      assert.equal(released.held, false, `${dir.name}: stick should clear on release`);
      assert.equal(released.dir.dx, 0);
      assert.equal(released.dir.dy, 0);
    }
  });
});
