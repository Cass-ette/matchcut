import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { load } from "cheerio";
import type { MatchData } from "../src/domain";
import { LolItems, lolInventory } from "../server/lol-items";
import {
  GolInventories,
  parseGolGame,
  verifyGolInventory,
  golTournamentCandidates,
  golSeriesCandidates,
  golGameLink,
} from "../server/lol-gol";

const read = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const champions = await read("data/fixtures/lol/champions.json");
const html = await Promise.all(
  [1, 2].map((g) => readFile(`tests/fixtures/gol/g${g}.html`, "utf8")),
);
const matches: MatchData[] = await Promise.all(
  [1, 2].map((g) => read(`tests/fixtures/gol/g${g}-match.json`)),
);
const urls = [83540, 83541].map(
  (id) => `https://gol.gg/game/stats/${id}/page-game/`,
);
const snapshots = html.map((s, i) => parseGolGame(s, urls[i], matches[i].id));
const tournaments = await read("tests/fixtures/gol/tournaments.json");
const matchlist = await readFile("tests/fixtures/gol/matchlist.html", "utf8");
const paused = await read("tests/fixtures/lol-paused-474169.json");

test("bundled GOL sample reopens offline with every local icon and unchanged statistics", async () => {
  const { normalizeLol } = await import("../src/lol");
  const raw = await read("data/fixtures/lol/LOLTMNT02_76144.json");
  const match = normalizeLol(raw.rows, champions, raw.fetchedAt);
  const before = structuredClone(match);
  let calls = 0;
  const library = new LolItems(process.cwd(), async () => {
    calls++;
    throw new Error("offline");
  });
  assert.equal(await library.applyCached(match), true);
  assert.equal(calls, 0);
  assert.equal(
    match.inventorySource?.url,
    "https://gol.gg/game/stats/57849/page-game/",
  );
  for (const [i, player] of match.players.entries()) {
    const { inventory, ...rest } = player;
    assert.deepEqual(rest, before.players[i]);
    assert.ok(inventory?.main.length);
    for (const item of inventory.main) {
      assert.ok(item);
      assert.ok(item?.image?.startsWith("/assets/lol/items/14.6.1/"));
      assert.equal(
        (await readFile("public" + item.image)).subarray(0, 8).toString("hex"),
        "89504e470d0a1a0a",
      );
    }
  }
});

test("paused G1 and normal G2 final pages verify all ten players, transformations and separate ward slots", () => {
  for (const [i, match] of matches.entries()) {
    const before = structuredClone(match);
    const { snapshot, items } = verifyGolInventory(
      match,
      snapshots[i],
      champions,
    );
    assert.equal(items.size, 10);
    assert.equal(snapshot.quantityMode, "occupied-slots");
    assert.deepEqual(match, before);
    assert.ok([...items.values()].flat().every((id) => id < 1200 || id > 1222));
    const parus = match.players.find((p) => p.name === "Parus")!;
    const vampire = match.players.find((p) => p.name === "Vampire")!;
    if (!i) {
      assert.deepEqual(
        items.get(parus.slot),
        [3364, 3190, 2031, 3869, 3111, 2525, 3067],
      );
      assert.deepEqual(
        items.get(vampire.slot),
        [3364, 2530, 6620, 3870, 6617, 3158, 2055],
      );
      assert.equal(
        lolInventory(items.get(vampire.slot)!, {
          version: "16.18.1",
          items: {},
        })!.main.find((i) => i?.id === 2055)?.count,
        undefined,
        "source does not expose consumable stack counts",
      );
    } else {
      assert.deepEqual(
        items.get(parus.slot),
        [3364, 3504, 2065, 3870, 3158, 1004],
      );
      assert.deepEqual(
        items.get(vampire.slot),
        [3364, 3109, 4642, 3870, 3504, 3158, 1052],
      );
      const samd = match.players.find((p) => p.name === "SamD")!;
      assert.equal(
        lolInventory(items.get(samd.slot)!, {
          version: "16.18.1",
          items: {},
        })!.main.find((i) => i?.id === 1036)?.count,
        2,
      );
    }
  }
});

