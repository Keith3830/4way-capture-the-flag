import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TEAMS, TICK_DT } from "../shared/constants.js";
import { bagsAreConserved, countBagsOfColor } from "../shared/rules.js";
import { Game } from "../server/game.js";

describe("headless bot match", () => {
  it("fills empty seats with role-based bots and can start with no humans", () => {
    const game = new Game({ teamSize: 3, matchSeconds: 120, difficulty: "normal" });
    game.fillBots();
    assert.equal(game.players.length, 12);
    for (const team of TEAMS) {
      const squad = game.players.filter((p) => p.team === team);
      assert.equal(squad.length, 3);
      const roles = new Set(squad.map((p) => p.role));
      assert.ok(roles.has("guard"));
      assert.ok(roles.has("runner"));
      assert.ok(roles.has("rescuer"));
    }
  });

  it("allows a 2-player team and still fills remaining seats with bots", () => {
    const game = new Game({ teamSize: 2, matchSeconds: 60, difficulty: "easy" });
    game.addPlayer({ name: "London", team: "red", isBot: false });
    game.fillBots();
    assert.equal(game.players.filter((p) => p.team === "red").length, 2);
    assert.equal(game.players.length, 8);
    assert.equal(game.players.filter((p) => !p.isBot).length, 1);
  });

  it("runs a simulated all-bot match to completion and conserves every bean bag", () => {
    const game = new Game({ teamSize: 2, matchSeconds: 180, difficulty: "hard" });
    const { ticks, state } = game.runUntilOver(20000);
    assert.ok(ticks > 10, "match should run for more than a moment");
    assert.equal(state.phase, "over");
    assert.ok(state.winner, "a winner or shared result is required");
    assert.ok(["win", "shared"].includes(state.winner.type));
    for (const color of TEAMS) {
      assert.equal(countBagsOfColor(color, state.stashes, game.players), 6);
    }
    assert.ok(bagsAreConserved(state.stashes, game.players));
    const deposited = TEAMS.reduce((n, t) => n + state.scores[t].deposited, 0);
    assert.ok(deposited >= 1, "bots should score at least one bag in 3 minutes");
    assert.ok(state.timeLeft === 0 || state.winner.reason === "collected-all");
  });

  it("ticks stay bag-conserved while a runner picks up and deposits", () => {
    const game = new Game({ teamSize: 2, matchSeconds: 60, difficulty: "hard" });
    game.start();
    for (let i = 0; i < 25 * 30; i++) {
      game.tick(TICK_DT);
      assert.ok(bagsAreConserved(game.stashes, game.players), `conserved at tick ${i}`);
      if (game.phase === "over") break;
    }
  });
});
