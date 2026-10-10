import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { normalizeLol } from "../src/lol";
import {
  LolItems,
  lolInventory,
  verifyLolInventory,
} from "../server/lol-items";

const read = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const raw = await read("data/fixtures/lol/LOLTMNT02_76144.json");
const champions = await read("data/fixtures/lol/champions.json");
const snapshot = await read(
  "data/fixtures/lol/inventories/LOLTMNT02_76144.json",
);
const catalog = await read("data/fixtures/lol/item-catalogs/14.6.json");
const pausedGame = await read("tests/fixtures/lol-paused-474169.json");
const match = () => normalizeLol(raw.rows, champions, raw.fetchedAt);

test("real LoL final frames match all ten players and preserve recorded items, consumables and counts", () => {
  const { items } = verifyLolInventory(match(), snapshot, champions);
  assert.deepEqual(
    items.get(0),
    [3009, 3152, 3364, 6653, 3137, 3157, 2139, 1058],
  );
  assert.equal(items.size, 10);
  const kiin = lolInventory(items.get(0)!, catalog)!;
  assert.equal(kiin.layout, "list");
  assert.equal(kiin.main.length, 8);
  assert.equal(kiin.main[0]!.name, "轻灵之靴");
  // The official list omits slot positions; never pad shorter records to six.
  assert.equal(lolInventory(items.get(1)!, catalog)!.main.length, 3);
  const keria = lolInventory(items.get(132)!, catalog)!;
  assert.equal(keria.main.find((i) => i?.id === 2055)!.count, 2);
  assert.equal(lolInventory([], catalog), undefined);
  assert.equal(
    lolInventory([999999], catalog)!.main[0]!.name,
    "未知装备 #999999",
  );
});

test("wrong games, unfinished or mismatched frames, ambiguous players and changed KDA cannot supply equipment", () => {
  for (const mutate of [
    (s: any) => {
      s.window.gameState = "in_game";
    },
    (s: any) => {
      s.startedAt = "2024-04-15T06:25:53.305Z";
    },
    (s: any) => {
      s.metadata.patchVersion = "14.7.1";
    },
    (s: any) => {
      s.details.rfc460Timestamp = s.startedAt;
    },
    (s: any) => {
      s.details.participants[0].kills++;
    },
    (s: any) => {
      s.window.blueTeam.participants[0].assists++;
    },
    (s: any) => {
      s.metadata.blueTeamMetadata.participantMetadata[0].summonerName =
        "GEN Faker";
    },
    (s: any) => {
      s.metadata.blueTeamMetadata.participantMetadata[0].championId = "Azir";
    },
    (s: any) => {
      s.metadata.blueTeamMetadata.participantMetadata[0].role = "mid";
    },
    (s: any) => {
      s.details.participants[0].participantId = 2;
    },
    (s: any) => {
      s.details.participants.pop();
    },
    (s: any) => {
      s.details.participants[0].items = Array.from(
        { length: 9 },
        (_, n) => n + 1,
      );
    },
  ]) {
    const changed = structuredClone(snapshot);
    mutate(changed);
    assert.throws(() => verifyLolInventory(match(), changed, champions));
  }
});

test("LoL cached equipment loads offline with matching patch icons and leaves statistics intact", async () => {
  const m = match();
  const before = structuredClone(m);
  let calls = 0;
  const library = new LolItems(process.cwd(), async () => {
    calls++;
    throw new Error("offline");
  });
  assert.equal(await library.applyCached(m), true);
  assert.equal(calls, 0);
  assert.ok(
    m.players.every((p) =>
      p.inventory?.main.every((i) =>
        i?.image?.startsWith("/assets/lol/items/14.6.1/"),
      ),
    ),
  );
  for (const [i, p] of m.players.entries()) {
    const { inventory, ...rest } = p;
    assert.deepEqual(rest, before.players[i]);
  }
  assert.match(m.inventorySource!.url, /111561337007371296$/);
});

