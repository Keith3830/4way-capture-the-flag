import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CENTER,
  CONE_ZONE,
  FREEZE_DURATION,
  GRACE_DURATION,
  TAG_RANGE,
} from "../shared/constants.js";
import {
  applyDeposit,
  applyPickup,
  applyRescue,
  applyTag,
  bagsAreConserved,
  canBeTagged,
  canPickupFromStash,
  canRescue,
  canTag,
  coneTeamAt,
  countBagsOfColor,
  determineWinner,
  getQuarter,
  initialScores,
  initialStashes,
  isInConeZone,
  shouldAutoDeposit,
  spawnPoint,
  updateGraceAfterMove,
} from "../shared/rules.js";

function player(partial) {
  return {
    id: "a",
    name: "A",
    team: "red",
    x: 300,
    y: 300,
    carrying: null,
    frozenUntil: 0,
    graceUntil: 0,
    inConeTeam: null,
    ...partial,
  };
}

describe("field geometry", () => {
  it("splits the field into four quarters and treats the center as a meeting point, not a special zone", () => {
    assert.equal(getQuarter(100, 100), "red");
    assert.equal(getQuarter(800, 100), "blue");
    assert.equal(getQuarter(100, 800), "yellow");
    assert.equal(getQuarter(800, 800), "pink");
    assert.equal(getQuarter(CENTER, CENTER), "pink");
    assert.equal(coneTeamAt(CENTER, CENTER), null);
  });

  it("places each stash cone zone in the far corner", () => {
    assert.equal(isInConeZone(20, 20, "red"), true);
    assert.equal(isInConeZone(20, 20, "blue"), false);
    assert.equal(isInConeZone(FIELD_NEAR_BLUE(), 20, "blue"), true);
    assert.equal(isInConeZone(20, FIELD_NEAR_BLUE(), "yellow"), true);
    assert.equal(isInConeZone(FIELD_NEAR_BLUE(), FIELD_NEAR_BLUE(), "pink"), true);
    assert.equal(coneTeamAt(10, 10), "red");
  });

  it("spawns players just outside their own cones, facing the center", () => {
    const s = spawnPoint("red", 0);
    assert.equal(isInConeZone(s.x, s.y, "red"), false);
    assert.equal(getQuarter(s.x, s.y), "red");
    assert.ok(s.x >= CONE_ZONE - 8 || s.y >= CONE_ZONE - 8);
    // Facing toward center means both components of the heading are positive for red.
    assert.ok(Math.cos(s.angle) > 0);
    assert.ok(Math.sin(s.angle) > 0);
  });
});

function FIELD_NEAR_BLUE() {
  return 1000 - 20;
}

describe("starting bags", () => {
  it("gives each stash two bags of every rival color and none of its own", () => {
    const stashes = initialStashes();
    assert.deepEqual(stashes.red.available, { red: 0, blue: 2, yellow: 2, pink: 2 });
    assert.deepEqual(stashes.blue.available, { red: 2, blue: 0, yellow: 2, pink: 2 });
    assert.deepEqual(stashes.yellow.available, { red: 2, blue: 2, yellow: 0, pink: 2 });
    assert.deepEqual(stashes.pink.available, { red: 2, blue: 2, yellow: 2, pink: 0 });
    assert.equal(countBagsOfColor("red", stashes, []), 6);
    assert.ok(bagsAreConserved(stashes, []));
  });
});

describe("tagging", () => {
  it("lets only the home team tag visitors in its quarter, and never in cones", () => {
    const now = 10;
    const redGuard = player({ id: "g", team: "red", x: 220, y: 220 });
    const blueRunner = player({ id: "r", team: "blue", x: 220 + TAG_RANGE / 2, y: 220 });
    assert.equal(getQuarter(blueRunner.x, blueRunner.y), "red");
    assert.equal(canTag(redGuard, blueRunner, now), true);
    assert.equal(canTag(blueRunner, redGuard, now), false);

    const inside = player({ id: "r2", team: "blue", x: 40, y: 40 });
    assert.equal(isInConeZone(inside.x, inside.y, "red"), true);
    assert.equal(canBeTagged(inside, now), false);
    assert.equal(canTag(redGuard, inside, now), false);
  });

  it("makes players safe in their own quarter even if a visitor is next to them", () => {
    const now = 10;
    const red = player({ id: "home", team: "red", x: 200, y: 200 });
    const blue = player({ id: "vis", team: "blue", x: 210, y: 200 });
    assert.equal(canBeTagged(red, now), false);
    assert.equal(canTag(blue, red, now), false);
  });

  it("grants 1.5s of no-tag grace after leaving a rival cone zone", () => {
    const p = player({ team: "blue", x: 40, y: 40, inConeTeam: "red" });
    const now = 5;
    p.x = 200;
    p.y = 200;
    updateGraceAfterMove(p, now);
    assert.ok(p.graceUntil > now);
    assert.equal(p.graceUntil, now + GRACE_DURATION);
    assert.equal(canBeTagged(p, now + 0.5), false);
    assert.equal(canBeTagged(p, now + GRACE_DURATION + 0.01), true);
  });

  it("does not let two visiting teams tag each other in a third quarter", () => {
    const now = 10;
    const blue = player({ id: "b", team: "blue", x: 200, y: 200 });
    const yellow = player({ id: "y", team: "yellow", x: 210, y: 200 });
    assert.equal(getQuarter(blue.x, blue.y), "red");
    assert.equal(canTag(blue, yellow, now), false);
    assert.equal(canTag(yellow, blue, now), false);
  });
});

