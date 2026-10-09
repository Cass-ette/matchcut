import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { MediaLibrary, playerMediaId } from "../server/media-source";
import { localStore } from "../server/local-store";
import { normalizeLol } from "../src/lol";
import { summarizeLolSeries } from "../src/series";
import {
  defaultSettings,
  previewProps,
  normalizeMatch,
  settingsSchema,
} from "../src/domain";

async function setup(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), "matchcut-media-"));
  t.after(async () => {
    localStore(root).close();
    await rm(root, { recursive: true, force: true });
  });
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

test("independent player catalog includes missing photos and survives transfers without nickname matching", async (t) => {
  const { root, library } = await setup(t);
  await writeFile(
    path.join(root, "data/fixtures/lol/players.json"),
    JSON.stringify({
      players: [
        {
          playerId: "oe:person:one",
          name: "SameName",
          aliases: ["FormerName"],
        },
        { playerId: "oe:person:two", name: "SameName", aliases: [] },
      ],
    }),
  );
  await writeFile(
    path.join(root, "data/fixtures/player-photos.json"),
    JSON.stringify([
      {
        game: "lol",
        playerId: "oe:person:one",
        name: "SameName",
        artwork: "/assets/players/one.png",
        source: {
          name: "SameName",
          provider: "LPL official",
          pageUrl: "https://lpl.qq.com/",
          imageUrl: "https://lpl.qq.com/one.png",
        },
      },
    ]),
  );
  const summaries = ["Previous Team", "New Team"].map((team) => ({
    radiant: team,
    dire: "Opponent",
    players: [{ playerId: "oe:person:one", name: "NewName", team }],
  }));
  const players = (await library.list("lol", summaries)).filter(
    (item) => item.kind === "player",
  );
  assert.equal(players.length, 2);
  const one = players.find(
    (p) => p.id === playerMediaId("lol", { playerId: "oe:person:one" }),
  )!;
  assert.equal(one.images.artwork, "/assets/players/one.png");
  assert.ok(one.aliases.includes("FormerName"));
  assert.equal(players.find((p) => p.id !== one.id)!.images.artwork, undefined);
  assert.equal(
    (await library.list("cs2")).filter((p) => p.kind === "player").length,
    0,
  );
});

test("team logo review distinguishes ambiguous and missing images and clears after an explicit choice", async (t) => {
  const { root, library, png } = await setup(t);
  await writeFile(
    path.join(root, "data/fixtures/logo-catalog.json"),
    JSON.stringify({
      fetchedAt: "2026-10-09",
      logos: [
        {
          game: "lol",
          name: "same club",
          path: "league-of-legends/same-club/one.png",
          sha: "a".repeat(40),
        },
        {
          game: "lol",
          name: "same club",
          path: "league-of-legends/same-club/two.png",
          sha: "b".repeat(40),
        },
      ],
    }),
  );
  const summaries = [{ radiant: "Same Club", dire: "New Club" }];
  const items = await library.list("lol", summaries);
  const ambiguous = items.find((t) => t.name === "Same Club")!;
  assert.equal(ambiguous.logoReview, "ambiguous");
  assert.equal(items.find((t) => t.name === "New Club")!.logoReview, "missing");
  assert.equal(items.find((t) => t.name === "T1")!.logoReview, undefined);
  await library.setImage("lol", ambiguous.id, "logo", png, summaries);
  assert.equal(
    (await library.list("lol", summaries)).find((t) => t.id === ambiguous.id)!
      .logoReview,
    undefined,
  );
  await library.setImage("lol", ambiguous.id, "logo", null, summaries);
  assert.equal(
    (await library.list("lol", summaries)).find((t) => t.id === ambiguous.id)!
      .logoReview,
    "ambiguous",
  );
});

