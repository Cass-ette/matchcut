import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  copyFile,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { normalizeCs, type CsSnapshot, type CsRaw } from "../src/cs";
import {
  assignedPositions,
  comparisons,
  assertComparisons,
  defaultSettings,
  radar,
  rankedPlayers,
  csPlayerOrder,
  refreshSettings,
  settingsSchema,
  previewProps,
  sceneNames,
  sceneSlots,
} from "../src/domain";
import { CsLibrary } from "../server/cs-source";
import { MediaLibrary } from "../server/media-source";
import { LogoCatalog } from "../server/logo-catalog";

const sample: CsSnapshot & { raw: CsRaw } = JSON.parse(
  await readFile("data/fixtures/cs/monte-og-anubis.json", "utf8"),
);
const snapshot = () => structuredClone(sample);

test("real CS2 snapshot: round score, side swaps, precise Steam IDs and CS metrics", () => {
  const m = normalizeCs(snapshot());
  assert.deepEqual(
    [m.radiant, m.dire, m.radiantScore, m.direScore, m.winner],
    ["OG Esports", "Monte", 7, 13, "dire"],
  );
  assert.equal(m.cs!.rounds.length, 20);
  assert.equal(m.cs!.rounds[0].radiantSide, "CT");
  assert.equal(m.cs!.rounds[12].radiantSide, "T");
  assert.equal(
    m.date,
    "",
    "demo filesystem timestamp must not become the match date",
  );
  const p = m.players.find((p) => p.name === "Woro2k")!;
  assert.deepEqual(
    [p.steamId, p.kills, p.deaths, p.assists, p.cs!.adr],
    ["76561198975452660", 25, 9, 1, 1899 / 20],
  );
  assert.equal(
    m.players.find((p) => p.name === "FASHR")!.steamId,
    "76561197963504595",
  );
  assert.equal(p.gpm, undefined);
  assert.equal(p.declaredPosition, undefined);
  assert.equal(m.gold.length, 0);
  const settings = defaultSettings(m);
  settings.scripts[1] = "旧项目里的回合走势文案";
  const props = previewProps(m, settings);
  assert.deepEqual(sceneSlots(m), [0, 2, 3, 4]);
  assert.equal(sceneNames(m).length, 4);
  assert.deepEqual(props.segments[1], { text: "", frames: 0 });
  assert.ok(props.captions.every((c) => !c.text.includes("回合走势")));
  assert.equal(settings.radarMode, "ranked");
  const groups = comparisons(m, settings);
  assert.deepEqual(
    groups[0].pair!.map((p) => p.name),
    ["k1to", "Woro2k"],
  );
  assert.deepEqual(
    radar(m, groups[0].pair!).map((a) => a.label),
    ["击杀", "ADR", "KAST", "爆头率", "首杀", "道具伤害"],
  );
  assert.equal(rankedPlayers(m)[0].name, "Woro2k");
  assert.match(settings.scripts[3], /Woro2k.*25/);
});

test("CS ranking compares kills descending, deaths ascending, assists descending, never damage", () => {
  const base = normalizeCs(snapshot()).players[0];
  const players = [
    {
      ...base,
      name: "less-assists",
      kills: 20,
      deaths: 10,
      assists: 2,
      damage: 99999,
    },
    { ...base, name: "more-deaths", kills: 20, deaths: 11, assists: 20 },
    { ...base, name: "more-kills", kills: 21, deaths: 20, assists: 0 },
    {
      ...base,
      name: "more-assists",
      kills: 20,
      deaths: 10,
      assists: 3,
      damage: 1,
    },
  ];
  assert.deepEqual(
    players.sort(csPlayerOrder).map((p) => p.name),
    ["more-kills", "more-assists", "less-assists", "more-deaths"],
  );
});

test("CS positions are manual, round-trip in projects and never guessed from rank", () => {
  const m = normalizeCs(snapshot());
  const settings = { ...defaultSettings(m), radarMode: "positions" as const };
  assert.ok(
    assignedPositions(m, settings).every((p) => p.source === "unknown"),
  );
  assert.throws(() => assertComparisons(m, settings), /对位不完整/);
  const roles = Object.fromEntries(
    m.players.map((p) => [p.slot, (p.slot % 128) + 1]),
  );
  const manual = settingsSchema.parse(
    JSON.parse(
      JSON.stringify({
        ...settings,
        positionOverrides: { matchId: m.id, roles },
      }),
    ),
  );
  assert.doesNotThrow(() => assertComparisons(m, manual));
  assert.deepEqual(
    comparisons(m, manual).map((c) => c.label),
    ["狙击手", "突破手", "自由人", "辅助", "指挥"],
  );
  assert.ok(assignedPositions(m, manual).every((p) => p.source === "manual"));
  assert.equal(
    refreshSettings({ ...m, id: "cs2-another" }, manual).positionOverrides,
    undefined,
  );
  manual.positionOverrides!.roles[1] = 1;
  assert.throws(() => assertComparisons(m, manual), /对位不完整/);
});

