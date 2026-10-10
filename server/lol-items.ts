import assert from "node:assert/strict";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { MatchData } from "../src/domain";
import { championFor, type ChampionCatalog } from "../src/lol";
import type { PlayerInventory } from "../src/items";

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
const metadata = z.object({
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
const detailFrame = z.object({
  rfc460Timestamp: time,
  participants: z
    .array(
      stats.extend({ items: z.array(z.number().int().positive()).max(32) }),
    )
    .length(10),
});
const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  esportsGameId: id,
  fetchedAt: time,
  startedAt: time,
  metadata,
  window: windowFrame,
  details: detailFrame,
});
export type LolInventorySnapshot = z.infer<typeof snapshotSchema>;
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

// Bind every participant by side + recorded role + exact name + champion.
// The ten final K/D/A values must also match the imported game.
export function verifyLolInventory(
  match: MatchData,
  input: unknown,
  champions: ChampionCatalog,
) {
  assert.equal(match.game, "lol", "仅支持 LoL 单局");
  const snapshot = snapshotSchema.parse(input);
  assert.equal(snapshot.window.gameState, "finished", "官方装备记录尚未到终局");
  const start = Date.parse(snapshot.startedAt);
  const end = Date.parse(snapshot.window.rfc460Timestamp);
  assert.ok(
    Math.abs(start - Date.parse(match.date)) < 5 * 60000,
    "官方比赛时间与当前局不一致",
  );
  assert.ok(
    end - start >= match.duration * 1000 - 30000 &&
      end - start <= (match.duration + 7200) * 1000,
    "官方记录时长与当前局不一致",
  );
  assert.equal(
    snapshot.details.rfc460Timestamp,
    snapshot.window.rfc460Timestamp,
    "装备帧与终局帧不一致",
  );
  if (match.patch)
    assert.equal(
      patch(snapshot.metadata.patchVersion),
      patch(match.patch),
      "比赛版本不一致",
    );
  const result = new Map<number, number[]>();
  const seen = new Set<number>();
  for (const [side, meta, final] of [
    ["radiant", snapshot.metadata.blueTeamMetadata, snapshot.window.blueTeam],
    ["dire", snapshot.metadata.redTeamMetadata, snapshot.window.redTeam],
  ] as const) {
    for (const person of meta.participantMetadata) {
      assert.ok(!seen.has(person.participantId), "官方选手编号重复");
      seen.add(person.participantId);
      const player = match.players.find(
        (p) => p.side === side && p.declaredPosition === roles[person.role],
      );
      assert.ok(player && !result.has(player.slot), "选手位置不一致");
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
      const details = snapshot.details.participants.filter(
        (p) => p.participantId === person.participantId,
      );
      const records = final.participants.filter(
        (p) => p.participantId === person.participantId,
      );
      assert.equal(details.length, 1, "装备选手数据不完整");
      assert.equal(records.length, 1, "终局选手数据不完整");
      for (const record of [details[0], records[0]])
        for (const key of ["kills", "deaths", "assists"] as const)
          assert.equal(record[key], player[key], "官方终局 KDA 与当前局不一致");
      // The feed is a list, including trinkets/consumables and stack copies.
      // It does not describe six hotkey slots. Do not pad it with empty slots.
      assert.ok(
        new Set(details[0].items).size <= 8,
        "该局装备列表超出可展示范围",
      );
      result.set(player.slot, details[0].items);
    }
  }
  assert.equal(result.size, 10, "十名选手装备未完整核对");
  return { snapshot, items: result };
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
  private pending = new Map<string, Promise<LolInventorySnapshot>>();
  private imageTasks = new Map<string, Promise<boolean>>();
  private failedImages = new Map<string, number>();
  constructor(
    private root: string,
    private request: typeof fetch = fetch,
  ) {}
  private async get(url: string, init?: RequestInit) {
    const r = await this.request(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw new Error(`官方装备数据暂不可用（HTTP ${r.status}）`);
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
    const versions = z
      .array(z.string().regex(/^\d+\.\d+\.\d+$/))
      .parse(await this.get(dragon + "/api/versions.json"));
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
          return [id, { name: z.string().min(1).parse(item.name) }];
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
    const { snapshot, items } = verifyLolInventory(match, input, champions);
    // An unavailable icon catalog must not discard verified equipment IDs.
    const catalog: LolItemCatalog = await this.catalog(
      snapshot.metadata.patchVersion,
      network,
    ).catch(() => ({
      version: patch(snapshot.metadata.patchVersion) + ".1",
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
      url: `${feed}/details/${snapshot.esportsGameId}`,
      fetchedAt: snapshot.fetchedAt,
      timestamp: snapshot.details.rfc460Timestamp,
    };
  }
  private async fetchSnapshot(match: MatchData): Promise<LolInventorySnapshot> {
    if (!match.gameNumber)
      throw new Error("当前局缺少局数，无法自动核对官方装备。");
    const champions = await this.champions();
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
      throw new Error("官方赛程中没有可准确核对的单局装备，当前统计保持不变。");
    const verified: LolInventorySnapshot[] = [];
    for (const game of games) {
      const gameId = id.parse(game.id);
      const initial = await this.get(`${feed}/window/${gameId}`);
      const first = windowFrame.parse(initial.frames?.[0]);
      if (Math.abs(Date.parse(first.rfc460Timestamp) - date) >= 5 * 60000)
        continue;
      const after = new Date(
        Math.ceil((date + (match.duration + 7200) * 1000) / 10000) * 10000,
      ).toISOString();
      const suffix = `/${gameId}?startingTime=${encodeURIComponent(after)}`;
      const [window, details] = await Promise.all([
        this.get(`${feed}/window${suffix}`),
        this.get(`${feed}/details${suffix}`),
      ]);
      const final = z.array(windowFrame).min(1).parse(window.frames).at(-1)!;
      const detail = z
        .array(detailFrame)
        .min(1)
        .parse(details.frames)
        .find((f) => f.rfc460Timestamp === final.rfc460Timestamp);
      try {
        const snapshot = verifyLolInventory(
          match,
          {
            schemaVersion: 1,
            esportsGameId: gameId,
            fetchedAt: new Date().toISOString(),
            startedAt: first.rfc460Timestamp,
            metadata: initial.gameMetadata,
            window: final,
            details: detail,
          },
          champions,
        ).snapshot;
        verified.push(snapshot);
      } catch {
        /* A mismatched candidate must not be attached to this match. */
      }
    }
    if (verified.length !== 1)
      throw new Error("无法唯一核对十名选手、英雄和终局 KDA，未写入装备。");
    return verified[0];
  }
  async sync(match: MatchData) {
    assert.equal(match.game, "lol");
    let task = this.pending.get(match.id);
    if (!task) {
      task = this.fetchSnapshot(match);
      this.pending.set(match.id, task);
    }
    try {
      const snapshot = await task;
      await this.attach(match, snapshot, await this.champions(), true);
      await save(this.file(match), JSON.stringify(snapshot, null, 2));
    } finally {
      if (this.pending.get(match.id) === task) this.pending.delete(match.id);
    }
    return match;
  }
}
export const lolItems = new LolItems(process.cwd());
