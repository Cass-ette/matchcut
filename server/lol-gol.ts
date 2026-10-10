import assert from "node:assert/strict";
import { load } from "cheerio";
import { chromium, type Browser } from "playwright-core";
import { z } from "zod";
import type { MatchData } from "../src/domain";
import { championFor, type ChampionCatalog } from "../src/lol";
import { browserPath } from "./browser";

const origin = "https://gol.gg";
const canonical = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
const teamAliases: Record<string, string> = {
  jdg: "jdgaming",
  navi: "natusvincere",
  gengesports: "geng",
};
const teamKey = (s: string) => teamAliases[canonical(s)] || canonical(s);
const patch = (s: string) => s.split(".").slice(0, 2).map(Number).join(".");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const integer = z.number().int().nonnegative();
const snapshotSchema = z.object({
  schemaVersion: z.literal(2),
  source: z.literal("games-of-legends"),
  matchId: z.string(),
  sourceUrl: z
    .string()
    .regex(/^https:\/\/gol\.gg\/game\/stats\/\d+\/page-game\/$/),
  fetchedAt: z.string().datetime(),
  date: day,
  tournament: z.string().min(1),
  gameNumber: z.number().int().min(1).max(15),
  duration: z.number().int().positive(),
  patchVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  blueTeam: z.string().min(1),
  redTeam: z.string().min(1),
  winner: z.enum(["radiant", "dire"]),
  // Page images represent occupied slots, not consumable stack quantities.
  quantityMode: z.literal("occupied-slots"),
  players: z
    .array(
      z.object({
        side: z.enum(["radiant", "dire"]),
        position: z.number().int().min(1).max(5),
        name: z.string().min(1),
        champion: z.string().min(1),
        kills: integer,
        deaths: integer,
        assists: integer,
        cs: integer,
        items: z.array(z.number().int().positive()).max(16),
      }),
    )
    .length(10),
});
export type GolInventorySnapshot = z.infer<typeof snapshotSchema>;
// Data Dragon 16.18 marks exactly these IDs with tags:["Lane"]. These are
// quest states/rewards, not purchasable inventory; never filter boots/support gear.
const roleMarkers = new Set([
  1090, 1091, 1092, 1093, 1094, 1200, 1201, 1202, 1203, 1204, 1205, 1206, 1207,
  1208, 1209, 1210, 1211, 1220, 1221, 1222,
]);

export function verifyGolInventory(
  match: MatchData,
  input: unknown,
  champions: ChampionCatalog,
) {
  assert.equal(match.game, "lol", "仅支持 LoL 单局");
  assert.ok(!("series" in match) && !("fullGames" in match), "装备只属于单局");
  const snapshot = snapshotSchema.parse(input);
  assert.equal(snapshot.matchId, match.id, "终局装备对应的比赛编号不一致");
  assert.equal(
    snapshot.gameNumber,
    match.gameNumber,
    "终局装备对应的局数不一致",
  );
  // GOL exposes a calendar day, not an exact end timestamp. Allow timezone
  // boundaries only; all ten identities, final statistics and duration still bind it.
  assert.ok(
    Math.abs(Date.parse(snapshot.date) - Date.parse(match.date)) <=
      36 * 3600000,
    "比赛日期不一致",
  );
  assert.ok(
    Math.abs(snapshot.duration - match.duration) <= 2,
    "终局比赛时长不一致",
  );
  if (match.patch)
    assert.equal(
      patch(snapshot.patchVersion),
      patch(match.patch),
      "比赛版本不一致",
    );
  assert.equal(
    teamKey(snapshot.blueTeam),
    teamKey(match.radiant),
    "蓝方战队不一致",
  );
  assert.equal(
    teamKey(snapshot.redTeam),
    teamKey(match.dire),
    "红方战队不一致",
  );
  assert.equal(snapshot.winner, match.winner, "终局胜负不一致");
  assert.equal(match.players.length, 10, "当前局选手不完整");
  const items = new Map<number, number[]>();
  for (const person of snapshot.players) {
    const found = match.players.filter(
      (p) => p.side === person.side && p.declaredPosition === person.position,
    );
    assert.equal(found.length, 1, "选手位置不唯一");
    const player = found[0];
    assert.ok(!items.has(player.slot), "终局选手重复");
    assert.equal(
      canonical(person.name),
      canonical(player.name),
      "终局选手名称不一致",
    );
    assert.equal(
      championFor(person.champion, champions)?.key,
      String(player.heroId),
      "终局选手英雄不一致",
    );
    for (const key of ["kills", "deaths", "assists"] as const)
      assert.equal(
        person[key],
        player[key],
        `终局 KDA 不一致（${player.name}）`,
      );
    assert.equal(
      person.cs,
      player.lastHits,
      `终局补刀不一致（${player.name}）`,
    );
    const ids = person.items.filter(
      (id) =>
        !(
          Number(snapshot.patchVersion.split(".")[0]) >= 16 &&
          roleMarkers.has(id)
        ),
    );
    assert.ok(new Set(ids).size <= 8, "终局装备数量超出展示范围");
    items.set(player.slot, ids);
  }
  assert.equal(items.size, 10, "十名选手装备未完整核对");
  return { snapshot, items };
}

