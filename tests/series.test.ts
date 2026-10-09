import test from "node:test";
import assert from "node:assert/strict";
import { groupLolSeries, LolSummary, summarizeLolSeries } from "../src/series";
import { readFileSync } from "node:fs";
import { normalizeLol } from "../src/lol";
import {
  comparisons,
  comparisonScript,
  defaultSettings,
  participation,
  radar,
  refreshSettings,
  sortedDamage,
  previewProps,
} from "../src/domain";
import { listLolMatches } from "../server/lol-source";

const game = (gameNumber: number, date: string, swap = false): LolSummary => ({
  id: "lol-" + date + "-" + gameNumber,
  league: "LCK",
  date,
  radiant: swap ? "Gen.G" : "T1",
  dire: swap ? "T1" : "Gen.G",
  gameNumber,
});
test("series keep all games in ascending order, even when sides swap or input is reversed", () => {
  const matches = [1, 2, 3, 4, 5]
    .map((n, i) =>
      game(
        n,
        `2024-04-14T${String(6 + i).padStart(2, "0")}:00:00Z`,
        i % 2 === 0,
      ),
    )
    .reverse();
  const groups = groupLolSeries(matches);
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0].games.map((g) => g.gameNumber),
    [1, 2, 3, 4, 5],
  );
});
test("missing games stay missing; later series and repeated game numbers are not merged", () => {
  const matches = [
    game(3, "2024-04-14T08:00:00Z"),
    game(5, "2024-04-14T10:00:00Z"),
    game(1, "2024-04-14T12:00:00Z"),
    game(2, "2024-04-14T13:00:00Z"),
    game(1, "2024-06-14T08:00:00Z"),
  ];
  const groups = groupLolSeries(matches);
  assert.equal(groups.length, 3);
  assert.deepEqual(
    groups.map((g) => g.games.map((m) => m.gameNumber)),
    [[1], [1, 2], [3, 5]],
  );
});

