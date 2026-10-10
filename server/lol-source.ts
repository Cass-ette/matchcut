import { parse } from "csv-parse";
import { Readable } from "node:stream";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  access,
  mkdtemp,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import {
  ChampionCatalog,
  OracleRow,
  championFor,
  normalizeLol,
} from "../src/lol";
import { MatchData, matchIdSchema } from "../src/domain";
import {
  LolMediaSummary,
  groupLolSeries,
  summarizeLolSeries,
} from "../src/series";
import { mediaLibrary, type TeamSummary } from "./media-source";
import { localStore } from "./local-store";
import { lolItems } from "./lol-items";
import {
  ArchiveIndex,
  fileVersion,
  fingerprint,
  type ArchiveEntry,
} from "./archive-index";

const root = process.cwd();
const fixtures = path.join(root, "data/fixtures/lol");
const cache = path.join(root, "data/cache/lol");
const assets = path.join(root, "public/assets/lol");
type Snapshot = {
  fetchedAt: string;
  rows: OracleRow[];
  filename?: string;
  mirror?: string;
  provider?: string;
};
const catalog: ChampionCatalog = JSON.parse(
  await readFile(path.join(fixtures, "champions.json"), "utf8"),
);
let importBusy = false;
const summary = ({
  id,
  league,
  date,
  radiant,
  dire,
  gameNumber,
  players,
}: MatchData): LolMediaSummary => ({
  id,
  league,
  date,
  radiant,
  dire,
  gameNumber,
  players: players.map((p) => ({
    playerId: p.playerId,
    name: p.name,
    team: p.side === "radiant" ? radiant : dire,
  })),
});
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const exists = async (file: string) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};
const store = localStore(root);
const archive = new ArchiveIndex(store, "lol");
export async function ensureLolIndex() {
  const indexFile = path.join(cache, "index.json");
  const files = (await readdir(fixtures))
    .filter((name) => /^LOLTMNT[\w-]+\.json$/.test(name))
    .sort();
  const versions = await Promise.all(
    files.map((name) => fileVersion(path.join(fixtures, name))),
  );
  const version = fingerprint([await fileVersion(indexFile), files, versions]);
  await archive.ensure(version, async () => {
    const items: LolMediaSummary[] = (await exists(indexFile))
      ? await json(indexFile)
      : [];
    const entries: ArchiveEntry[] = items.map((item) => ({
      id: item.id,
      version: fingerprint(item),
      load: async () => {
        if (item.players?.length) return item;
        const file = path.join(cache, item.id + ".json");
        const raw: Snapshot = await json(
          (await exists(file))
            ? file
            : path.join(fixtures, item.id.slice(4) + ".json"),
        );
        return summary(normalizeLol(raw.rows, catalog, raw.fetchedAt));
      },
    }));
    const known = new Set(items.map((m) => m.id));
    files.forEach((name, i) => {
      const id = "lol-" + name.slice(0, -5);
      if (known.has(id)) return;
      entries.push({
        id,
        version: versions[i],
        load: async () => {
          const raw: Snapshot = await json(path.join(fixtures, name));
          return summary(normalizeLol(raw.rows, catalog, raw.fetchedAt));
        },
      });
    });
    return entries;
  });
}
export async function listLolMatches(): Promise<LolMediaSummary[]> {
  await ensureLolIndex();
  return store.matches("lol");
}
export async function listLolMedia(): Promise<TeamSummary[]> {
  await ensureLolIndex();
  return store.summaries("lol");
}

const failedAssets = new Map<string, number>();
async function downloadAsset(url: string, file: string) {
  if (await exists(file)) return true;
  if (Date.now() - (failedAssets.get(file) || 0) < 86400000) return false;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.startsWith("image/")
    )
      throw new Error("图片下载失败");
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length < 100 || data.length > 5000000)
      throw new Error("图片大小异常");
    await writeFile(file + ".tmp", data);
    await rename(file + ".tmp", file);
    return true;
  } catch {
    failedAssets.set(file, Date.now());
    return false;
  }
}
let assetQueue = Promise.resolve();
async function attachAssets(match: MatchData) {
  await mkdir(assets, { recursive: true });
  for (const p of match.players) {
    const champion = championFor(p.hero, catalog);
    if (!champion) continue;
    const key = champion.id;
    const tasks = await Promise.all([
      downloadAsset(
        `https://ddragon.leagueoflegends.com/cdn/${catalog.version}/img/champion/${key}.png`,
        path.join(assets, key + ".png"),
      ),
      downloadAsset(
        `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${key}_0.jpg`,
        path.join(assets, key + ".jpg"),
      ),
    ]);
    if (tasks[0]) p.image = "/assets/lol/" + key + ".png";
    if (tasks[1]) p.artwork = "/assets/lol/" + key + ".jpg";
  }
}
export async function loadLolMatch(id: string) {
  matchIdSchema.parse(id);
  if (!id.startsWith("lol-")) throw new Error("不是英雄联盟比赛编号");
  const file = path.join(cache, id + ".json");
  const raw: Snapshot = (await exists(file))
    ? await json(file)
    : (await exists(path.join(fixtures, id.slice(4) + ".json")))
      ? await json(path.join(fixtures, id.slice(4) + ".json"))
      : (() => {
          throw new Error("本地没有这场比赛，请先导入 Oracle’s Elixir CSV。");
        })();
  const match = normalizeLol(raw.rows, catalog, raw.fetchedAt);
  const task = assetQueue.then(() => attachAssets(match));
  assetQueue = task.catch(() => {});
  await task;
  await lolItems.applyCached(match);
  await mediaLibrary.apply(match);
  return { match, raw, cached: true };
}

