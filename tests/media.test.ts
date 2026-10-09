import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { MediaLibrary } from "../server/media-source";
import { normalizeLol } from "../src/lol";
import { summarizeLolSeries } from "../src/series";
import { defaultSettings, previewProps } from "../src/domain";

async function setup(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), "matchcut-media-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "data/fixtures/lol"), { recursive: true });
  await cp(
    "data/fixtures/lol/champions.json",
    path.join(root, "data/fixtures/lol/champions.json"),
  );
  await cp(
    "data/fixtures/heroes.json",
    path.join(root, "data/fixtures/heroes.json"),
  );
  await cp(
    "data/fixtures/team-logos.json",
    path.join(root, "data/fixtures/team-logos.json"),
  );
  const png = await sharp({
    create: { width: 48, height: 64, channels: 4, background: "#e74055" },
  })
    .png()
    .toBuffer();
  return { root, library: new MediaLibrary(root), png };
}
async function fixtures() {
  const catalog = JSON.parse(
    await readFile("data/fixtures/lol/champions.json", "utf8"),
  );
  const games = [];
  for (const id of [76144, 76145, 76146, 76147, 76148]) {
    const snapshot = JSON.parse(
      await readFile(`data/fixtures/lol/LOLTMNT02_${id}.json`, "utf8"),
    );
    games.push(normalizeLol(snapshot.rows, catalog, snapshot.fetchedAt));
  }
  return games;
}

test("uploads persist, reset restores defaults and leaves historical image files intact", async (t) => {
  const { root, library, png } = await setup(t);
  const team = (await library.list("lol")).find((v) => v.name === "T1")!;
  const uploaded = await library.setImage("lol", team.id, "logo", png);
  assert.match(uploaded.src!, /^\/assets\/library\/[a-f0-9]{64}\.png$/);
  const restarted = new MediaLibrary(root);
  assert.equal(
    (await restarted.list("lol")).find((v) => v.id === team.id)!.images.logo,
    uploaded.src,
  );
  await restarted.setImage("lol", team.id, "logo", null);
  assert.equal(
    (await restarted.list("lol")).find((v) => v.id === team.id)!.images.logo,
    team.defaults.logo,
  );
  assert.ok((await readFile(path.join(root, "public", uploaded.src!))).length);
});

test("aliases absorb discovered names, reject configured collisions, preserve renamed names and stay game-specific", async (t) => {
  const { library, png } = await setup(t);
  const summaries = [{ radiant: "New Club", dire: "NC" }];
  let team = (await library.list("lol", summaries)).find(
    (v) => v.name === "New Club",
  )!;
  await library.saveTeam(
    "lol",
    { name: "New Club", aliases: ["NC"] },
    team.id,
    summaries,
  );
  await library.setImage("lol", team.id, "logo", png, summaries);
  assert.equal(
    (await library.list("lol", summaries)).filter((v) =>
      ["New Club", "NC"].includes(v.name),
    ).length,
    1,
  );
  await library.saveTeam(
    "lol",
    { name: "New Club Esports", aliases: ["NC"] },
    team.id,
    summaries,
  );
  team = (await library.list("lol", summaries)).find((v) => v.id === team.id)!;
  assert.ok(team.aliases.includes("New Club"));
  await assert.rejects(
    library.saveTeam(
      "lol",
      { name: "Different", aliases: ["nc"] },
      undefined,
      summaries,
    ),
    /已被/,
  );
  await assert.rejects(
    library.saveTeam("lol", { name: "GEN", aliases: [] }, undefined, []),
    /已被/,
  );
  const [match] = await fixtures();
  match.radiant = "NC";
  await library.apply(match);
  assert.equal(match.radiantLogo, team.images.logo);
  await library
    .apply({ ...match, game: "dota2", radiantLogo: undefined })
    .then((other) => assert.equal(other.radiantLogo, undefined));
});

test("bad image content and incorrect slots are rejected without touching the registry", async (t) => {
  const { library, png } = await setup(t);
  const team = (await library.list("lol")).find((v) => v.name === "T1")!;
  for (const invalid of [
    Buffer.from("not an image"),
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="50" height="50"/></svg>',
    ),
    png.subarray(0, 35),
  ]) {
    await assert.rejects(
      library.setImage("lol", team.id, "logo", invalid),
      /无法读取/,
    );
  }
  await assert.rejects(
    library.setImage("lol", team.id, "portrait", png),
    /位置/,
  );
  await assert.rejects(library.setImage("dota2", team.id, "logo", png), /位置/);
  assert.deepEqual(
    (await library.list("lol")).find((v) => v.id === team.id)!.overrides,
    [],
  );
});

test("concurrent uploads and team edits keep each other; unreadable registries are not overwritten", async (t) => {
  const { root, library, png } = await setup(t);
  const hero = (await library.list("lol")).find((v) => v.kind === "hero")!;
  await Promise.all([
    library.setImage("lol", hero.id, "portrait", png),
    library.setImage("lol", hero.id, "artwork", png),
    library.saveTeam("lol", { name: "Test Club", aliases: [] }, undefined, []),
  ]);
  const items = await library.list("lol");
  assert.equal(items.find((v) => v.id === hero.id)!.overrides.length, 2);
  assert.ok(items.find((v) => v.name === "Test Club"));
  await writeFile(
    path.join(root, "data/media-library.json"),
    "broken registry",
  );
  await assert.rejects(
    library.saveTeam(
      "lol",
      { name: "Do not overwrite", aliases: [] },
      undefined,
      [],
    ),
    /素材库读取失败/,
  );
  assert.equal(
    await readFile(path.join(root, "data/media-library.json"), "utf8"),
    "broken registry",
  );
});

test("single-game and BO5 props share uploaded portraits, artwork and team logos across side swaps", async (t) => {
  const { library, png } = await setup(t);
  const games = await fixtures();
  const items = await library.list("lol");
  const team = items.find((v) => v.name === "T1")!;
  const logo = (await library.setImage("lol", team.id, "logo", png)).src;
  const heroId = games[0].players.find((p) => p.name === "Faker")!.heroId;
  const hero = items.find((v) => v.heroId === heroId)!;
  const portrait = (await library.setImage("lol", hero.id, "portrait", png))
    .src;
  const artwork = (await library.setImage("lol", hero.id, "artwork", png)).src;
  for (const game of games) {
    await library.apply(game);
    assert.equal(
      game[game.radiant === "T1" ? "radiantLogo" : "direLogo"],
      logo,
    );
    for (const player of game.players.filter((p) => p.heroId === heroId)) {
      assert.equal(player.image, portrait);
      assert.equal(player.artwork, artwork);
    }
  }
  const report = summarizeLolSeries([...games].reverse());
  assert.equal(report.dire, "T1");
  assert.equal(report.direLogo, logo);
  assert.ok(
    report.players.some((p) => p.champions?.some((c) => c.image === portrait)),
  );
  const props = previewProps(report, defaultSettings(report));
  assert.equal(props.match.direLogo, logo);
  assert.ok(JSON.stringify(props.match).includes(portrait!));
});