function safeUrl(href: string, base: string) {
  const url = new URL(href, base);
  assert.equal(url.origin, origin, "装备来源链接不合法");
  assert.ok(
    !url.username && !url.password && !url.search && !url.hash,
    "装备来源链接不合法",
  );
  return url.href;
}
export function parseGolGame(
  html: string,
  sourceUrl: string,
  matchId: string,
  fetchedAt = new Date().toISOString(),
): GolInventorySnapshot {
  const $ = load(html);
  const active = $(".game-menu-button-active a").filter((_, e) =>
    /^Game \d+$/i.test($(e).text().trim()),
  );
  assert.equal(active.length, 1, "终局页面缺少唯一局数");
  assert.equal(
    safeUrl(active.attr("href")!, origin + "/game/"),
    sourceUrl,
    "终局页面跳转到另一局",
  );
  const dates = $(".text-right")
    .map(
      (_, e) =>
        $(e)
          .text()
          .trim()
          .match(/^(\d{4}-\d{2}-\d{2})\s*\(/)?.[1],
    )
    .get();
  assert.equal(dates.length, 1, "终局页面缺少比赛日期");
  const times = $("h1")
    .map((_, e) => $(e).text().trim())
    .get()
    .filter((t) => /^\d{1,3}:[0-5]\d$/.test(t));
  assert.equal(times.length, 1, "终局页面缺少比赛时长");
  const [minutes, seconds] = times[0].split(":").map(Number);
  const version = $(".col-3.text-right")
    .text()
    .trim()
    .match(/^v(\d+\.\d+)$/)?.[1];
  assert.ok(version, "终局页面缺少比赛版本");
  const tournaments = [
    ...new Set(
      $("a[href*='/tournament-stats/']")
        .map((_, e) => $(e).text().trim())
        .get(),
    ),
  ];
  assert.equal(tournaments.length, 1, "终局页面赛事不唯一");
  const teams: string[] = [],
    results: string[] = [];
  const players: GolInventorySnapshot["players"] = [];
  const versions = new Set<string>();
  for (const [index, side] of ["radiant", "dire"].entries()) {
    const color = index === 0 ? "blue" : "red";
    const team = $(`.${color}-line-header a[href*='/team-stats/']`);
    assert.equal(team.length, 1, "终局页面战队不完整");
    teams.push(team.text().trim());
    const result = team
      .parent()
      .text()
      .trim()
      .match(/ - (WIN|LOSS)$/)?.[1];
    assert.ok(result, "比赛尚未结束或页面缺少赛果");
    results.push(result);
    const tables = $("table.playersInfosLine").filter(
      (_, e) => $(e).find(`thead > tr.${color}-line-header`).length === 1,
    );
    assert.equal(tables.length, 1, "终局页面选手表不唯一");
    const headers = tables
      .find("thead > tr > th")
      .map((_, e) => $(e).text().trim())
      .get();
    assert.equal(headers[0], "Player");
    assert.equal(headers.at(-2), "KDA");
    assert.equal(headers.at(-1), "CS");
    const rows = tables.children("tbody").children("tr");
    assert.equal(rows.length, 5, "终局页面选手不完整");
    rows.each((position, row) => {
      const cells = $(row).children("td");
      assert.equal(cells.length, 4, "终局选手表结构已变化");
      const name = cells.eq(0).find("a[href*='/player-stats/']");
      const hero = cells.eq(0).find("img[src*='/champions_icon/']");
      assert.equal(name.length, 1);
      assert.equal(hero.length, 1);
      const champion = hero
        .attr("src")
        ?.match(/\/champions_icon\/([^/]+)\.png$/)?.[1];
      assert.ok(champion, "终局页面英雄缺失");
      const kda = cells
        .eq(2)
        .text()
        .trim()
        .match(/^(\d+)\/(\d+)\/(\d+)$/);
      const cs = cells.eq(3).text().trim();
      assert.ok(kda && /^\d+$/.test(cs), "终局 KDA 或补刀缺失");
      const equipment = cells.eq(1).find(".col-sm-8");
      assert.equal(equipment.length, 1, "终局页面装备栏缺失");
      const items = equipment
        .find("img")
        .map((_, img) => {
          const source = $(img)
            .attr("src")
            ?.match(
              /^https:\/\/ddragon\.leagueoflegends\.com\/cdn\/(\d+\.\d+\.\d+)\/img\/item\/(\d+)\.png$/,
            );
          assert.ok(source, "终局装备图标格式已变化");
          versions.add(source[1]);
          return Number(source[2]);
        })
        .get();
      players.push({
        side: side as "radiant" | "dire",
        position: position + 1,
        name: name.text().trim(),
        champion,
        kills: Number(kda[1]),
        deaths: Number(kda[2]),
        assists: Number(kda[3]),
        cs: Number(cs),
        items,
      });
    });
  }
  assert.deepEqual([...results].sort(), ["LOSS", "WIN"], "终局胜负数据不完整");
  assert.equal(versions.size, 1, "装备图标版本不唯一");
  const patchVersion = [...versions][0];
  assert.equal(patch(patchVersion), patch(version), "装备图标与比赛版本不一致");
  return snapshotSchema.parse({
    schemaVersion: 2,
    source: "games-of-legends",
    matchId,
    sourceUrl,
    fetchedAt,
    date: dates[0],
    tournament: tournaments[0],
    gameNumber: Number(active.text().match(/\d+/)![0]),
    duration: minutes * 60 + seconds,
    patchVersion,
    blueTeam: teams[0],
    redTeam: teams[1],
    winner: results[0] === "WIN" ? "radiant" : "dire",
    quantityMode: "occupied-slots",
    players,
  });
}

const tournamentsSchema = z
  .array(z.object({ trname: z.string().min(1), firstgame: day, lastgame: day }))
  .max(2000);
export function golTournamentCandidates(input: unknown, match: MatchData) {
  const date = Date.parse(match.date);
  const candidates = tournamentsSchema
    .parse(input)
    .filter(
      (t) =>
        Date.parse(t.firstgame) <= date + 86400000 &&
        Date.parse(t.lastgame) >= date - 36 * 3600000,
    );
  // Prefer a literal league name or acronym (DCGI, MSI, etc.), not a guessed URL.
  const league = canonical(match.league);
  const preferred = candidates.filter(
    (t) =>
      canonical(t.trname).includes(league) ||
      canonical(
        t.trname
          .replace(/\d+/g, "")
          .split(/\s+/)
          .map((w) => w[0] || "")
          .join(""),
      ) === league,
  );
  const selected = preferred.length ? preferred : candidates;
  assert.ok(
    selected.length > 0 && selected.length <= 12,
    "没有范围明确的 GOL 赛事记录",
  );
  return selected.map((t) => t.trname);
}
export function golSeriesCandidates(html: string, match: MatchData) {
  const $ = load(html),
    urls = new Set<string>();
  $("tr").each((_, row) => {
    const cells = $(row).children("td");
    const link = cells.eq(0).find("a[href*='/page-summary/']");
    if (!link.length) return;
    const date = cells.last().text().trim();
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Math.abs(Date.parse(date) - Date.parse(match.date)) > 36 * 3600000
    )
      return;
    const teams = [cells.eq(1).text(), cells.eq(3).text()].map(teamKey).sort();
    if (
      JSON.stringify(teams) !==
      JSON.stringify([match.radiant, match.dire].map(teamKey).sort())
    )
      return;
    assert.match(
      cells.eq(2).text().trim(),
      /^\d+\s*-\s*\d+$/,
      "GOL 系列赛尚未完成",
    );
    const url = safeUrl(link.attr("href")!, origin + "/tournament/");
    assert.match(url, /^https:\/\/gol\.gg\/game\/stats\/\d+\/page-summary\/$/);
    urls.add(url);
  });
  return [...urls];
}
export function golGameLink(html: string, gameNumber: number) {
  const $ = load(html);
  const links = $(".gamemenu a").filter(
    (_, e) => $(e).text().trim().toLowerCase() === `game ${gameNumber}`,
  );
  const urls = [
    ...new Set(
      links.map((_, e) => safeUrl($(e).attr("href")!, origin + "/game/")).get(),
    ),
  ];
  assert.equal(urls.length, 1, "GOL 系列赛缺少当前局或链接不唯一");
  assert.match(urls[0], /^https:\/\/gol\.gg\/game\/stats\/\d+\/page-game\/$/);
  return urls[0];
}

