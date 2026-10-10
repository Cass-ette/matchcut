import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, mkdir, writeFile, rm, cp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { LolLoadouts, verifyLolRunes } from "../server/lol-loadout";
import { verifyLolInventory } from "../server/lol-items";
import { normalizeLol } from "../src/lol";
import { summarizeLolSeries } from "../src/series";
import { fetchRuneCatalog } from "../server/lol-rune-catalog";
const read = async (p: string) => JSON.parse(await readFile(p, "utf8"));
const champions = await read("data/fixtures/lol/champions.json");
const raw = await read("data/fixtures/lol/LOLTMNT02_76144.json");
const snapshot = await read("data/fixtures/lol/runes/LOLTMNT02_76144.json");
const paused = await read("tests/fixtures/lol-paused-474169.json");
const start = await read("tests/fixtures/lol-start-runes-474169.json");
const match = () => normalizeLol(raw.rows, champions, raw.fetchedAt);

test("new patches use matching catalogs, cache valid icons and keep IDs when images are unavailable", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "matchcut-rune-catalog-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const png = await readFile("public/assets/lol/loadouts/14.6/runes-8229.png");
  const requests: string[] = [];
  const request: typeof fetch = async (address) => {
    const url = String(address);
    requests.push(url);
    if (url.endsWith("/api/versions.json"))
      return Response.json(["lolpatch_7.20", "14.7.1"]);
    if (url.endsWith("/runesReforged.json")) {
      assert.ok(url.includes("/14.7.1/"));
      return Response.json([
        {
          id: 8200,
          name: "巫术",
          icon: "perk-images/Styles/Sorcery.png",
          slots: [
            {
              runes: [
                {
                  id: 8229,
                  name: "奥术彗星",
                  icon: "perk-images/Styles/Comet.png",
                },
              ],
            },
          ],
        },
      ]);
    }
    if (url.endsWith("/perks.json"))
      return Response.json([
        {
          id: 5008,
          name: "适应之力",
          iconPath:
            "/lol-game-data/assets/v1/perk-images/StatMods/StatModsAdaptiveForceIcon.png",
        },
      ]);
    return url.endsWith("Comet.png")
      ? new Response(png)
      : new Response("missing", { status: 404 });
  };
  const c = await fetchRuneCatalog(root, "14.7", request);
  assert.equal(c.version, "14.7.1");
  assert.equal(
    c.runes.find((r) => r.id === 8229)?.image,
    "/assets/lol/loadouts/14.7/runes-8229.png",
  );
  assert.equal(c.runes.find((r) => r.id === 5008)?.image, undefined);
  assert.ok(
    requests.some((url) =>
      url.endsWith(
        "/cdn/img/perk-images/StatMods/StatModsAdaptiveForceIcon.png",
      ),
    ),
  );
  requests.length = 0;
  await fetchRuneCatalog(root, "14.7", request);
  assert.ok(!requests.some((url) => url.endsWith("Comet.png")));
});

