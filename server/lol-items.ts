import assert from "node:assert/strict";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { MatchData } from "../src/domain";
import { championFor, type ChampionCatalog } from "../src/lol";
import type { PlayerInventory } from "../src/items";
import {
  golInventories,
  verifyGolInventory,
  type GolInventorySnapshot,
} from "./lol-gol";

const feed = "https://feed.lolesports.com/livestats/v1";
const dragon = "https://ddragon.leagueoflegends.com";
// Public LoL Esports schedule operation, from its persisted-query manifest.
// If Riot changes this operation, fail explicitly; never guess a game ID.
const scheduleHash =
  "f5a7bb64c62eca0f19b048a5835197e8f322b47170a1772ba47bffc0945310ce";
const id = z.string().regex(/^\d{10,25}$/);
const time = z.string().datetime();
const stats = z.object({
  participantId: z.number().int().min(1).max(10),
  kills: z.number().int().nonnegative(),
  deaths: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  creepScore: z.number().int().nonnegative().optional(),
  totalGold: z.number().nonnegative().optional(),
});
const team = z.object({
  participantMetadata: z
    .array(
      z.object({
        participantId: z.number().int().min(1).max(10),
        summonerName: z.string().min(1),
        championId: z.string().min(1),
        role: z.enum(["top", "jungle", "mid", "bottom", "support"]),
      }),
    )
    .length(5),
});
export const lolMetadataSchema = z.object({
  patchVersion: z.string().regex(/^\d+\.\d+\./),
  blueTeamMetadata: team,
  redTeamMetadata: team,
});
const windowFrame = z.object({
  rfc460Timestamp: time,
  gameState: z.string(),
  blueTeam: z.object({ participants: z.array(stats).length(5) }),
  redTeam: z.object({ participants: z.array(stats).length(5) }),
});
export type LolItemCatalog = {
  version: string;
  items: Record<string, { name: string }>;
};
const patch = (s: string) => s.split(".").slice(0, 2).map(Number).join(".");
const canonical = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
const roles = { top: 1, jungle: 2, mid: 3, bottom: 4, support: 5 } as const;

export function verifyLolParticipants(
  match: MatchData,
  input: unknown,
  startedAt: string,
  champions: ChampionCatalog,
) {
  assert.equal(match.game, "lol", "仅支持 LoL 单局");
  assert.ok(
    Math.abs(Date.parse(startedAt) - Date.parse(match.date)) < 5 * 60000,
    "官方比赛时间与当前局不一致",
  );
  const meta = lolMetadataSchema.parse(input);
  if (match.patch)
    assert.equal(
      patch(meta.patchVersion),
      patch(match.patch),
      "比赛版本不一致",
    );
  const result = new Map<number, MatchData["players"][number]>();
  for (const [side, team] of [
    ["radiant", meta.blueTeamMetadata],
    ["dire", meta.redTeamMetadata],
  ] as const) {
    for (const person of team.participantMetadata) {
      assert.ok(!result.has(person.participantId), "官方选手编号重复");
      const player = match.players.find(
        (p) => p.side === side && p.declaredPosition === roles[person.role],
      );
      assert.ok(
        player && ![...result.values()].includes(player),
        "选手位置不一致",
      );
      // Remove only the one explicit team tag, preserving spaces in nicknames.
      const name = person.summonerName.replace(/^\S+\s+/, "");
      assert.ok(
        canonical(player.name) === canonical(name) ||
          canonical(player.name) === canonical(person.summonerName),
        "选手名称不一致",
      );
      assert.equal(
        championFor(person.championId, champions)?.key,
        String(player.heroId),
        "选手英雄不一致",
      );
      result.set(person.participantId, player);
    }
  }
  assert.equal(result.size, 10, "十名选手未完整核对");
  return result;
}

export function lolInventory(
  ids: number[],
  catalog: LolItemCatalog,
): PlayerInventory | undefined {
  if (!ids.length) return undefined;
  const counts = new Map<number, number>();
  for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
  return {
    layout: "list",
    main: [...counts].map(([id, count]) => ({
      id,
      name: catalog.items[id]?.name || `未知装备 #${id}`,
      ...(count > 1 ? { count } : {}),
    })),
  };
}

async function json(file: string) {
  return JSON.parse(await readFile(file, "utf8"));
}
const png = (bytes: Uint8Array) =>
  Buffer.from(bytes.subarray(0, 8)).toString("hex") === "89504e470d0a1a0a";