test("wrong identities, final statistics, teams, dates, patch and ambiguous slots fail closed", () => {
  for (const mutate of [
    (s: any) => (s.matchId = "lol-other"),
    (s: any) => (s.gameNumber = 2),
    (s: any) => (s.date = "2026-10-01"),
    (s: any) => (s.duration += 6),
    (s: any) => (s.patchVersion = "16.19.1"),
    (s: any) => (s.blueTeam = "other"),
    (s: any) => (s.winner = "radiant"),
    (s: any) => (s.players[0].name = "Faker"),
    (s: any) => (s.players[0].champion = "Azir"),
    (s: any) => s.players[0].kills++,
    (s: any) => s.players[0].deaths++,
    (s: any) => s.players[0].assists++,
    (s: any) => s.players[0].cs++,
    (s: any) => (s.players[0].position = 2),
    (s: any) => s.players.pop(),
    (s: any) => (s.sourceUrl = "https://example.com/"),
    (s: any) => (s.players[0].items = [1, 2, 3, 4, 5, 6, 7, 8, 9]),
  ]) {
    const s = structuredClone(snapshots[0]);
    mutate(s);
    assert.throws(() => verifyGolInventory(matches[0], s, champions));
  }
  assert.throws(() => verifyGolInventory(matches[1], snapshots[0], champions));
  for (const m of [
    paused.snapshot,
    { ...paused.snapshot, counterReset: undefined },
  ])
    assert.throws(() => verifyGolInventory(paused.match, m, champions));
});

test("changed/partial pages are rejected; empty real equipment cells are retained", () => {
  for (const mutate of [
    ($: ReturnType<typeof load>) =>
      $("table.playersInfosLine").first().remove(),
    ($: ReturnType<typeof load>) =>
      $("table.playersInfosLine")
        .first()
        .children("tbody")
        .children("tr")
        .first()
        .remove(),
    ($: ReturnType<typeof load>) => $(".col-sm-8").first().remove(),
    ($: ReturnType<typeof load>) =>
      $(".col-sm-8 img").first().attr("src", "https://other.example/1.png"),
    ($: ReturnType<typeof load>) =>
      $('.blue-line-header a[href*="team-stats"]')
        .parent()
        .text("JD Gaming - LIVE"),
    ($: ReturnType<typeof load>) =>
      $(".game-menu-button-active a").attr(
        "href",
        "../game/stats/1/page-game/",
      ),
    ($: ReturnType<typeof load>) => $("h1").text(""),
  ]) {
    const $ = load(html[0]);
    mutate($);
    assert.throws(() => parseGolGame($.html(), urls[0], matches[0].id));
  }
  const $ = load(html[0]);
  $(".col-sm-8").first().empty();
  assert.deepEqual(
    parseGolGame($.html(), urls[0], matches[0].id).players[0].items,
    [],
  );
});

test("discovery uses season/date/team matching and actual Game links, never consecutive IDs", () => {
  assert.deepEqual(golTournamentCandidates(tournaments, matches[0]), [
    "Demacia Cup Global Invitational 2026",
  ]);
  assert.deepEqual(golSeriesCandidates(matchlist, matches[0]), [
    "https://gol.gg/game/stats/83540/page-summary/",
  ]);
  assert.equal(golGameLink(html[0], 2), urls[1]);
  assert.equal(
    golGameLink(html[0].replaceAll("83541", "99999"), 2),
    "https://gol.gg/game/stats/99999/page-game/",
  );
  assert.throws(() => golGameLink(html[0], 4));
  assert.deepEqual(
    golSeriesCandidates(matchlist, { ...matches[0], radiant: "Other" }),
    [],
  );
  assert.deepEqual(
    golSeriesCandidates(matchlist, { ...matches[0], date: "2026-10-01" }),
    [],
  );
  assert.throws(() =>
    golGameLink(
      html[0].replaceAll(
        "../game/stats/83541",
        "https://evil.test/game/stats/83541",
      ),
      2,
    ),
  );
});

function sourceFixture() {
  const requests: string[] = [];
  let closed = 0,
    active = 0,
    maxActive = 0,
    broken = false,
    ambiguous = false;
  const source = new GolInventories(async () => {
    maxActive = Math.max(maxActive, ++active);
    return {
      async read(url, season) {
        requests.push(url);
        if (season) {
          assert.equal(season, "S16");
          return JSON.stringify(tournaments);
        }
        if (url.includes("tournament-matchlist"))
          return ambiguous
            ? matchlist.replace(
                "</table>",
                matchlist.replaceAll("83540", "99999") + "</table>",
              )
            : matchlist;
        if (url.includes("page-summary"))
          return url.includes("99999")
            ? html[0].replaceAll("83540", "99999")
            : html[0];
        if (broken) throw new Error("source offline");
        return url.includes("83541")
          ? html[1]
          : url.includes("99999")
            ? html[0].replaceAll("83540", "99999")
            : html[0];
      },
      async close() {
        closed++;
        active--;
      },
    };
  });
  return {
    source,
    requests,
    get closed() {
      return closed;
    },
    get maxActive() {
      return maxActive;
    },
    set broken(v: boolean) {
      broken = v;
    },
    set ambiguous(v: boolean) {
      ambiguous = v;
    },
  };
}