test("start runes remain verifiable after a pause reset while incomplete equipment stays rejected", () => {
  const { result } = verifyLolRunes(paused.match, start, champions);
  assert.equal(result.size, 10);
  assert.deepEqual(
    result.get(0)?.perks,
    [8230, 8226, 8210, 8237, 8444, 8242, 5008, 5011],
  );
  assert.throws(
    () => verifyLolInventory(paused.match, paused.snapshot, champions),
    /断档/,
  );
  for (const change of [
    (s: any) => (s.details.participants[0].participantId = 2),
    (s: any) =>
      (s.metadata.blueTeamMetadata.participantMetadata[0].summonerName =
        "JDG wrong"),
    (s: any) =>
      (s.metadata.blueTeamMetadata.participantMetadata[0].championId = "Azir"),
    (s: any) => (s.metadata.patchVersion = "14.6.1"),
    (s: any) =>
      (s.details.rfc460Timestamp = paused.snapshot.window.rfc460Timestamp),
    (s: any) => s.details.participants.pop(),
  ]) {
    const s = structuredClone(start);
    change(s);
    assert.throws(() => verifyLolRunes(paused.match, s, champions));
  }
});
test("bundled rune and spell icons decode, and cached loadouts work without network or series leakage", async () => {
  let calls = 0;
  const library = new LolLoadouts(process.cwd(), async () => {
    calls++;
    throw new Error("offline");
  });
  const m = match();
  const before = structuredClone(m);
  await library.applyCached(m);
  assert.equal(calls, 0);
  assert.ok(m.players.every((p) => p.lolLoadout?.runes));
  for (const [i, p] of m.players.entries()) {
    const { lolLoadout, ...rest } = p;
    assert.deepEqual(rest, before.players[i]);
    assert.equal(lolLoadout!.spells, undefined);
  }
  for (const version of ["14.6", "16.18"]) {
    const c = await library.catalog(version);
    assert.equal(c.spells.length, 9);
    for (const icon of [...c.spells, ...c.runes]) {
      assert.ok(icon.image);
      assert.equal(
        (await sharp(path.join("public", icon.image!)).metadata()).format,
        "png",
      );
    }
  }
  const series = summarizeLolSeries([m]);
  assert.ok(series.players.every((p) => !p.lolLoadout));
  assert.equal(series.runeSource, undefined);
});
test("official rune sync is independent of final inventory; spells save by game and identity", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "matchcut-loadouts-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "data/fixtures/lol"), { recursive: true });
  await writeFile(
    path.join(root, "data/fixtures/lol/champions.json"),
    JSON.stringify(champions),
  );
  await cp(
    "data/fixtures/lol/loadout-catalogs",
    path.join(root, "data/fixtures/lol/loadout-catalogs"),
    { recursive: true },
  );
  let calls = 0;
  let wrong = false;
  const request: typeof fetch = async (address) => {
    calls++;
    const url = String(address);
    if (url.endsWith("/api/gql"))
      return Response.json({
        data: {
          esports: {
            events: [
              {
                league: { name: "LCK" },
                startTime: "2024-04-14T06:00:00Z",
                match: {
                  games: [
                    {
                      id: snapshot.esportsGameId,
                      state: "completed",
                      number: 1,
                    },
                  ],
                },
              },
            ],
          },
        },
      });
    if (url.includes("/window/")) {
      assert.ok(
        !url.includes("startingTime"),
        "runes must not require the final frame",
      );
      const s = await read(
        "data/fixtures/lol/inventories/LOLTMNT02_76144.json",
      );
      return Response.json({
        esportsGameId: snapshot.esportsGameId,
        gameMetadata: snapshot.metadata,
        frames: [
          {
            ...s.window,
            rfc460Timestamp: snapshot.startedAt,
            gameState: "in_game",
          },
        ],
      });
    }
    if (url.includes("/details/")) {
      const details = structuredClone(snapshot.details);
      if (wrong) details.participants[0].participantId = 2;
      return Response.json({ frames: [details] });
    }
    throw new Error("Unexpected network call: " + url);
  };
  const library = new LolLoadouts(root, request);
  const m = match();
  await library.sync(m);
  assert.equal(calls, 3);
  await library.setSpells(m, { slot: 0, spells: [4, 12] });
  await library.setSpells(m, { slot: 1, spells: [4, 11] });
  const reload = match();
  await library.applyCached(reload);
  assert.deepEqual(
    reload.players[0].lolLoadout?.spells?.map((s) => s?.id),
    [4, 12],
  );
  assert.deepEqual(
    reload.players[1].lolLoadout?.spells?.map((s) => s?.id),
    [4, 11],
  );
  assert.equal(calls, 3);
  await assert.rejects(library.setSpells(m, { slot: 0, spells: [4, 4] }));
  await assert.rejects(library.setSpells(m, { slot: 0, spells: [4, 99999] }));
  const changed = match();
  changed.players[0].heroId = 9999;
  await library.applyCached(changed);
  assert.equal(changed.players[0].lolLoadout, undefined);
  const file = path.join(root, "data/cache/lol/runes/LOLTMNT02_76144.json");
  const saved = await readFile(file, "utf8");
  wrong = true;
  await assert.rejects(library.sync(match()), /无法唯一核对/);
  assert.equal(await readFile(file, "utf8"), saved);
  await library.setSpells(m, { slot: 0, spells: [null, null] });
  const cleared = match();
  await library.applyCached(cleared);
  assert.deepEqual(cleared.players[0].lolLoadout?.spells, [null, null]);
});