test("player photos follow stable identities across heroes, teams and series; never leak to another player or game", async (t) => {
  const { root, library, png } = await setup(t);
  const games = await fixtures();
  const summaries = games.map((g) => ({
    radiant: g.radiant,
    dire: g.dire,
    players: g.players.map((p) => ({
      playerId: p.playerId,
      name: p.name,
      team: g[p.side],
    })),
  }));
  const players = (await library.list("lol", summaries)).filter(
    (i) => i.kind === "player",
  );
  assert.equal(players.length, 10);
  const faker = players.find((p) => p.name === "Faker")!;
  const photo = await library.setImage(
    "lol",
    faker.id,
    "artwork",
    png,
    summaries,
  );
  const heroImages = games.map(
    (g) => g.players.find((p) => p.name === "Faker")!.image,
  );
  for (const g of games) await library.apply(g);
  for (const [i, g] of games.entries()) {
    const p = g.players.find((p) => p.name === "Faker")!;
    assert.equal(p.playerArtwork, photo.src);
    assert.equal(p.image, heroImages[i]);
    assert.ok(
      g.players
        .filter((p) => p.name !== "Faker")
        .every((p) => !p.playerArtwork),
    );
  }
  const series = summarizeLolSeries(games);
  assert.equal(
    series.players.find((p) => p.name === "Faker")!.playerArtwork,
    photo.src,
  );
  assert.equal(
    series.series!.players.find((p) => p.name === "Faker")!.playerArtwork,
    photo.src,
  );
  const substitute = games[1].players.find((p) => p.name === "Faker")!;
  substitute.playerId = "different-person";
  substitute.name = "Substitute";
  await library.apply(games[1]);
  assert.equal(substitute.playerArtwork, undefined);
  assert.equal(
    summarizeLolSeries(games).players.find((p) =>
      p.name.includes("Substitute"),
    )!.playerArtwork,
    undefined,
  );
  const sameName = structuredClone(games[0]);
  sameName.players.find((p) => p.name === "Faker")!.playerId =
    "unrelated-same-name";
  await library.apply(sameName);
  assert.equal(
    sameName.players.find((p) => p.name === "Faker")!.playerArtwork,
    undefined,
  );
  sameName.game = "dota2";
  sameName.players[0].playerId = games[0].players.find(
    (p) => p.name === "Faker",
  )!.playerId;
  await library.apply(sameName);
  assert.equal(sameName.players[0].playerArtwork, undefined);
  const saved = settingsSchema.parse({
    ...defaultSettings(games[0]),
    playerVisual: "photo",
  });
  assert.equal(
    settingsSchema.parse(JSON.parse(JSON.stringify(saved))).playerVisual,
    "photo",
  );
  const restarted = new MediaLibrary(root);
  assert.equal(
    (await restarted.list("lol")).find((i) => i.id === faker.id)!.images
      .artwork,
    photo.src,
  );
  await restarted.setImage("lol", faker.id, "artwork", null);
  await restarted.apply(games[0]);
  assert.equal(
    games[0].players.find((p) => p.name === "Faker")!.playerArtwork,
    undefined,
  );
  assert.ok((await readFile(path.join(root, "public", photo.src!))).length);

  const { raw, fetchedAt } = JSON.parse(
    await readFile("data/fixtures/9035078952.json", "utf8"),
  );
  const heroes = JSON.parse(
    await readFile("data/fixtures/heroes.json", "utf8"),
  );
  const dota = normalizeMatch(raw, heroes, fetchedAt);
  const id = playerMediaId("dota2", dota.players[0])!;
  await library.setImage("dota2", id, "portrait", png, [dota]);
  await library.apply(dota);
  assert.match(dota.players[0].playerImage!, /^\/assets\/library\//);
  assert.match(dota.players[0].image, /^\/assets\/heroes\//);
});

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
  const source = {
    name: "t1",
    path: "league-of-legends/t1/t1-logo.png",
    url: "https://github.com/lootmarket/esport-team-logos/blob/master/league-of-legends/t1/t1-logo.png",
  };
  await restarted.setImage("lol", team.id, "logo", png, [], source);
  await restarted.saveTeam(
    "lol",
    { name: team.name, aliases: ["T1 esports"] },
    team.id,
    [],
  );
  assert.deepEqual(
    (await new MediaLibrary(root).list("lol")).find((v) => v.id === team.id)!
      .logoSource,
    source,
  );
  await restarted.setImage("lol", team.id, "logo", png);
  assert.equal(
    (await restarted.list("lol")).find((v) => v.id === team.id)!.logoSource,
    undefined,
  );
});

