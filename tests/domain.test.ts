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
  for (const axis of r) assert.equal(Math.max(axis.ar, axis.br), 1);
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
  assert.ok(total >= 30 * 30 && total < 90 * 30);
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