export type GolReader = {
  read(url: string, season?: string): Promise<string>;
  close(): Promise<void>;
};
export type GolReaderFactory = () => Promise<GolReader>;
// One browser per acquisition session, closed on success/failure/deadline. No
// browser or network work when applying an already verified inventory offline.
async function browserReader(): Promise<GolReader> {
  const browser: Browser = await chromium.launch({
    executablePath: await browserPath(),
    headless: true,
    timeout: 20000,
  });
  try {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    await page.route("**/*", (route) =>
      route.request().isNavigationRequest() &&
      route.request().frame() === page.mainFrame() &&
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : route.abort(),
    );
    const timer = setTimeout(() => {
      void browser.close().catch(() => {});
    }, 90000);
    timer.unref();
    return {
      async read(url, season) {
        safeUrl(url, origin);
        if (season) {
          const response = await page.goto(origin + "/tournament/list/", {
            waitUntil: "domcontentloaded",
            timeout: 15000,
          });
          assert.ok(
            response?.ok(),
            `GOL 赛事目录暂不可用（HTTP ${response?.status()}）`,
          );
          const result = await context.request.post(url, {
            form: { season },
            timeout: 15000,
            maxRedirects: 0,
          });
          assert.ok(
            result.ok(),
            `GOL 赛事索引暂不可用（HTTP ${result.status()}）`,
          );
          return result.text();
        }
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });
        assert.ok(
          response?.ok(),
          `GOL 终局页面暂不可用（HTTP ${response?.status()}）`,
        );
        assert.equal(page.url(), url, "GOL 页面发生意外跳转");
        return page.content();
      },
      async close() {
        clearTimeout(timer);
        await browser.close();
      },
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

export class GolInventories {
  private cache = new Map<string, { until: number; value: string }>();
  private tail: Promise<unknown> = Promise.resolve();
  private waiting = 0;
  constructor(private factory: GolReaderFactory = browserReader) {}
  async fetch(
    match: MatchData,
    champions: ChampionCatalog,
  ): Promise<GolInventorySnapshot> {
    assert.ok(match.gameNumber, "当前局缺少局数，无法自动核对终局装备");
    assert.ok(this.waiting < 8, "装备获取队列已满，请稍后重试");
    this.waiting++;
    const task = this.tail
      .catch(() => {})
      .then(() => this.acquire(match, champions));
    this.tail = task;
    try {
      return await task;
    } finally {
      this.waiting--;
    }
  }
  private async acquire(match: MatchData, champions: ChampionCatalog) {
    let reader: GolReader | undefined;
    const read = async (url: string, season?: string, cached = true) => {
      const key = `${url}|${season || ""}`;
      const hit = this.cache.get(key);
      if (cached && hit && hit.until > Date.now()) return hit.value;
      reader ??= await this.factory();
      const value = await reader.read(url, season);
      if (cached) {
        if (this.cache.size >= 64)
          this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, { value, until: Date.now() + 30 * 60000 });
      }
      return value;
    };
    try {
      const season = `S${new Date(match.date).getUTCFullYear() - 2010}`;
      const tournaments = golTournamentCandidates(
        JSON.parse(await read(origin + "/tournament/ajax.trlist.php", season)),
        match,
      );
      const series = new Set<string>();
      for (const name of tournaments) {
        const html = await read(
          `${origin}/tournament/tournament-matchlist/${encodeURIComponent(name)}/`,
        );
        for (const url of golSeriesCandidates(html, match)) series.add(url);
      }
      assert.ok(
        series.size > 0 && series.size <= 4,
        "GOL 中没有可唯一核对的系列赛候选",
      );
      const verified: GolInventorySnapshot[] = [],
        failures: string[] = [];
      for (const url of series) {
        const gameUrl = golGameLink(await read(url), match.gameNumber!);
        const snapshot = parseGolGame(
          await read(gameUrl, undefined, false),
          gameUrl,
          match.id,
        );
        try {
          verified.push(
            verifyGolInventory(match, snapshot, champions).snapshot,
          );
        } catch (error) {
          failures.push(
            error instanceof Error
              ? error.message.split("\n")[0]
              : "终局页面解析失败",
          );
        }
      }
      assert.ok(verified.length <= 1, "多场 GOL 终局均通过核对，未写入装备");
      assert.equal(
        verified.length,
        1,
        `${failures.join("；") || "没有通过核对的 GOL 终局"}，未写入装备`,
      );
      return verified[0];
    } catch (error) {
      this.cache.clear(); // a changed/missing page must be retried fresh next time
      if (error instanceof z.ZodError)
        throw new Error("GOL 终局记录不完整或格式已变化，未写入装备");
      throw error;
    } finally {
      await reader?.close();
    }
  }
}
export const golInventories = new GolInventories();
