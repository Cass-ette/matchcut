import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_MATCH, normalizeMatch, type MatchData } from "../src/domain";

const root = process.cwd();
const cache = path.join(root, "data/cache");
const fixtures = path.join(root, "data/fixtures");
const api = "https://api.opendota.com/api";
let recentCache: { at: number; data: any[] } | null = null;
let inflight: Promise<any[]> | null = null;
let lastRequest = 0;
let requestChain = Promise.resolve();
export async function initializeData() {
  await mkdir(cache, { recursive: true });
  await mkdir(path.join(root, "public/assets/heroes"), { recursive: true });
}
async function exists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}
async function requestJson(endpoint: string): Promise<any> {
  // All requests pass through a single throttle, including concurrent UI requests.
  const previous = requestChain;
  let release!: () => void;
  requestChain = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const wait = Math.max(0, 1100 - (Date.now() - lastRequest));
      if (wait) await new Promise((r) => setTimeout(r, wait));
      lastRequest = Date.now();
      let response: Response;
      try {
        response = await fetch(api + endpoint, {
          signal: AbortSignal.timeout(15000),
          headers: {
            "User-Agent": "Matchcut/0.1 (local video studio)",
            Accept: "application/json",
          },
        });
      } catch {
        if (attempt === 2)
          throw new Error(
            "OpenDota 暂时无法连接。已下载的比赛仍可生成，请稍后再加载新比赛。",
          );
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      if (response.status === 429 || response.status >= 500) {
        if (attempt === 2)
          throw new Error(
            "OpenDota 当前限流或服务繁忙，请稍后重试；已缓存的比赛不受影响。",
          );
        const seconds = Number(response.headers.get("retry-after"));
        await new Promise((r) =>
          setTimeout(
            r,
            Math.min(
              Number.isFinite(seconds) && seconds > 0
                ? seconds * 1000
                : 2000 * (attempt + 1),
              10000,
            ),
          ),
        );
        continue;
      }
      if (!response.ok)
        throw new Error(
          "数据请求失败（HTTP " + response.status + "），请确认比赛编号。",
        );
      return response.json();
    }
    throw new Error("数据服务未返回结果。");
  } finally {
    release();
  }
}
async function heroConstants(): Promise<Record<string, any>> {
  return JSON.parse(await readFile(path.join(fixtures, "heroes.json"), "utf8"));
}
async function ensurePortraits(m: MatchData, heroes: Record<string, any>) {
  for (const p of m.players) {
    const dest = path.join(root, "public/assets/heroes", p.heroId + ".png");
    if (await exists(dest)) continue;
    const relative = heroes[String(p.heroId)]?.img;
    if (typeof relative === "string" && relative.startsWith("/apps/dota2/")) {
      try {
        const r = await fetch(
          "https://cdn.cloudflare.steamstatic.com" + relative,
          { signal: AbortSignal.timeout(8000) },
        );
        if (r.ok && r.headers.get("content-type")?.startsWith("image/")) {
          await writeFile(dest, Buffer.from(await r.arrayBuffer()));
          continue;
        }
      } catch {
        /* Optional artwork must not block statistics. */
      }
    }
    p.image = "/assets/hero-fallback.svg";
  }
}
export async function loadMatch(
  id: string,
): Promise<{ match: MatchData; raw: any; cached: boolean }> {
  if (!/^\d{6,15}$/.test(id)) throw new Error("请输入 6–15 位数字比赛编号。");
  const hero = await heroConstants();
  const file = path.join(cache, id + ".json");
  let raw: any;
  let fetchedAt: string;
  let cached = false;
  if (await exists(file)) {
    const c = JSON.parse(await readFile(file, "utf8"));
    raw = c.raw;
    fetchedAt = c.fetchedAt;
    cached = true;
  } else if (id === DEFAULT_MATCH) {
    const c = JSON.parse(
      await readFile(path.join(fixtures, id + ".json"), "utf8"),
    );
    raw = c.raw;
    fetchedAt = c.fetchedAt;
    cached = true;
  } else {
    raw = await requestJson("/matches/" + id);
    fetchedAt = new Date().toISOString();
  }
  const match = normalizeMatch(raw, hero, fetchedAt);
  if (match.id !== id) throw new Error("返回的比赛编号不一致，已停止生成。");
  if (!cached) await writeFile(file, JSON.stringify({ fetchedAt, raw }));
  await ensurePortraits(match, hero);
  return { match, raw, cached };
}
export async function recentMatches(): Promise<any[]> {
  if (recentCache && Date.now() - recentCache.at < 180000)
    return recentCache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    const data = await requestJson("/proMatches");
    if (!Array.isArray(data))
      throw new Error("职业赛列表格式已变化，请更新数据适配器。");
    recentCache = { at: Date.now(), data };
    return data;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
export async function latestMatch(leagueId?: string, teamId?: string) {
  const candidates = (await recentMatches())
    .filter(
      (m) =>
        m.radiant_name &&
        m.dire_name &&
        m.version != null &&
        (!leagueId || String(m.leagueid) === leagueId) &&
        (!teamId ||
          String(m.radiant_team_id) === teamId ||
          String(m.dire_team_id) === teamId),
    )
    .slice(0, 8);
  if (!candidates.length)
    throw new Error(
      leagueId || teamId
        ? "近期赛表里没有符合筛选条件的已解析比赛。请稍后再试，或使用具体比赛编号。"
        : "近期没有已解析的职业比赛，请稍后再试。",
    );
  let reason = "";
  for (const candidate of candidates)
    try {
      return await loadMatch(String(candidate.match_id));
    } catch (e) {
      reason = (e as Error).message;
    }
  throw new Error("最近的候选比赛暂不具备完整数据。" + reason);
}
