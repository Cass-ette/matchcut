import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { championFor, normalizeLol, OracleRow } from "../src/lol";
import sharp from "sharp";
import {
  defaultSettings,
  comparisons,
  radar,
  previewProps,
  assignedPositions,
  settingsSchema,
} from "../src/domain";
import { importLolCsv } from "../server/lol-source";

const fixture = JSON.parse(
  readFileSync("data/fixtures/lol/LOLTMNT02_76148.json", "utf8"),
);
const catalog = JSON.parse(
  readFileSync("data/fixtures/lol/champions.json", "utf8"),
);
const rows = (): OracleRow[] => structuredClone(fixture.rows);
const match = () => normalizeLol(rows(), catalog, fixture.fetchedAt);
test("all catalog champions have decodable local portraits and artwork, including new releases", async () => {
  const entries = Object.values(catalog.data) as {
    id: string;
    key: string;
    name: string;
  }[];
  assert.equal(new Set(entries.map((c) => c.key)).size, entries.length);
  for (const champion of entries) {
    assert.equal(championFor(champion.name, catalog)?.key, champion.key);
    assert.equal(championFor(champion.id, catalog)?.key, champion.key);
    const portrait = await sharp(
      `public/assets/lol/${champion.id}.png`,
    ).metadata();
    const artwork = await sharp(
      `public/assets/lol/${champion.id}.jpg`,
    ).metadata();
    assert.equal(portrait.format, "png", champion.name);
    assert.ok(portrait.width! > 0 && portrait.height! > 0, champion.name);
    assert.equal(artwork.format, "jpeg", champion.name);
    assert.ok(artwork.width! > 0 && artwork.height! > 0, champion.name);
  }
  for (const name of ["Ambessa", "Mel", "Yunara", "Zaahen", "Locke"])
    assert.ok(
      championFor(name, catalog),
      `${name} is missing from the catalog`,
    );
});
const csv = (data: OracleRow[]) => {
  const keys = Object.keys(data[0]);
  const escape = (v: string) => '"' + v.replaceAll('"', '""') + '"';
  return Buffer.from(
    "\uFEFF" +
      keys.map(escape).join(",") +
      "\r\n" +
      data.map((row) => keys.map((k) => escape(row[k])).join(",")).join("\r\n"),
  );
};
test("LoL real snapshot: team result, all five recorded roles, and final objectives", () => {
  const m = match();
  assert.equal(m.id, "lol-LOLTMNT02_76148");
  assert.equal(m.date, "2024-04-14T10:19:15.000Z");
  assert.equal(m.duration, 2524);
  assert.equal(m.winner, "dire");
  assert.deepEqual([m.radiantScore, m.direScore], [2, 15]);
  assert.deepEqual(
    comparisons(m, defaultSettings(m)).map((c) => c.pair?.map((p) => p.name)),
    [
      ["Zeus", "Kiin"],
      ["Oner", "Canyon"],
      ["Faker", "Chovy"],
      ["Gumayusi", "Peyz"],
      ["Keria", "Lehends"],
    ],
  );
  m.players.reverse();
  assert.equal(comparisons(m, defaultSettings(m))[2].pair?.[0].name, "Faker");
  assert.ok(assignedPositions(m).every((p) => p.source === "declared"));
  assert.deepEqual(m.gold, []);
  assert.deepEqual(
    m.objectives?.map((o) => [o.radiant, o.dire]),
    [
      [69709, 81790],
      [1, 5],
      [1, 2],
      [4, 11],
    ],
  );
  const copy = previewProps(m, defaultSettings(m))
    .captions.map((c) => c.text)
    .join(" ");
  assert.doesNotMatch(
    copy,
    /OpenDota|天辉|夜魇|一号位|岗哨|经验|落后|最大领先/,
  );
});
test("LoL ADC keeps damage metrics; support uses vision, not Dota role-four axes", () => {
  const m = match(),
    groups = comparisons(m, defaultSettings(m));
  const adc = radar(m, groups[3].pair!, 4),
    support = radar(m, groups[4].pair!, 5);
  assert.equal(adc[2].a, 19643 / (2524 / 60));
  assert.equal(
    adc[3].a,
    m.players.find((p) => p.name === "Gumayusi")!.lastHits! / (2524 / 60),
  );
  assert.equal(support[2].a, 135);
  assert.equal(support[2].b, 143);
  assert.equal(support[1].a, 100);
  groups[4].pair![0].vision = undefined;
  assert.equal(radar(m, groups[4].pair!, 5)[2].ar, undefined);
  assert.equal(m.players[0].xpm, undefined);
  assert.equal(m.players[0].tower, undefined);
});
test("executions can make team deaths exceed opponent kills", () => {
  const data = rows();
  data[0].deaths = "6";
  data[10].deaths = "16";
  for (const row of data.filter((r) => r.side === "Blue"))
    row.teamdeaths = "16";
  const m = normalizeLol(data, catalog);
  assert.equal(m.players[0].deaths, 6);
  assert.equal(m.direScore, 15);
});
test("LoL rejects contradictory roles, winners and missing required metrics; preserves optional gaps", () => {
  const duplicate = rows();
  duplicate[1].position = "top";
  assert.throws(() => normalizeLol(duplicate, catalog), /重复/);
  const result = rows();
  result[0].result = "1";
  assert.throws(() => normalizeLol(result, catalog), /不一致/);
  const missing = rows();
  missing[0].damagetochampions = "";
  assert.throws(() => normalizeLol(missing, catalog), /damagetochampions/);
  const optional = rows();
  optional[4].visionscore = "";
  optional[10].dragons = "";
  const m = normalizeLol(optional, catalog);
  assert.equal(m.players[4].vision, undefined);
  assert.equal(m.objectives?.[1].radiant, undefined);
  optional[4].visionscore = "0";
  assert.equal(normalizeLol(optional, catalog).players[4].vision, 0);
  assert.doesNotThrow(() =>
    settingsSchema.parse({
      ...defaultSettings(m),
      positionOverrides: { matchId: m.id, roles: { "0": 2, "1": 1 } },
    }),
  );
});
test("CSV ingestion handles BOM, quoted commas/newlines, skipped games, and atomic malformed input", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "matchcut-lol-test-"));
  try {
    const valid = rows();
    valid[0].playername = 'Zeus, "top"\nline';
    const invalid: OracleRow[] = rows().map((r) => ({
      ...r,
      gameid: "INVALID_GAME",
    }));
    invalid[0].damagetochampions = "";
    const result = await importLolCsv(
      csv([...valid, ...invalid]),
      "quoted.csv",
      dir,
    );
    assert.equal(result.imported, 1);
    assert.equal(result.skipped, 1);
    assert.equal(
      JSON.parse(
        readFileSync(path.join(dir, "lol-LOLTMNT02_76148.json"), "utf8"),
      ).rows[0].playername,
      valid[0].playername,
    );
    const before = readFileSync(path.join(dir, "index.json"), "utf8");
    await assert.rejects(
      importLolCsv(
        Buffer.from(csv(valid).toString() + '\r\n"unterminated'),
        "bad.csv",
        dir,
      ),
    );
    assert.equal(readFileSync(path.join(dir, "index.json"), "utf8"), before);
    await assert.rejects(
      importLolCsv(csv([...valid, valid[0]]), "duplicate.csv", dir),
      /重复/,
    );
    assert.ok(!(await readdir(dir)).some((x) => x.startsWith(".import-")));
    await assert.rejects(
      importLolCsv(Buffer.from("name,other\nfoo,bar"), "wrong.csv", dir),
      /缺少必要列/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