export async function loadLolSeries(id: string, gameIds?: string[]) {
  matchIdSchema.parse(id);
  const group = groupLolSeries(await listLolMatches()).find((s) =>
    s.games.some((g) => g.id === id),
  );
  if (!group) throw new Error("本地没有这组系列赛，请先导入 CSV。");
  // Freeze the reviewed game set in jobs/projects; new imports cannot silently alter it.
  const ids = gameIds ?? group.games.map((g) => g.id);
  if (
    !ids.length ||
    !ids.includes(id) ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !group.games.some((g) => g.id === id))
  )
    throw new Error("系列赛局数与本地比赛库不一致，请重新选择比赛。");
  const data = [];
  for (const gameId of ids) data.push(await loadLolMatch(gameId));
  return {
    match: summarizeLolSeries(data.map((d) => d.match)),
    raw: {
      mode: "series",
      games: data.map((d) => ({
        matchId: d.match.id,
        source: d.match.source,
        snapshot: d.raw,
      })),
    },
    cached: true,
  };
}

// Streaming CSV parser supports quoted commas, BOM, CRLF and multiline fields.
// Stage valid games until parsing finishes so malformed uploads leave the archive intact.
export async function importLolCsv(
  content: Buffer,
  filename: string,
  target = cache,
) {
  if (importBusy) throw new Error("正在导入另一份 CSV，请稍后重试。");
  importBusy = true;
  let stage: string | undefined;
  try {
    await mkdir(target, { recursive: true });
    stage = await mkdtemp(path.join(target, ".import-"));
    function* chunks() {
      for (let offset = 0; offset < content.length; offset += 65536)
        yield content.subarray(offset, offset + 65536);
    }
    const parser = Readable.from(chunks()).pipe(
      parse({
        bom: true,
        columns: true,
        skip_empty_lines: true,
        max_record_size: 1024 * 1024,
      }),
    );
    const pending = new Map<string, OracleRow[]>(),
      accepted = new Map<string, LolMediaSummary>();
    let skipped = 0,
      rowCount = 0;
    const examples: string[] = [];
    const fetchedAt = new Date().toISOString();
    for await (const row of parser as AsyncIterable<OracleRow>) {
      if (
        !rowCount++ &&
        ![
          "gameid",
          "position",
          "side",
          "playername",
          "teamname",
          "damagetochampions",
        ].every((key) => key in row)
      )
        throw new Error("不是 Oracle’s Elixir 比赛 CSV，缺少必要列。");
      if (!row.gameid || !/^[A-Za-z0-9_-]{1,100}$/.test(row.gameid))
        throw new Error("CSV 含无效 gameid");
      if (accepted.has("lol-" + row.gameid))
        throw new Error("CSV 含重复比赛：" + row.gameid);
      const rows = pending.get(row.gameid) || [];
      rows.push(row);
      pending.set(row.gameid, rows);
      if (pending.size > 10000)
        throw new Error("超过 10,000 场不完整比赛，请按 gameid 排序后导入。");
      if (rows.length === 12) {
        pending.delete(row.gameid);
        const id = "lol-" + row.gameid;
        if (accepted.has(id)) throw new Error("CSV 含重复比赛：" + row.gameid);
        let match: MatchData;
        try {
          match = normalizeLol(rows, catalog, fetchedAt);
        } catch (error) {
          skipped++;
          if (examples.length < 3)
            examples.push(row.gameid + "：" + (error as Error).message);
          continue;
        }
        accepted.set(id, summary(match));
        await writeFile(
          path.join(stage, id + ".json"),
          JSON.stringify({
            provider: "Oracle’s Elixir",
            filename: filename.slice(0, 200),
            fetchedAt,
            rows,
          }),
        );
      }
    }
    skipped += pending.size;
    if (!accepted.size)
      throw new Error(
        "没有可用的完整比赛。" +
          (examples[0] || "每场需要十名选手和两行战队数据。"),
      );
    const indexFile = path.join(target, "index.json");
    const index = new Map<string, LolMediaSummary>(
      ((await exists(indexFile))
        ? ((await json(indexFile)) as LolMediaSummary[])
        : []
      ).map((m) => [m.id, m]),
    );
    for (const [id, item] of accepted) {
      await rename(
        path.join(stage, id + ".json"),
        path.join(target, id + ".json"),
      );
      index.set(id, item);
    }
    await writeFile(indexFile + ".tmp", JSON.stringify([...index.values()]));
    await rename(indexFile + ".tmp", indexFile);
    if (target === cache) await ensureLolIndex();
    return {
      imported: accepted.size,
      skipped,
      examples,
      matches: [...accepted.values()].sort((a, b) =>
        b.date.localeCompare(a.date),
      ),
    };
  } finally {
    importBusy = false;
    if (stage) await rm(stage, { recursive: true, force: true });
  }
}
