import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeLol } from "../src/lol";
import { playerShares, playerStats } from "../src/player-stats";
import { summarizeLolSeries } from "../src/series";
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const catalog = read("data/fixtures/lol/champions.json");
const rows = () => read("data/fixtures/lol/LOLTMNT02_76144.json").rows;
const game = () => normalizeLol(rows(), catalog);

test("all positions expose the same full statistics; each team's shares sum to 100", () => {
  const m = game();
  assert.deepEqual(
    playerStats(m, m.players[0]).map((s) => s.label),
    playerStats(m, m.players[4]).map((s) => s.label),
  );
  for (const side of ["radiant", "dire"]) {
    const players = m.players.filter((p) => p.side === side);
    for (const key of ["damage", "damageTaken", "gold"] as const)
      assert.ok(
        Math.abs(
          players.reduce((n, p) => n + playerShares(m, p)[key]!, 0) - 100,
        ) < 1e-8,
      );
  }
  const p = m.players[0];
  assert.equal(p.totalGold, 17903);
  assert.equal(p.damageTaken, (571.6519 * m.duration) / 60);
  assert.equal(
    playerShares(m, p).gold,
    (17903 /
      m.players
        .filter((v) => v.side === p.side)
        .reduce((n, v) => n + v.totalGold!, 0)) *
      100,
  );
});
test("missing teammate damage taken and zero denominators never become misleading shares", () => {
  const data = rows();
  data[1].damagetakenperminute = "";
  const m = normalizeLol(data, catalog);
  assert.ok(
    m.players
      .filter((p) => p.side === "radiant")
      .every((p) => playerShares(m, p).damageTaken === undefined),
  );
  assert.equal(
    playerStats(m, m.players[0]).find((s) => s.label === "承伤占比")!.value,
    "—",
  );
  for (const p of m.players) p.teamTotals!.damage = 0;
  assert.equal(playerShares(m, m.players[0]).damage, undefined);
});
test("series shares sum numerators and team totals; substitutes only use games they played", () => {
  const a = game(),
    b = game();
  b.id += "-second";
  b.gameNumber = 2;
  b.date = new Date(Date.parse(a.date) + 3600000).toISOString();
  b.players[0].name = "Substitute";
  b.players[0].playerId = "sub";
  b.players[0].totalGold! *= 2;
  for (const p of b.players.filter((p) => p.side === "radiant"))
    p.teamTotals!.totalGold! += a.players[0].totalGold!;
  const report = summarizeLolSeries([a, b]);
  const individual = report.series!.players.find(
    (p) => p.name === a.players[0].name,
  )!;
  assert.equal(
    playerShares(report, individual).gold,
    playerShares(a, a.players[0]).gold,
  );
  const role = report.players[0];
  const expected =
    (100 * (a.players[0].totalGold! + b.players[0].totalGold!)) /
    (a.players[0].teamTotals!.totalGold! + b.players[0].teamTotals!.totalGold!);
  assert.equal(playerShares(report, role).gold, expected);
  assert.equal(role.lolLoadout, undefined);
});