async function save(file: string, bytes: string | Buffer) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = file + "." + randomUUID() + ".tmp";
  await writeFile(tmp, bytes);
  await rename(tmp, file);
}
export class LolItems {
  private pending = new Map<string, Promise<GolInventorySnapshot>>();
  private imageTasks = new Map<string, Promise<boolean>>();
  private failedImages = new Map<string, number>();
  constructor(
    private root: string,
    private request: typeof fetch = fetch,
    private inventorySource: Pick<
      typeof golInventories,
      "fetch"
    > = golInventories,
  ) {}
  private async get(url: string, init?: RequestInit) {
    const r = await this.request(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.any([
        AbortSignal.timeout(12000),
        ...(init?.signal ? [init.signal] : []),
      ]),
    });
    if (!r.ok) throw new Error(`官方赛事数据暂不可用（HTTP ${r.status}）`);
    return r.json();
  }
  private async champions(): Promise<ChampionCatalog> {
    return json(path.join(this.root, "data/fixtures/lol/champions.json"));
  }
  private file(match: MatchData, fixture = false) {
    assert.match(match.id, /^lol-[A-Za-z0-9_-]{1,100}$/);
    return path.join(
      this.root,
      fixture ? "data/fixtures/lol/inventories" : "data/cache/lol/inventories",
      match.id.slice(4) + ".json",
    );
  }
  async applyCached(match: MatchData) {
    const champions = await this.champions();
    for (const fixture of [false, true]) {
      try {
        const snapshot = await json(this.file(match, fixture));
        await this.attach(match, snapshot, champions, false);
        return true;
      } catch {
        /* Missing or stale snapshots must never block existing statistics. */
      }
    }
    return false;
  }
  private async catalog(
    version: string,
    network: boolean,
  ): Promise<LolItemCatalog> {
    const prefix = patch(version);
    const directory = path.join(this.root, "data/cache/lol/item-catalogs");
    for (const base of [
      directory,
      path.join(this.root, "data/fixtures/lol/item-catalogs"),
    ]) {
      try {
        const catalog = await json(path.join(base, prefix + ".json"));
        assert.match(catalog.version, /^\d+\.\d+\.\d+$/);
        assert.equal(patch(catalog.version), prefix);
        assert.ok(catalog.items && typeof catalog.items === "object");
        return catalog;
      } catch {}
    }
    if (!network) return { version: prefix + ".1", items: {} };
    // Riot also lists legacy names such as "lolpatch_7.20". Ignore those
    // entries instead of rejecting the entire catalog of modern versions.
    const versions = z
      .array(z.string())
      .parse(await this.get(dragon + "/api/versions.json"))
      .filter((v) => /^\d+\.\d+\.\d+$/.test(v));
    const selected = versions.find((v) => patch(v) === prefix);
    if (!selected) return { version: prefix + ".1", items: {} };
    const raw = await this.get(
      `${dragon}/cdn/${selected}/data/zh_CN/item.json`,
    );
    assert.equal(raw.version, selected);
    const catalog = {
      version: selected,
      items: Object.fromEntries(
        Object.entries(raw.data).map(([id, item]: [string, any]) => {
          assert.match(id, /^\d+$/);
          // Hidden/retired items can legitimately have an empty display name.
          // Keep other items usable and retain a truthful fallback for that ID.
          return [
            id,
            { name: z.string().parse(item.name).trim() || `未知装备 #${id}` },
          ];
        }),
      ),
    };
    await save(path.join(directory, prefix + ".json"), JSON.stringify(catalog));
    return catalog;
  }
  private async image(
    version: string,
    id: number,
    network: boolean,
    signal: AbortSignal,
  ) {
    const key = `${version}/${id}`;
    const existing = this.imageTasks.get(key);
    if (existing) return existing;
    const task = (async () => {
      const file = path.join(this.root, `public/assets/lol/items/${key}.png`);
      try {
        if (png(await readFile(file))) return true;
      } catch {}
      if (
        !network ||
        signal.aborted ||
        (this.failedImages.get(key) || 0) > Date.now()
      )
        return false;
      try {
        const r = await this.request(
          `${dragon}/cdn/${version}/img/item/${id}.png`,
          { redirect: "error", signal },
        );
        if (!r.ok || !r.headers.get("content-type")?.startsWith("image/"))
          throw new Error("Item image unavailable");
        const bytes = Buffer.from(await r.arrayBuffer());
        if (bytes.length > 1024 * 1024 || !png(bytes))
          throw new Error("Invalid item image");
        await save(file, bytes);
        return true;
      } catch {
        this.failedImages.set(key, Date.now() + 3600000);
        return false;
      }
    })();
    this.imageTasks.set(key, task);
    try {
      return await task;
    } finally {
      this.imageTasks.delete(key);
    }
  }
  private async attach(
    match: MatchData,
    input: unknown,
    champions: ChampionCatalog,
    network: boolean,
  ) {
    const { snapshot, items } = verifyGolInventory(match, input, champions);
    // An unavailable icon catalog must not discard verified equipment IDs.
    const catalog: LolItemCatalog = await this.catalog(
      snapshot.patchVersion,
      network,
    ).catch(() => ({
      version: patch(snapshot.patchVersion) + ".1",
      items: {},
    }));
    const inventories = match.players.map((p) =>
      lolInventory(items.get(p.slot)!, catalog),
    );
    const ids = [...new Set([...items.values()].flat())];
    const images = new Map<number, boolean>();
    const signal = AbortSignal.timeout(8000);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(ids.length, 4) }, async () => {
        while (next < ids.length) {
          const id = ids[next++];
          images.set(
            id,
            await this.image(
              catalog.version,
              id,
              network && Boolean(catalog.items[id]),
              signal,
            ),
          );
        }
      }),
    );
    match.players.forEach((p, i) => {
      p.inventory = inventories[i];
      for (const item of p.inventory?.main || [])
        if (item && images.get(item.id))
          item.image = `/assets/lol/items/${catalog.version}/${item.id}.png`;
    });
    match.inventorySource = {
      url: snapshot.sourceUrl,
      fetchedAt: snapshot.fetchedAt,
      scope: "final",
      quantityMode: snapshot.quantityMode,
    };
  }
  async readWindow(gameId: string, at?: number, signal?: AbortSignal) {
    const suffix =
      at === undefined
        ? ""
        : `?startingTime=${encodeURIComponent(new Date(at).toISOString())}`;
    const response = await this.get(`${feed}/window/${gameId}${suffix}`, {
      signal,
    });
    assert.equal(response.esportsGameId, gameId, "官方记录的比赛编号不一致");
    return {
      metadata: lolMetadataSchema.parse(response.gameMetadata),
      frames: z.array(windowFrame).min(1).parse(response.frames),
    };
  }
  async candidates(match: MatchData): Promise<{ id: string }[]> {
    if (!match.gameNumber)
      throw new Error("当前局缺少局数，无法自动核对官方比赛记录。");
    const date = Date.parse(match.date);
    const variables = {
      hl: "en_US",
      sport: ["lol"],
      eventState: ["completed"],
      eventType: "match",
      pageSize: 100,
      eventDateStart: new Date(date - 86400000).toISOString().slice(0, 10),
      eventDateEnd: new Date(date + 86400000).toISOString().slice(0, 10),
    };
    const response = await this.get("https://lolesports.com/api/gql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "apollographql-client-name": "Esports Web",
        "apollographql-client-version": "1.0",
      },
      body: JSON.stringify({
        operationName: "scheduleEvents",
        variables,
        extensions: {
          persistedQuery: { version: 1, sha256Hash: scheduleHash },
        },
      }),
    });
    if (response.errors || !Array.isArray(response.data?.esports?.events))
      throw new Error("官方赛程接口已变化或暂不可用，请稍后重试。");
    const games = response.data.esports.events
      .filter(
        (e: any) =>
          canonical(e.league?.name || "") === canonical(match.league) &&
          Math.abs(Date.parse(e.startTime) - date) < 12 * 3600000,
      )
      .flatMap((e: any) =>
        (e.match?.games || []).filter(
          (g: any) => g.state === "completed" && g.number === match.gameNumber,
        ),
      );
    if (!games.length || games.length > 12)
      throw new Error("官方赛程中没有可准确核对的单局记录，当前统计保持不变。");
    return games.map((game: any) => ({ id: id.parse(game.id) }));
  }
  async sync(match: MatchData) {
    assert.equal(match.game, "lol");
    let task = this.pending.get(match.id);
    if (!task) {
      task = this.champions().then((champions) =>
        this.inventorySource.fetch(match, champions),
      );
      this.pending.set(match.id, task);
    }
    try {
      const snapshot = await task;
      const updated = structuredClone(match);
      await this.attach(updated, snapshot, await this.champions(), true);
      await save(this.file(match), JSON.stringify(snapshot, null, 2));
      match.players.forEach((player, i) => {
        player.inventory = updated.players[i].inventory;
      });
      match.inventorySource = updated.inventorySource;
    } finally {
      if (this.pending.get(match.id) === task) this.pending.delete(match.id);
    }
    return match;
  }
}
export const lolItems = new LolItems(process.cwd());