test("CS rejects incomplete and contradictory demos, preserves optional missing statistics", () => {
  for (const mutate of [
    (s: typeof sample) => s.raw.rounds.splice(3, 1),
    (s: typeof sample) => s.raw.teamB.score++,
    (s: typeof sample) => {
      s.raw.winner = s.raw.teamA;
    },
    (s: typeof sample) => {
      s.raw.rounds[13].teamAName = "Monte";
    },
    (s: typeof sample) => {
      delete s.raw.players[Object.keys(s.raw.players)[0]];
    },
    (s: typeof sample) => {
      s.raw.maxRounds = 30;
    },
    (s: typeof sample) => {
      s.raw.players[Object.keys(s.raw.players)[0]].healthDamage = -1;
    },
  ]) {
    const s = snapshot();
    mutate(s);
    assert.throws(() => normalizeCs(s));
  }
  const s = snapshot();
  for (const p of Object.values(s.raw.players)) {
    delete p.kast;
    delete p.utilityDamage;
    delete p.headshotCount;
  }
  const m = normalizeCs(s);
  const axes = radar(m, comparisons(m, defaultSettings(m))[0].pair!);
  for (const index of [2, 3, 5]) {
    assert.equal(axes[index].a, undefined);
    assert.equal(axes[index].ar, undefined);
  }
});

test("MR3 overtime keeps team identity and requires a finished score", () => {
  const s = snapshot();
  const template = s.raw.rounds[0];
  let a = 0,
    b = 0;
  s.raw.rounds = Array.from({ length: 30 }, (_, i) => {
    const winA = i < 24 ? i % 2 === 0 : [24, 26, 27, 29].includes(i);
    winA ? a++ : b++;
    const aSide = i < 12 || (i >= 24 && i < 27) ? 3 : 2;
    return {
      ...template,
      number: i + 1,
      teamAScore: a,
      teamBScore: b,
      teamASide: aSide,
      teamBSide: aSide === 3 ? 2 : 3,
      winnerSide: winA ? aSide : aSide === 3 ? 2 : 3,
      winnerName: winA ? s.raw.teamA.name : s.raw.teamB.name,
      overtimeNumber: i < 24 ? 0 : 1,
    };
  });
  s.raw.teamA.score = 16;
  s.raw.teamB.score = 14;
  s.raw.winner = s.raw.teamA;
  for (const p of Object.values(s.raw.players))
    p.team.score = p.team.letter === "A" ? 16 : 14;
  const m = normalizeCs(s);
  assert.equal(m.cs!.rounds[27].radiantSide, "T");
  assert.equal(m.winner, "radiant");
  assert.equal(m.players[0].cs!.adr, m.players[0].damage / 30);
});

test("streaming demo import is atomic, deduplicated, rejects invalid files and stores exact source", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "matchcut-cs-test-"));
  try {
    await mkdir(path.join(root, "data/fixtures/cs"), { recursive: true });
    await copyFile(
      "data/fixtures/cs/monte-og-anubis.json",
      path.join(root, "data/fixtures/cs/monte-og-anubis.json"),
    );
    let calls = 0;
    const library = new CsLibrary(root, async () => {
      calls++;
      return snapshot().raw;
    });
    const bytes = Buffer.from("PBDEMS2\0test-demo-fixture");
    await assert.rejects(
      library.importDemo(
        Readable.from([Buffer.from("not a demo at all")]),
        "bad.dem",
      ),
      /有效/,
    );
    assert.deepEqual(await readdir(path.join(root, "data/cache/cs")), []);
    const imported = await library.importDemo(
      Readable.from([bytes.subarray(0, 3), bytes.subarray(3)]),
      "比赛 `literal` $name.dem",
    );
    assert.match(imported.id, /^cs2-[a-f0-9]{64}$/);
    assert.equal(imported.cached, false);
    assert.deepEqual(
      await readFile(
        path.join(root, "data/cache/cs", imported.id, "match.dem"),
      ),
      bytes,
    );
    assert.equal(
      (await library.load(imported.id)).raw.filename,
      "比赛 `literal` $name.dem",
    );
    assert.equal(
      (await library.importDemo(Readable.from([bytes]), "again.dem")).cached,
      true,
    );
    assert.equal(calls, 1);
    assert.equal((await library.list()).length, 2);
    const failing = new CsLibrary(root, async () => {
      throw new Error("解析失败");
    });
    await assert.rejects(
      failing.importDemo(
        Readable.from([Buffer.concat([bytes, Buffer.from("extra")])]),
        "other.dem",
      ),
      /解析失败/,
    );
    assert.deepEqual(await readdir(path.join(root, "data/cache/cs")), [
      imported.id,
    ]);
    const media = new MediaLibrary(
      root,
      new LogoCatalog(root, async () => {
        throw new Error("offline");
      }),
    );
    const summaries = await library.list();
    const items = await media.list("cs2", summaries);
    assert.equal(items.filter((i) => i.kind === "player").length, 10);
    assert.equal(items.filter((i) => i.kind === "hero").length, 0);
    const item = items.find((i) => i.kind === "player" && i.name === "Woro2k")!;
    const png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    await media.setImage("cs2", item.id, "portrait", png, summaries);
    const m = (await library.load(imported.id)).match;
    await media.apply(m);
    assert.match(
      m.players.find((p) => p.name === "Woro2k")!.playerImage!,
      /^\/assets\/library\//,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
