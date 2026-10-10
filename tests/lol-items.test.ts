import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  await cp(
    "data/fixtures/lol/item-catalogs",
    path.join(root, "data/fixtures/lol/item-catalogs"),
    { recursive: true },
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
    // Optional images may be unavailable without losing equipment IDs.
    return new Response("offline", { status: 503 });
  };
  const library = new LolItems(root, request);
  const m = match();
  await library.sync(m);
  assert.equal(requests.filter((r) => r.endsWith("/api/gql")).length, 1);
  assert.ok(m.players.every((p) => p.inventory));
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

test("JDG–NAVI pause reset verifies all ten cumulative KDA values without changing the imported match", () => {
  const m = structuredClone(pausedGame.match);
  const before = structuredClone(m);
  const { items, snapshot } = verifyLolInventory(
    m,
    pausedGame.snapshot,
    champions,
  );
  assert.deepEqual(m, before);
  assert.equal(items.size, 10);
  assert.deepEqual(items.get(0), [4005, 3363, 3157, 3082, 2055]);
  assert.equal(snapshot.window.blueTeam.participants[1].kills, 0);
  assert.equal(snapshot.counterReset!.before.blueTeam.participants[1].kills, 2);
  assert.equal(m.players[1].kills, 2);
  const withoutEvidence = structuredClone(pausedGame.snapshot);
  delete withoutEvidence.counterReset;
  assert.throws(
    () => verifyLolInventory(m, withoutEvidence, champions),
    /终局 KDA/,
  );
});

test("pause recovery requires a complete zero-counter restart, consistent chronology, KDA, final CS and gold", () => {
  for (const mutate of [
    (s: any) => {
      s.counterReset.before.gameState = "in_game";
    },
    (s: any) => {
      s.counterReset.after.gameState = "paused";
    },
    (s: any) => {
      s.counterReset.after.rfc460Timestamp = s.startedAt;
    },
    (s: any) => {
      s.counterReset.before.rfc460Timestamp = s.window.rfc460Timestamp;
    },
    (s: any) => {
      s.counterReset.after.blueTeam.participants[0].kills = 1;
    },
    (s: any) => {
      s.counterReset.after.redTeam.participants[0].assists = 1;
    },
    (s: any) => {
      s.counterReset.before.redTeam.participants[0].kills++;
    },
    (s: any) => {
      s.counterReset.before.blueTeam.participants[0].participantId = 2;
    },
    (s: any) => {
      s.counterReset.after.blueTeam.participants[0].participantId = 2;
    },
    (s: any) => {
      s.window.blueTeam.participants[0].creepScore--;
    },
    (s: any) => {
      s.window.redTeam.participants[0].totalGold -= 100;
    },
    (s: any) => {
      delete s.window.redTeam.participants[0].totalGold;
    },
    (s: any) => {
      s.details.participants[0].kills++;
    },
    (s: any) => {
      s.window.gameState = "in_game";
    },
  ]) {
    const changed = structuredClone(pausedGame.snapshot);
    mutate(changed);
    assert.throws(() =>
      verifyLolInventory(pausedGame.match, changed, champions),
    );
  }
});

test("sync locates the resumed final bucket instead of the stale paused tail, and caches its raw evidence", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "matchcut-lol-resumed-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "data/fixtures/lol"), { recursive: true });
  await writeFile(
    path.join(root, "data/fixtures/lol/champions.json"),
    JSON.stringify(champions),
  );
  const s = pausedGame.snapshot;
  const bucket = (timestamp: string) =>
    Math.floor(Date.parse(timestamp) / 10000) * 10000;
  const resumedAt = bucket(s.counterReset.after.rfc460Timestamp);
  const endedAt = bucket(s.window.rfc460Timestamp);
  const requests: string[] = [];
  let incomplete = false,
    wrongMetadata = false;
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
    const at = url.searchParams.get("startingTime");
    const time = at ? Date.parse(at) : undefined;
    if (url.pathname.includes("/window/")) {
      let frame;
      if (time === undefined)
        frame = { ...s.counterReset.after, rfc460Timestamp: s.startedAt };
      else if (time < resumedAt || time > endedAt)
        frame = s.counterReset.before;
      else if (time === endedAt)
        frame = {
          ...s.window,
          ...(incomplete ? { gameState: "in_game" } : {}),
        };
      else
        frame = {
          ...s.counterReset.after,
          rfc460Timestamp:
            time === resumedAt ? s.counterReset.after.rfc460Timestamp : at,
        };
      const metadata = structuredClone(s.metadata);
      if (
        wrongMetadata &&
        time !== undefined &&
        time >= resumedAt &&
        time <= endedAt
      )
        metadata.blueTeamMetadata.participantMetadata[0].summonerName =
          "JDG SomeoneElse";
      return Response.json({
        esportsGameId: s.esportsGameId,
        gameMetadata: metadata,
        frames: [frame],
      });
    }
    if (url.pathname.includes("/details/")) {
      assert.equal(
        time,
        endedAt,
        "equipment must be fetched from the recovered final bucket",
      );
      return Response.json({ frames: [s.details] });
    }
    if (url.pathname === "/api/versions.json")
      return Response.json(["16.20.1", "lolpatch_7.20", "16.18.1"]);
    if (url.pathname.endsWith("/data/zh_CN/item.json")) {
      assert.equal(url.pathname, "/cdn/16.18.1/data/zh_CN/item.json");
      return Response.json({
        version: "16.18.1",
        data: { "4005": { name: "帝国指令" }, "2008": { name: "" } },
      });
    }
    return new Response("offline", { status: 503 });
  };
  const m = structuredClone(pausedGame.match);
  const library = new LolItems(root, request);
  await library.sync(m);
  assert.ok(m.players.every((p: any) => p.inventory));
  assert.equal(m.players[0].inventory.main[0].name, "帝国指令");
  assert.equal(
    (await read(path.join(root, "data/cache/lol/item-catalogs/16.18.json")))
      .items[2008].name,
    "未知装备 #2008",
  );
  assert.ok(
    requests.some((url) => url.endsWith("/cdn/16.18.1/img/item/4005.png")),
  );
  for (const [i, p] of m.players.entries()) {
    const { inventory, ...rest } = p;
    assert.deepEqual(rest, pausedGame.match.players[i]);
  }
  assert.equal(m.inventorySource.timestamp, s.window.rfc460Timestamp);
  assert.ok(requests.filter((r) => r.includes("/window/")).length < 25);
  const file = path.join(
    root,
    "data/cache/lol/inventories/LOLTMNT02_474169.json",
  );
  const saved = await readFile(file, "utf8");
  assert.ok(JSON.parse(saved).counterReset);
  requests.length = 0;
  assert.equal(
    await library.applyCached(structuredClone(pausedGame.match)),
    true,
  );
  assert.equal(requests.length, 0);
  incomplete = true;
  const unchanged = structuredClone(m);
  await assert.rejects(library.sync(m), /暂停记录.*未找到完整的恢复后终局记录/);
  assert.deepEqual(m, unchanged);
  assert.equal(await readFile(file, "utf8"), saved);
  incomplete = false;
  wrongMetadata = true;
  await assert.rejects(library.sync(m), /暂停前后的选手或英雄不一致/);
  assert.deepEqual(m, unchanged);
  assert.equal(await readFile(file, "utf8"), saved);
});