test("case-insensitive automatic defaults become local video assets; custom images win and reset returns to automatic", async (t) => {
  const { root, library, png } = await setup(t);
  const sha = "a".repeat(40);
  await writeFile(
    path.join(root, "data/fixtures/logo-catalog.json"),
    JSON.stringify({
      fetchedAt: "2026-10-09",
      logos: [
        {
          game: "lol",
          name: "mixed case club",
          path: "league-of-legends/mixed-case-club/logo.png",
          sha,
        },
      ],
    }),
  );
  await mkdir(path.join(root, "data/cache/logo-catalog/images"), {
    recursive: true,
  });
  await writeFile(
    path.join(root, "data/cache/logo-catalog/images", sha + ".png"),
    png,
  );
  const summaries = [{ radiant: "MiXeD Case Club", dire: "T1" }];
  const item = (await library.list("lol", summaries)).find(
    (item) => item.name === "MiXeD Case Club",
  )!;
  assert.equal(item.automaticLogo?.sha, sha);
  assert.equal(item.images.logo, "/api/logo-catalog/image/" + sha);
  assert.deepEqual(item.overrides, []);
  const [match] = await fixtures();
  match.radiant = "MiXeD Case Club";
  await library.apply(match);
  const automatic = match.radiantLogo;
  assert.match(automatic!, /^\/assets\/library\//);
  assert.deepEqual(await readFile(path.join(root, "public", automatic!)), png);
  const custom = await sharp({
    create: { width: 60, height: 60, channels: 4, background: "blue" },
  })
    .png()
    .toBuffer();
  const uploaded = await library.setImage(
    "lol",
    item.id,
    "logo",
    custom,
    summaries,
  );
  await library.apply(match);
  assert.equal(match.radiantLogo, uploaded.src);
  assert.notEqual(match.radiantLogo, automatic);
  await library.setImage("lol", item.id, "logo", null, summaries);
  await library.apply(match);
  assert.equal(match.radiantLogo, automatic);
  assert.equal(
    (await library.list("dota2", summaries)).find(
      (item) => item.name === "MiXeD Case Club",
    )!.images.logo,
    undefined,
  );
  const [different] = await fixtures();
  different.radiant = "Mixed Club";
  await library.apply(different);
  assert.equal(different.radiantLogo, undefined);
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

test("concurrent uploads and team edits keep each other across library instances and restarts", async (t) => {
  const { root, library, png } = await setup(t);
  const hero = (await library.list("lol")).find((v) => v.kind === "hero")!;
  await Promise.all([
    library.setImage("lol", hero.id, "portrait", png),
    library.setImage("lol", hero.id, "artwork", png),
    new MediaLibrary(root).saveTeam(
      "lol",
      { name: "Test Club", aliases: [] },
      undefined,
      [],
    ),
  ]);
  const items = await library.list("lol");
  assert.equal(items.find((v) => v.id === hero.id)!.overrides.length, 2);
  assert.ok(items.find((v) => v.name === "Test Club"));
  localStore(root).close();
  const restored = await new MediaLibrary(root).list("lol");
  assert.equal(restored.find((v) => v.id === hero.id)!.overrides.length, 2);
  assert.ok(restored.find((v) => v.name === "Test Club"));
});

test("invalid legacy registry blocks initial migration and is left intact", async (t) => {
  const { root, library } = await setup(t);
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
  assert.equal(localStore(root).meta("registry-migrated"), undefined);
});

test("legacy aliases, images and sources migrate once; later SQLite edits survive restart", async (t) => {
  const { root, library, png } = await setup(t);
  const legacyImage = `/assets/library/${"a".repeat(64)}.png`;
  const legacy = {
    version: 1,
    heroes: { "lol-hero-1": { portrait: legacyImage } },
    players: {},
    teams: {
      "legacy-team": {
        game: "lol",
        name: "Legacy Club",
        aliases: ["Previous Club"],
        images: { logo: legacyImage },
        logoSource: {
          name: "Legacy Club",
          path: "cs/legacy/logo.png",
          url: "https://example.com/logo.png",
        },
      },
    },
  };
  const file = path.join(root, "data/media-library.json");
  const before = JSON.stringify(legacy);
  await writeFile(file, before);
  const items = await library.list("lol");
  assert.equal(
    items.find((i) => i.id === "lol-hero-1")!.images.portrait,
    legacyImage,
  );
  assert.deepEqual(items.find((i) => i.id === "legacy-team")!.aliases, [
    "Previous Club",
  ]);
  assert.equal(
    items.find((i) => i.id === "legacy-team")!.logoSource!.url,
    "https://example.com/logo.png",
  );
  await library.setImage("lol", "lol-hero-1", "portrait", png);
  const updated = (await library.list("lol")).find(
    (i) => i.id === "lol-hero-1",
  )!.images.portrait;
  assert.equal(await readFile(file, "utf8"), before);
  await writeFile(file, "old JSON is now only a backup");
  localStore(root).close();
  const restored = await new MediaLibrary(root).list("lol");
  assert.equal(
    restored.find((i) => i.id === "lol-hero-1")!.images.portrait,
    updated,
  );
  assert.ok(restored.find((i) => i.id === "legacy-team"));
  await assert.rejects(
    library.saveTeam("lol", { name: "", aliases: [] }, "legacy-team", []),
  );
  assert.equal(
    (await library.list("lol")).find((i) => i.id === "legacy-team")!.name,
    "Legacy Club",
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