const fixtures = () => {
  const catalog = JSON.parse(
    readFileSync("data/fixtures/lol/champions.json", "utf8"),
  );
  return [76144, 76145, 76146, 76147, 76148].map((id) => {
    const snapshot = JSON.parse(
      readFileSync(`data/fixtures/lol/LOLTMNT02_${id}.json`, "utf8"),
    );
    return normalizeLol(snapshot.rows, catalog, snapshot.fetchedAt);
  });
};
test("all five final games are discoverable instead of only the last game", async () => {
  const matches = await listLolMatches();
  const group = groupLolSeries(matches).find((s) =>
    s.games.some((g) => g.id === "lol-LOLTMNT02_76144"),
  )!;
  assert.deepEqual(
    group.games.map((g) => g.gameNumber),
    [1, 2, 3, 4, 5],
  );
});
test("real BO5 aggregates teams across side swaps, uses wins as series score and weights rates", () => {
  const games = fixtures();
  const report = summarizeLolSeries([...games].reverse());
  assert.deepEqual([report.radiant, report.dire], ["Gen.G", "T1"]);
  assert.deepEqual(report.series!.wins, { radiant: 3, dire: 2 });
  assert.deepEqual(
    [report.radiantScore, report.direScore, report.duration],
    [76, 55, 11106],
  );
  assert.deepEqual(
    report.objectives?.map((o) => [o.radiant, o.dire]),
    [
      [343706, 337802],
      [16, 12],
      [4, 8],
      [36, 29],
    ],
  );
  const settings = defaultSettings(report);
  const mid = comparisons(report, settings)[2].pair!;
  assert.deepEqual(
    mid.map((p) => p.name),
    ["Chovy", "Faker"],
  );
  const chovy = games.flatMap((g) =>
    g.players.filter((p) => p.name === "Chovy"),
  );
  assert.equal(
    mid[0].damage,
    chovy.reduce((n, p) => n + p.damage, 0),
  );
  assert.ok(
    Math.abs(
      mid[0].gpm -
        chovy.reduce((n, p, i) => n + p.gpm * games[i].duration, 0) / 11106,
    ) < 1e-8,
  );
  assert.equal(radar(report, mid, 3)[4].a, mid[0].damage / (11106 / 60));
  assert.equal(
    participation(report, mid[0]),
    ((mid[0].kills + mid[0].assists) / 76) * 100,
  );
  assert.match(settings.headline, /Gen.G 3 : 2 T1/);
  assert.match(
    comparisonScript(report, { ...settings, radarPosition: "3" }),
    /中单.*对位/,
  );
  assert.doesNotMatch(settings.scripts.join(""), /拿下胜利|本局胜者|冠军/);
  assert.ok(
    previewProps(report, settings).captions.some((c) =>
      c.text.includes("系列赛"),
    ),
  );
});
test("partial series expose gaps and tied results; optional missing values never become zero", () => {
  const games = fixtures();
  games[0].players.find((p) => p.name === "Kiin")!.vision = undefined;
  games[0].objectives![1].radiant = undefined;
  const report = summarizeLolSeries([games[0], games[2]]);
  assert.deepEqual(report.series!.missingGames, [2]);
  assert.equal(report.winner, null);
  assert.deepEqual(report.series!.wins, { radiant: 1, dire: 1 });
  assert.equal(
    report.players.find((p) => p.name === "Kiin")!.vision,
    undefined,
  );
  assert.equal(report.objectives![1].radiant, undefined);
  assert.match(defaultSettings(report).scripts[0], /G1 \/ G3 · 缺 G2/);
  const onlyLast = summarizeLolSeries([games[4]]);
  assert.deepEqual(onlyLast.series!.missingGames, [1, 2, 3, 4]);
  assert.match(
    defaultSettings(onlyLast).scripts[0],
    /G5 · 缺 G1 \/ G2 \/ G3 \/ G4/,
  );
});
test("substitutes share role totals but keep individual damage, played time, KP and champion history", () => {
  const games = fixtures();
  const entry = games[1].players.find((p) => p.name === "Faker")!;
  entry.name = "Substitute";
  const report = summarizeLolSeries(games);
  const mid = comparisons(report, defaultSettings(report))[2].pair![1];
  assert.equal(mid.name, "Faker / Substitute");
  assert.equal(mid.playedGames, 5);
  const individuals = sortedDamage(report);
  const sub = individuals.find((p) => p.name === "Substitute")!;
  const faker = individuals.find((p) => p.name === "Faker")!;
  assert.equal(sub.damage, entry.damage);
  assert.equal(sub.playedDuration, games[1].duration);
  assert.equal(
    participation(report, sub),
    ((entry.kills + entry.assists) / 17) * 100,
  );
  assert.equal(faker.playedGames, 4);
  assert.equal(faker.damage + sub.damage, mid.damage);
  assert.equal(
    mid.champions!.reduce((n, c) => n + c.games, 0),
    5,
  );
  assert.equal(
    radar(report, [sub, faker], 3)[4].a,
    sub.damage / (games[1].duration / 60),
  );
});
test("series reject mixed meetings and duplicate games; mode refresh keeps blank captions and BGM", () => {
  const games = fixtures();
  assert.throws(() => summarizeLolSeries([games[0], games[0]]), /不重复/);
  const other = structuredClone(games[1]);
  other.date = "2024-06-14T07:00:00Z";
  assert.throws(() => summarizeLolSeries([games[0], other]), /同一组/);
  const settings = {
    ...defaultSettings(games[0]),
    scripts: ["", "", "", "", ""],
    bgm: { trackId: "a".repeat(64), volume: 0.25, loop: true },
  };
  const next = refreshSettings(summarizeLolSeries(games), settings);
  assert.deepEqual(next.scripts, settings.scripts);
  assert.deepEqual(next.bgm, settings.bgm);
  assert.match(next.headline, /3 : 2/);
});