describe("carry, drop, and deposit", () => {
  it("allows only one own-color bag to be picked up, and only from a cone zone", () => {
    const stashes = initialStashes();
    const now = 1;
    const red = player({ team: "red", x: 880, y: 40 });
    assert.equal(canPickupFromStash(red, "blue", stashes, now), true);
    applyPickup(red, "blue", stashes);
    assert.deepEqual(red.carrying, { color: "red", origin: "blue" });
    assert.equal(stashes.blue.available.red, 1);
    assert.equal(canPickupFromStash(red, "blue", stashes, now), false);

    const still = player({ team: "red", x: 880, y: 40 });
    // Cannot pick up a blue bag even though two are sitting there.
    assert.equal(stashes.blue.available.blue, 0);
    assert.equal(stashes.blue.available.yellow, 2);
    still.team = "red";
    // Red trying to pick a non-own color is rejected because available[red] is checked.
    const yellowPlayer = player({ id: "y", team: "yellow", x: 40, y: 40 });
    assert.equal(canPickupFromStash(yellowPlayer, "red", stashes, now), true);
    const redInOwn = player({ team: "red", x: 40, y: 40 });
    assert.equal(canPickupFromStash(redInOwn, "red", stashes, now), false);
  });

  it("returns a tagged carrier's bag to the stash it came from and freezes them for 12s", () => {
    const stashes = initialStashes();
    const now = 3;
    const red = player({ team: "red", x: 300, y: 300, carrying: { color: "red", origin: "blue" } });
    stashes.blue.available.red = 1;
    const returned = applyTag(red, stashes, now);
    assert.deepEqual(returned, { color: "red", origin: "blue" });
    assert.equal(red.carrying, null);
    assert.equal(stashes.blue.available.red, 2);
    assert.equal(red.frozenUntil, now + FREEZE_DURATION);
    assert.ok(bagsAreConserved(stashes, [red]));
  });

  it("auto-deposits when a carrier enters their own cones and will not let that bag be stolen", () => {
    const stashes = initialStashes();
    const scores = initialScores();
    const red = player({ team: "red", x: 40, y: 40, carrying: { color: "red", origin: "pink" } });
    assert.equal(shouldAutoDeposit(red), true);
    const count = applyDeposit(red, scores, stashes, 12);
    assert.equal(count, 1);
    assert.equal(stashes.red.deposited, 1);
    assert.equal(scores.red.deposited, 1);
    assert.equal(scores.red.reachedAt[1], 12);
    assert.equal(red.carrying, null);
    // Deposited bags are not in available, so they cannot be picked up.
    const thief = player({ id: "x", team: "red", x: 40, y: 40 });
    assert.equal(stashes.red.available.red, 0);
    assert.equal(canPickupFromStash(thief, "red", stashes, 20), false);
  });

  it("lets a teammate free a frozen player, or waits out the 12 second timer", () => {
    const now = 8;
    const sat = player({ id: "sat", team: "red", x: 300, y: 300, frozenUntil: now + 10 });
    const pal = player({ id: "pal", team: "red", x: 310, y: 300 });
    const rival = player({ id: "riv", team: "blue", x: 310, y: 300 });
    assert.equal(canRescue(pal, sat, now), true);
    assert.equal(canRescue(rival, sat, now), false);
    applyRescue(sat);
    assert.equal(sat.frozenUntil, 0);
    assert.equal(canBeTagged(sat, now), false); // still in own quarter here; move them
  });
});

describe("winning", () => {
  it("awards an immediate win when a team deposits all 6 bags", () => {
    const scores = initialScores();
    scores.red.deposited = 6;
    scores.red.reachedAt[6] = 100;
    const result = determineWinner(scores, 300);
    assert.equal(result.type, "win");
    assert.deepEqual(result.teams, ["red"]);
    assert.equal(result.reason, "collected-all");
    assert.equal(determineWinner(initialScores(), 10), null);
  });

  it("on timeout picks the most bags, then who reached that count first, then a shared win", () => {
    const scores = initialScores();
    scores.red.deposited = 4;
    scores.blue.deposited = 3;
    scores.red.reachedAt[4] = 50;
    let result = determineWinner(scores, 0);
    assert.deepEqual(result, { type: "win", teams: ["red"], reason: "timeout-most-bags" });

    scores.blue.deposited = 4;
    scores.blue.reachedAt[4] = 40;
    result = determineWinner(scores, 0);
    assert.deepEqual(result, { type: "win", teams: ["blue"], reason: "timeout-first-to-count" });

    scores.red.reachedAt[4] = 40;
    result = determineWinner(scores, 0);
    assert.equal(result.type, "shared");
    assert.deepEqual(result.teams, ["red", "blue"]);
    assert.equal(result.reason, "timeout-tie");
  });
});