test("LoL sync uses a uniquely verified official game, saves atomically, and rejects changes without replacing the snapshot", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "matchcut-lol-items-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "data/fixtures/lol"), { recursive: true });
  await writeFile(
    path.join(root, "data/fixtures/lol/champions.json"),
    JSON.stringify(champions),
  );
  const requests: string[] = [];
  let wrong = false;
  const request: typeof fetch = async (url, init) => {
    const address = String(url);
    requests.push(address);
    if (address.endsWith("/api/gql")) {
      assert.equal(JSON.parse(String(init!.body)).variables.hl, "en_US");
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
    }
    if (address.endsWith("/window/" + snapshot.esportsGameId))
      return Response.json({
        esportsGameId: snapshot.esportsGameId,
        gameMetadata: snapshot.metadata,
        frames: [
          {
            ...snapshot.window,
            rfc460Timestamp: snapshot.startedAt,
            gameState: "in_game",
          },
        ],
      });
    if (address.includes("/window/"))
      return Response.json({
        esportsGameId: snapshot.esportsGameId,
        gameMetadata: snapshot.metadata,
        frames: [snapshot.window],
      });
    if (address.includes("/details/")) {
      const details = structuredClone(snapshot.details);
      if (wrong) details.participants[0].kills++;
      return Response.json({ frames: [details] });
    }
    if (address.endsWith("/api/versions.json"))
      return Response.json(["16.20.1", "lolpatch_7.20", "14.6.1"]);
    if (address.endsWith("/data/zh_CN/item.json")) {
      assert.ok(address.endsWith("/cdn/14.6.1/data/zh_CN/item.json"));
      return Response.json({
        version: "14.6.1",
        data: { "3009": { name: "轻灵之靴" }, "2008": { name: "" } },
      });
    }
    // Optional images may be unavailable without losing equipment IDs.
    return new Response("offline", { status: 503 });
  };
  const library = new LolItems(root, request);
  const m = match();
  await library.sync(m);
  assert.equal(requests.filter((r) => r.endsWith("/api/gql")).length, 1);
  assert.ok(m.players.every((p) => p.inventory));
  assert.equal(m.players[0].inventory!.main[0]!.name, "轻灵之靴");
  assert.equal(
    (await read(path.join(root, "data/cache/lol/item-catalogs/14.6.json")))
      .items[2008].name,
    "未知装备 #2008",
  );
  assert.ok(m.players.every((p) => p.inventory!.main.every((i) => !i?.image)));
  const file = path.join(
    root,
    "data/cache/lol/inventories/LOLTMNT02_76144.json",
  );
  const saved = await readFile(file, "utf8");
  wrong = true;
  await assert.rejects(
    library.sync(match()),
    /官方终局 KDA 与当前局不一致（Kiin）/,
  );
  assert.equal(await readFile(file, "utf8"), saved);
  requests.length = 0;
  assert.equal(await new LolItems(root, request).applyCached(match()), true);
  assert.equal(requests.length, 0);
});

test("matching cumulative KDA cannot make a restarted, incomplete inventory valid", () => {
  const m = structuredClone(pausedGame.match);
  const s = pausedGame.snapshot;
  for (const [i, player] of m.players.entries()) {
    const team = i < 5 ? "blueTeam" : "redTeam";
    const before = s.counterReset.before[team].participants[i % 5];
    const final = s.window[team].participants[i % 5];
    for (const key of ["kills", "deaths", "assists"])
      assert.equal(before[key] + final[key], player[key]);
  }
  assert.deepEqual(s.details.participants[9].items, [2525, 3067]);
  assert.throws(() => verifyLolInventory(m, s, champions), /装备记录存在断档/);
  // Removing the legacy marker must not bypass the strict final KDA check.
  const unmarked = structuredClone(s);
  delete unmarked.counterReset;
  assert.throws(() => verifyLolInventory(m, unmarked, champions), /终局 KDA/);
  assert.deepEqual(m, pausedGame.match);
});

test("old restart caches are ignored offline; paused feeds cannot reattach or overwrite them", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "matchcut-lol-discontinuous-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "data/fixtures/lol"), { recursive: true });
  await writeFile(
    path.join(root, "data/fixtures/lol/champions.json"),
    JSON.stringify(champions),
  );
  const file = path.join(
    root,
    "data/cache/lol/inventories/LOLTMNT02_474169.json",
  );
  await mkdir(path.dirname(file), { recursive: true });
  const saved = JSON.stringify(pausedGame.snapshot);
  await writeFile(file, saved);
  const s = pausedGame.snapshot;
  const requests: string[] = [];
  const request: typeof fetch = async (address) => {
    const url = new URL(String(address));
    requests.push(url.href);
    if (url.pathname.endsWith("/api/gql"))
      return Response.json({
        data: {
          esports: {
            events: [
              {
                league: { name: "DCGI" },
                startTime: "2026-10-08T11:00:00Z",
                match: {
                  games: [
                    { id: s.esportsGameId, state: "completed", number: 1 },
                  ],
                },
              },
            ],
          },
        },
      });
    assert.ok(
      url.pathname.includes("/window/"),
      "unverified games must not fetch equipment or images",
    );
    return Response.json({
      esportsGameId: s.esportsGameId,
      gameMetadata: s.metadata,
      frames: [
        url.searchParams.has("startingTime")
          ? s.counterReset.before
          : {
              ...s.counterReset.after,
              rfc460Timestamp: s.startedAt,
            },
      ],
    });
  };
  const library = new LolItems(root, request);
  const m = structuredClone(pausedGame.match);
  assert.equal(await library.applyCached(m), false);
  assert.equal(requests.length, 0);
  assert.ok(m.players.every((p: any) => !p.inventory));
  assert.equal(m.inventorySource, undefined);
  assert.deepEqual(m, pausedGame.match);
  await assert.rejects(library.sync(m), /暂停阶段.*无法确认完整的终局装备/);
  assert.deepEqual(m, pausedGame.match);
  assert.equal(requests.length, 3);
  assert.equal(await readFile(file, "utf8"), saved);
});