test("source serializes browser work, reuses discovery, closes sessions and rejects ambiguity", async () => {
  const fixture = sourceFixture();
  const result = await Promise.all(
    matches.map((m) => fixture.source.fetch(m, champions)),
  );
  assert.deepEqual(
    result.map((s) => s.sourceUrl),
    urls,
  );
  assert.equal(fixture.maxActive, 1);
  assert.equal(fixture.closed, 2);
  assert.equal(fixture.requests.filter((u) => u.includes("ajax")).length, 1);
  assert.equal(
    fixture.requests.filter((u) => u.includes("tournament-matchlist")).length,
    1,
  );
  fixture.broken = true;
  await assert.rejects(
    fixture.source.fetch(matches[0], champions),
    /source offline/,
  );
  assert.equal(fixture.closed, 3);
  const ambiguous = sourceFixture();
  ambiguous.ambiguous = true;
  await assert.rejects(ambiguous.source.fetch(matches[0], champions), /多场/);
  assert.equal(ambiguous.closed, 1);
});

test("sync caches verified inventories atomically, deduplicates fetching, works offline and preserves data on failure", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "matchcut-gol-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "data/fixtures/lol"), { recursive: true });
  await writeFile(
    path.join(root, "data/fixtures/lol/champions.json"),
    JSON.stringify(champions),
  );
  const requests: string[] = [];
  const request: typeof fetch = async (address) => {
    const url = String(address);
    requests.push(url);
    if (url.endsWith("versions.json"))
      return Response.json(["lolpatch_7.20", "16.18.1"]);
    if (url.endsWith("item.json"))
      return Response.json({
        version: "16.18.1",
        data: { 3364: { name: "神谕透镜" }, 2008: { name: "" } },
      });
    return new Response("offline", { status: 503 });
  };
  let calls = 0,
    wrong = false;
  const source = {
    async fetch() {
      calls++;
      const s = structuredClone(snapshots[0]);
      if (wrong) s.players[0].kills++;
      return s;
    },
  };
  const library = new LolItems(root, request, source);
  const m = structuredClone(matches[0]),
    m2 = structuredClone(matches[0]);
  await Promise.all([library.sync(m), library.sync(m2)]);
  assert.equal(calls, 1);
  assert.ok(m.players.every((p) => p.inventory));
  assert.equal(m.players[1].inventory!.main[0]!.name, "神谕透镜");
  assert.equal(
    (await read(path.join(root, "data/cache/lol/item-catalogs/16.18.json")))
      .items[2008].name,
    "未知装备 #2008",
  );
  assert.ok(m.players.every((p) => p.inventory!.main.every((i) => !i?.image)));
  assert.equal(m.inventorySource?.url, urls[0]);
  assert.equal(m.inventorySource?.timestamp, undefined);
  for (const [i, p] of m.players.entries()) {
    const { inventory, ...rest } = p;
    assert.deepEqual(rest, matches[0].players[i]);
  }
  const file = path.join(
    root,
    "data/cache/lol/inventories/LOLTMNT02_474169.json",
  );
  const saved = await readFile(file, "utf8"),
    before = structuredClone(m);
  wrong = true;
  await assert.rejects(library.sync(m), /终局 KDA/);
  assert.deepEqual(m, before);
  assert.equal(await readFile(file, "utf8"), saved);
  requests.length = 0;
  const reopened = structuredClone(matches[0]);
  assert.equal(
    await new LolItems(root, request, source).applyCached(reopened),
    true,
  );
  assert.equal(requests.length, 0);
  assert.deepEqual(reopened, m);
  // All older live-feed inventories are incomplete as a source, even without resets.
  await writeFile(file, JSON.stringify(paused.snapshot));
  const legacy = structuredClone(matches[0]);
  assert.equal(await library.applyCached(legacy), false);
  assert.deepEqual(legacy, matches[0]);
  assert.equal(requests.length, 0);
});
