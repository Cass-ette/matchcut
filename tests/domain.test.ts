import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  captionLines,
  defaultSettings,
  facts,
  getFocus,
  normalizeMatch,
  previewProps,
  radar,
  srt,
  totalFrames,
  settingsSchema,
  assignedPositions,
  comparisons,
  assertComparisons,
  refreshSettings,
  comparisonScript,
} from "../src/domain";
const fixture = JSON.parse(
  readFileSync("data/fixtures/9035078952.json", "utf8"),
);
const heroes = JSON.parse(readFileSync("data/fixtures/heroes.json", "utf8"));
const raw = () => structuredClone(fixture.raw);
const match = () => normalizeMatch(raw(), heroes, fixture.fetchedAt);

test("real provider snapshot: correct winner, opposing focus players, economy times and values", () => {
  const m = match(),
    f = facts(m),
    focus = getFocus(m);
  assert.equal(m.id, "9035078952");
  assert.equal(m.winner, "radiant");
  assert.equal(m.duration, 3244);
  assert.equal(m.players.length, 10);
  assert.equal(m.gold.at(-1)?.minute, 54);
  assert.equal(f.max.value, 9383);
  assert.equal(f.min.value, -5782);
  assert.equal(f.final.value, 6935);
  assert.equal(f.top.name, "Pure");
  assert.equal(focus[0].name, "skiter");
  assert.equal(focus[1].name, "Pure");
});
test("winner comes from result, not kill count", () => {
  const r = raw();
  r.radiant_score = 1;
  r.dire_score = 100;
  assert.equal(facts(normalizeMatch(r, heroes)).winner, "Aurora Gaming");
});
test("missing parsed statistics fail explicitly; legitimate zero remains zero", () => {
  const r = raw();
  r.players[0].tower_damage = null;
  assert.throws(() => normalizeMatch(r, heroes), /建筑伤害/);
  r.players[0].tower_damage = 0;
  assert.equal(normalizeMatch(r, heroes).players[0].tower, 0);
  r.radiant_gold_adv = null;
  assert.throws(() => normalizeMatch(r, heroes), /解析/);
});
test("mismatched and non-monotonic time series are rejected instead of mislabelled", () => {
  const r = raw();
  r.players[0].times.pop();
  assert.throws(() => normalizeMatch(r, heroes), /时间轴不匹配/);
  const bad = raw();
  bad.players[0].times[4] = 0;
  assert.throws(() => normalizeMatch(bad, heroes), /时间轴无效/);
});
test("duplicate player slots cannot count a player twice", () => {
  const r = raw();
  r.players[1].player_slot = r.players[0].player_slot;
  assert.throws(() => normalizeMatch(r, heroes), /重复/);
});
test("radar rates use full match duration and zero axes stay finite", () => {
  const m = match(),
    r = radar(m);
  assert.equal(r[4].a, 52413 / (3244 / 60));
  for (const axis of r) assert.equal(Math.max(axis.ar!, axis.br!), 1);
  for (const p of m.players) {
    p.tower = 0;
    p.assists = 0;
  }
  for (const axis of radar(m)) {
    assert.ok(Number.isFinite(axis.ar));
    assert.ok(Number.isFinite(axis.br));
  }
  assert.equal(radar(m)[5].ar, 0);
});
test("silent captions have valid intervals within the film and readable scene lengths", () => {
  const m = match(),
    settings = defaultSettings(m),
    p = previewProps(m, settings),
    total = totalFrames(p.segments);
  assert.ok(total >= 120 * 30 && total < 180 * 30);
  assert.ok(!("voice" in settings));
  assert.ok(!("music" in settings));
  assert.ok(p.segments.every((s) => !("audio" in s)));
  p.captions.forEach((c, i) => {
    assert.ok(c.end > c.start);
    assert.ok(c.end <= total);
    if (i) assert.ok(c.start >= p.captions[i - 1].end);
  });
  assert.match(srt(p.captions), /^1\n00:00:00,267 --> /);
  const slow = previewProps(m, { ...settings, pace: "relaxed" });
  assert.ok(totalFrames(slow.segments) > total);
});
test("position matchups use provider estimates, never player slots or damage order", () => {
  const m = match(),
    s = defaultSettings(m);
  assert.equal(s.radarMode, "positions");
  assert.equal(s.radarPosition, "all");
  assert.deepEqual(
    comparisons(m, s).map((c) => c.pair?.map((p) => p.name)),
    [
      ["skiter", "Pure"],
      ["Mikoto", "bzm"],
      ["Ws`", "33"],
      ["Mira", "Ari"],
      ["kaori", "Whitemon"],
    ],
  );
  for (const player of m.players)
    player.damage = player.slot === 130 ? 999999 : 1;
  m.players.reverse();
  assert.deepEqual(
    comparisons(m, s).map((c) => c.pair?.[1].name),
    ["Pure", "bzm", "33", "Ari", "Whitemon"],
  );
  assert.equal(
    comparisons(m, { ...s, radarMode: "damage" })[0].pair?.[1].name,
    "Whitemon",
  );
});
test("missing or duplicate position estimates stay unresolved and block role export", () => {
  const m = match(),
    s = defaultSettings(m);
  m.players[0].positionEstimate = undefined;
  assert.equal(comparisons(m, s)[0].pair, undefined);
  assert.throws(() => assertComparisons(m, s), /一号位.*对位不完整/);
  m.players[0].positionEstimate = 2;
  assert.equal(
    assignedPositions(m, s).filter(
      (x) => x.player.side === "radiant" && x.position === 2,
    ).length,
    0,
  );
  assert.doesNotThrow(() => assertComparisons(m, { ...s, radarPosition: "3" }));
  assert.doesNotThrow(() =>
    assertComparisons(m, { ...s, radarMode: "damage" }),
  );
});
test("manual positions apply to the matching game only and survive project parsing", () => {
  const m = match();
  const s = settingsSchema.parse({
    ...defaultSettings(m),
    positionOverrides: { matchId: m.id, roles: { "0": 2, "1": 1 } },
  });
  assert.equal(comparisons(m, s)[0].pair?.[0].name, "Mikoto");
  assert.match(comparisons(m, s)[0].provenance, /手动指定/);
  assert.equal(refreshSettings(m, s, true).positionOverrides?.roles["0"], 2);
  assert.equal(refreshSettings(m, s).positionOverrides, undefined);
  assert.equal(
    comparisons({ ...m, id: "9999999999" }, s)[0].pair?.[0].name,
    "skiter",
  );
  const refreshed = refreshSettings(m, { ...s, radarMode: "damage" });
  assert.match(refreshed.scripts[2], /伤害最高/);
  assert.equal(refreshed.radarMode, "damage");
});
test("support axes reflect support statistics and do not invent missing values", () => {
  const m = match(),
    s = defaultSettings(m),
    c = comparisons(m, s)[4];
  const axes = radar(m, c.pair!, c.position);
  assert.deepEqual(
    axes.map((a) => a.label),
    [
      "助攻 / AST",
      "参战率 / KP",
      "观察守卫",
      "岗哨守卫",
      "眩晕时长",
      "英雄治疗",
    ],
  );
  assert.equal(axes[2].a, 16);
  assert.equal(axes[3].b, 34);
  assert.equal(axes[5].a, 21292);
  c.pair![0].healing = undefined;
  assert.equal(radar(m, c.pair!, c.position)[5].a, undefined);
  assert.equal(radar(m, c.pair!, c.position)[5].br, undefined);
  c.pair![0].healing = 0;
  assert.equal(radar(m, c.pair!, c.position)[5].ar, 0);
});
test("five matchup chapters get full reading time and correctly scoped captions", () => {
  const m = match(),
    s = defaultSettings(m),
    props = previewProps(m, s);
  assert.equal(props.segments[2].frames, 90 * 30);
  const radarStart = props.segments[0].frames + props.segments[1].frames;
  const names = [
    "skiter vs Pure",
    "Mikoto vs bzm",
    "Ws` vs 33",
    "Mira vs Ari",
    "kaori vs Whitemon",
  ];
  names.forEach((name, i) =>
    assert.ok(
      props.captions.some(
        (c) =>
          c.text.includes(name) &&
          c.start >= radarStart + i * 18 * 30 &&
          c.end <= radarStart + (i + 1) * 18 * 30,
      ),
    ),
  );
  const single = { ...s, radarPosition: "4" as const };
  single.scripts = [...s.scripts];
  single.scripts[2] = comparisonScript(m, single);
  assert.equal(previewProps(m, single).segments[2].frames, 24 * 30);
});
test("subtitle wrapping never splits a score, a thousands-grouped value, or a Latin word", () => {
  const radarSentence = "skiter 与 Pure：双方伤害最高选手的本场对比。";
  assert.deepEqual(captionLines(radarSentence), [radarSentence]);
  const lines = captionLines(
    "54:04，Aurora Gaming 获胜。天辉最大领先 9,383，Pure 打出 55,502 点英雄伤害。",
  );
  for (const token of ["54:04", "Aurora", "Gaming", "9,383", "55,502"])
    assert.ok(
      lines.some((line) => line.includes(token)),
      token,
    );
});
