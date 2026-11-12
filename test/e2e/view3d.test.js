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

describe("3D view smoke", async () => {
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
  const pageErrors = [];

  before(async () => {
    port = await listen();
    browser = await pw.chromium.launch({ headless: true });
    const context = await browser.newContext({
      ...pw.devices["Pixel 7"],
      hasTouch: true,
      isMobile: true,
    });
    page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on("pageerror", (err) => pageErrors.push(String(err)));
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.click("#btn-enter");
    await page.click("#btn-solo");
    await page.click("#btn-setup-go");
    await page.waitForFunction(() => {
      const s = typeof window.__ctf === "function" ? window.__ctf() : null;
      return s && s.phase === "playing" && s.player;
    }, null, { timeout: 20000 });
    await page.evaluate(() => window.__ctfSetView && window.__ctfSetView("third"));
    await page.waitForTimeout(800);
  });

  after(async () => {
    await browser?.close();
    resetAllRooms();
    await closeServer();
  });

  it("starts a 3D match without a page error", async () => {
    assert.deepEqual(pageErrors, []);
    const info = await page.evaluate(() => {
      const snap = window.__ctf();
      const c3 = document.getElementById("view3d");
      const field = document.getElementById("field");
      const map = document.getElementById("minimap");
      const mapCtx = map?.getContext("2d");
      let mapPixels = 0;
      if (mapCtx) {
        const data = mapCtx.getImageData(0, 0, map.width, map.height).data;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 0) mapPixels += 1;
      }
      return {
        viewMode: snap.viewMode,
        view3dHidden: c3.classList.contains("hidden"),
        fieldHidden: field.classList.contains("hidden"),
        webgl: !!(c3.getContext("webgl") || c3.getContext("webgl2")),
        mapPixels,
      };
    });
    if (info.viewMode === "classic") {
      // WebGL unavailable — classic fallback is acceptable.
      assert.equal(info.fieldHidden, false);
      return;
    }
    assert.equal(info.viewMode, "third");
    assert.equal(info.view3dHidden, false);
    assert.equal(info.fieldHidden, true);
    assert.equal(info.webgl, true);
    assert.ok(info.mapPixels > 50, "mini-map should be painted");
  });

  it("can switch to classic top-down and back", async () => {
    await page.evaluate(() => window.__ctfSetView("classic"));
    await page.waitForFunction(() => window.__ctf()?.viewMode === "classic");
    const classic = await page.evaluate(() => ({
      fieldHidden: document.getElementById("field").classList.contains("hidden"),
      view3dHidden: document.getElementById("view3d").classList.contains("hidden"),
    }));
    assert.equal(classic.fieldHidden, false);
    assert.equal(classic.view3dHidden, true);
    await page.evaluate(() => window.__ctfSetView("third"));
    await page.waitForTimeout(400);
    const snap = await page.evaluate(() => window.__ctf());
    if (snap.viewMode === "third") {
      const again = await page.evaluate(() => document.getElementById("view3d").classList.contains("hidden"));
      assert.equal(again, false);
    }
    assert.deepEqual(pageErrors, []);
  });

  it("moves forward on the field when the left stick is dragged up in 3D", async () => {
    await page.evaluate(() => window.__ctfSetView("third"));
    await page.waitForTimeout(400);
    const before = await page.evaluate(() => window.__ctf());
    if (before.viewMode !== "third") return; // fallback already covered
    const box = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    const x = Math.round(box.w * 0.22);
    const y = Math.round(box.h * 0.72);
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(x, y - (90 * i) / 8);
    await page.waitForTimeout(600);
    const during = await page.evaluate(() => window.__ctf());
    await page.mouse.up();
    assert.equal(during.held, true);
    // Stick-up is forward relative to facing: world vector should be non-zero
    const mag = Math.hypot(during.dir.dx, during.dir.dy);
    assert.ok(mag > 0.5, `expected a forward move vector, got ${JSON.stringify(during.dir)}`);
    const yaw = during.yaw || 0;
    const expectX = Math.sin(yaw);
    const expectY = -Math.cos(yaw);
    const dot = during.dir.dx * expectX + during.dir.dy * expectY;
    assert.ok(dot > 0.7, `stick-up should follow facing (dot ${dot}, dir ${JSON.stringify(during.dir)}, yaw ${yaw})`);
    const moved = Math.hypot(during.player.x - before.player.x, during.player.y - before.player.y);
    if (moved > 4) {
      const mx = during.player.x - before.player.x;
      const my = during.player.y - before.player.y;
      const mdot = mx * expectX + my * expectY;
      assert.ok(mdot > 0, "player should travel along the look direction");
    }
  });
});
