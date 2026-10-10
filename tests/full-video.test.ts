import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeLol } from "../src/lol";
import { summarizeLolSeries } from "../src/series";
import {
  defaultSettings,
  previewProps,
  totalFrames,
  videoScenes,
  srt,
  settingsSchema,
  type ReportData,
} from "../src/domain";

function fixture(numbers = [76144, 76145, 76146]): ReportData {
  const catalog = JSON.parse(
    readFileSync("data/fixtures/lol/champions.json", "utf8"),
  );
  const games = numbers.map((id) => {
    const raw = JSON.parse(
      readFileSync(`data/fixtures/lol/LOLTMNT02_${id}.json`, "utf8"),
    );
    return normalizeLol(raw.rows, catalog, raw.fetchedAt);
  });
  return { ...summarizeLolSeries(games), fullGames: games.reverse() };
}

test("full film orders all source games, opens and closes once, and omits repeated bookends", () => {
  const match = fixture();
  const props = previewProps(match, defaultSettings(match));
  const scenes = videoScenes(props);
  assert.deepEqual(
    props.chapters!.map((c) => c.label),
    ["开场", "G1", "G2", "G3", "系列赛汇总"],
  );
  assert.equal(scenes.length, 18);
  assert.equal(scenes.filter((s) => s.slot === 0).length, 1);
  assert.equal(scenes.filter((s) => s.slot === 4).length, 1);
  assert.deepEqual(
    scenes
      .filter((s) => s.slot === 2)
      .map((s) => s.match.gameNumber ?? "summary"),
    [1, 2, 3, "summary"],
  );
  const naive = [match, ...match.fullGames!].reduce(
    (n, m) =>
      n +
      totalFrames(
        previewProps({ ...m, fullGames: undefined }, defaultSettings(m))
          .segments,
      ),
    0,
  );
  assert.ok(totalFrames(props.segments) < naive);
  assert.equal(
    scenes.at(-1)!.from + scenes.at(-1)!.frames,
    totalFrames(props.segments),
  );
});

test("each chapter retains its own champions, statistics and loadouts, with colors following teams", () => {
  const match = fixture();
  const game = match.fullGames![0];
  game.players[0].lolLoadout = { spells: [null, null] };
  const settings = defaultSettings(match);
  const props = previewProps(match, settings);
  for (const chapter of props.chapters!.filter((c) => !c.match.series)) {
    const raw = match.fullGames!.find((g) => g.id === chapter.match.id)!;
    assert.deepEqual(chapter.match.players, raw.players);
    const sameSide = raw.radiant === match.radiant;
    assert.equal(
      chapter.settings.accent,
      sameSide ? settings.accent : settings.secondary,
    );
    assert.equal(
      chapter.settings.secondary,
      sameSide ? settings.secondary : settings.accent,
    );
  }
  assert.ok(
    props
      .chapters!.at(-1)!
      .match.players.every((p) => !p.lolLoadout && !p.inventory),
  );
  assert.deepEqual(props.chapters!.at(-1)!.match.series, match.series);
});

test("captions, per-game copy and scene-local timing survive flattening and project settings roundtrip", () => {
  const match = fixture();
  const settings = defaultSettings(match);
  const g2 = match.fullGames!.find((g) => g.gameNumber === 2)!;
  settings.gameScripts = {
    [g2.id]: defaultSettings(g2).scripts.map((s, i) =>
      i === 1 ? "第二局独立文案" : s,
    ),
  };
  const music = {
    id: "a".repeat(64),
    name: "test",
    duration: 30,
    src: "/bgm/test.mp3",
    createdAt: "",
  };
  settings.bgm = { trackId: music.id, volume: 0.3, loop: true };
  const props = previewProps(
    match,
    settingsSchema.parse(JSON.parse(JSON.stringify(settings))),
    music,
  );
  assert.equal(props.bgmTrack, music);
  assert.ok(props.chapters!.every((c) => !("bgmTrack" in c)));
  for (const scene of videoScenes(props)) {
    const chapter = scene.chapter!;
    const start = totalFrames(chapter.segments.slice(0, scene.slot));
    const expected = chapter.captions
      .filter((c) => c.start >= start && c.end <= start + scene.frames)
      .map((c) => ({
        ...c,
        start: c.start - start + scene.from,
        end: c.end - start + scene.from,
      }));
    assert.deepEqual(
      props.captions.filter(
        (c) => c.start >= scene.from && c.end <= scene.from + scene.frames,
      ),
      expected,
    );
  }
  assert.equal(
    props.captions.filter((c) => c.text === "第二局独立文案").length,
    1,
  );
  assert.match(srt(props.captions), /第二局独立文案/);
  assert.ok(
    props.captions.every(
      (c, i) => c.end > c.start && (!i || c.start >= props.captions[i - 1].end),
    ),
  );
});

test("one recorded game removes aggregate duplication; partial and malformed archives stay explicit", () => {
  const single = fixture([76145]);
  const props = previewProps(single, defaultSettings(single));
  assert.equal(props.chapters!.length, 1);
  assert.deepEqual(props.chapters![0].slots, [0, 1, 2, 3, 5, 4]);
  assert.equal(props.chapters![0].match.series, undefined);
  const partial = fixture([76144, 76146]);
  assert.deepEqual(partial.series!.missingGames, [2]);
  assert.deepEqual(
    previewProps(partial, defaultSettings(partial)).chapters!.map(
      (c) => c.label,
    ),
    ["开场", "G1", "G3", "系列赛汇总"],
  );
  partial.fullGames!.pop();
  assert.throws(
    () => previewProps(partial, defaultSettings(partial)),
    /缺少逐局数据/,
  );
});

test("full videos put an MVP after each game's complete damage ranking, never in the series aggregate", () => {
  const match = fixture();
  const settings = defaultSettings(match);
  settings.mvp = { enabled: true, mode: "manual", manual: {} };
  for (const game of match.fullGames!)
    settings.mvp.manual[game.id] = game.players[0].slot;
  const props = previewProps(match, settings);
  const games = props.chapters!.filter((chapter) => !chapter.match.series);
  assert.ok(games.every((chapter) => chapter.slots.at(-1) === 6));
  assert.deepEqual(props.chapters!.at(-1)!.slots, [1, 2, 3, 5, 4]);
  assert.equal(
    videoScenes(props).filter((scene) => scene.slot === 6).length,
    3,
  );
});
