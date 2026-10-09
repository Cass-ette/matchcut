import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Game } from "../src/domain";
import type { MediaItem, MediaPage, MediaQuery } from "../src/media";

export type StoredMatch = {
  id: string;
  date?: string;
  radiant: string;
  dire: string;
  players?: {
    playerId?: string;
    steamId?: string;
    name: string;
    team?: string;
    aliases?: string[];
  }[];
  [key: string]: unknown;
};
type Registry = {
  version: 1;
  teams: Record<string, unknown>;
  players: Record<string, unknown>;
  heroes: Record<string, unknown>;
};

// JSON archives and published catalogs remain portable source data. This local
// database owns user overrides and indexes the information needed by the UI.
export class LocalStore {
  private database?: DatabaseSync;
  private queue: Promise<unknown> = Promise.resolve();
  private summaryCache = new Map<
    Game,
    { revision: string | undefined; items: StoredMatch[] }
  >();
  constructor(readonly root: string) {}
  get db() {
    if (this.database) return this.database;
    mkdirSync(path.join(this.root, "data"), { recursive: true });
    const db = new DatabaseSync(path.join(this.root, "data/matchcut.sqlite"));
    db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
    const version = Number(
      db.prepare("PRAGMA user_version").get()!.user_version,
    );
    if (version > 1) {
      db.close();
      throw new Error("本地资料库由较新版本创建，请更新 Matchcut。");
    }
    db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS overrides (
        kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
        PRIMARY KEY (kind, id)
      );
      CREATE TABLE IF NOT EXISTS matches (
        game TEXT NOT NULL, id TEXT NOT NULL, version TEXT NOT NULL,
        date TEXT NOT NULL, radiant TEXT NOT NULL, dire TEXT NOT NULL, summary TEXT NOT NULL,
        PRIMARY KEY (game, id)
      );
      CREATE INDEX IF NOT EXISTS match_date ON matches(game, date DESC, id);
      CREATE TABLE IF NOT EXISTS people (
        game TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (game, id)
      );
      CREATE TABLE IF NOT EXISTS appearances (
        game TEXT NOT NULL, match_id TEXT NOT NULL, player_id TEXT NOT NULL,
        name TEXT NOT NULL, team TEXT NOT NULL, date TEXT NOT NULL,
        PRIMARY KEY (game, match_id, player_id),
        FOREIGN KEY (game, match_id) REFERENCES matches(game, id) ON DELETE CASCADE,
        FOREIGN KEY (game, player_id) REFERENCES people(game, id)
      );
      CREATE INDEX IF NOT EXISTS player_appearances ON appearances(game, player_id, date DESC);
      CREATE TABLE IF NOT EXISTS media (
        game TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL,
        sort_order INTEGER NOT NULL, search TEXT NOT NULL,
        custom INTEGER NOT NULL, missing INTEGER NOT NULL, review INTEGER NOT NULL,
        data TEXT NOT NULL, PRIMARY KEY (game, id)
      );
      CREATE INDEX IF NOT EXISTS media_page ON media(game, kind, sort_order, id);
      CREATE INDEX IF NOT EXISTS media_missing ON media(game, kind, missing, sort_order, id);
      CREATE INDEX IF NOT EXISTS media_custom ON media(game, kind, custom, sort_order, id);
      CREATE INDEX IF NOT EXISTS media_review ON media(game, kind, review, sort_order, id);
      PRAGMA user_version=1;
      COMMIT;
    `);
    this.database = db;
    return db;
  }
  close() {
    this.database?.close();
    this.database = undefined;
    this.summaryCache.clear();
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  serial<T>(fn: () => Promise<T>): Promise<T> {
    const task = this.queue.then(fn);
    this.queue = task.catch(() => {});
    return task;
  }
  async settled() {
    await this.queue;
  }
  meta(key: string) {
    return this.db.prepare("SELECT value FROM metadata WHERE key=?").get(key)
      ?.value as string | undefined;
  }
  setMeta(key: string, value: string) {
    this.db
      .prepare(
        "INSERT INTO metadata VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, value);
  }
  migrateRegistry(registry: Registry) {
    if (this.meta("registry-migrated")) return;
    this.transaction(() => {
      this.writeRegistry(registry);
      this.setMeta("registry-migrated", "1");
    });
  }
  registry(): Registry {
    const result: Registry = { version: 1, teams: {}, players: {}, heroes: {} };
    for (const row of this.db
      .prepare("SELECT kind,id,data FROM overrides")
      .all()) {
      result[row.kind as "teams" | "players" | "heroes"][String(row.id)] =
        JSON.parse(String(row.data));
    }
    return result;
  }
  writeRegistry(registry: Registry) {
    // Callers wrap this replacement in a transaction, including migration.
    // Keep untouched bindings in place so a single upload only writes its row.
    const remove = this.db.prepare(
      "DELETE FROM overrides WHERE kind=? AND id=?",
    );
    for (const row of this.db.prepare("SELECT kind,id FROM overrides").all()) {
      const kind = row.kind as "teams" | "players" | "heroes";
      if (!Object.hasOwn(registry[kind], String(row.id)))
        remove.run(kind, String(row.id));
    }
    const put = this.db.prepare(
      "INSERT INTO overrides VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data WHERE data!=excluded.data",
    );
    for (const kind of ["teams", "players", "heroes"] as const)
      for (const [id, data] of Object.entries(registry[kind]))
        put.run(kind, id, JSON.stringify(data));
    this.setMeta(
      "overrides-revision",
      String(Number(this.meta("overrides-revision") || 0) + 1),
    );
  }
  matchVersions(game: Game) {
    return new Map(
      this.db
        .prepare("SELECT id,version FROM matches WHERE game=?")
        .all(game)
        .map((r) => [String(r.id), String(r.version)]),
    );
  }
  syncMatches(
    game: Game,
    entries: { match: StoredMatch; version: string }[],
    ids: Set<string>,
    sourceVersion: string,
  ) {
    this.transaction(() => {
      const put = this.db.prepare(
        "INSERT INTO matches VALUES (?,?,?,?,?,?,?) ON CONFLICT(game,id) DO UPDATE SET version=excluded.version,date=excluded.date,radiant=excluded.radiant,dire=excluded.dire,summary=excluded.summary",
      );
      const person = this.db.prepare(
        "INSERT OR IGNORE INTO people VALUES (?,?)",
      );
      const appearance = this.db.prepare(
        "INSERT INTO appearances VALUES (?,?,?,?,?,?)",
      );
      for (const { match, version } of entries) {
        const { players, ...summary } = match;
        put.run(
          game,
          match.id,
          version,
          match.date || "",
          match.radiant,
          match.dire,
          JSON.stringify(summary),
        );
        this.db
          .prepare("DELETE FROM appearances WHERE game=? AND match_id=?")
          .run(game, match.id);
        for (const p of players || []) {
          const id = p.playerId || p.steamId;
          if (!id) continue;
          person.run(game, id);
          appearance.run(
            game,
            match.id,
            id,
            p.name,
            p.team || "",
            match.date || "",
          );
        }
      }
      for (const id of this.matchVersions(game).keys())
        if (!ids.has(id))
          this.db
            .prepare("DELETE FROM matches WHERE game=? AND id=?")
            .run(game, id);
      this.setMeta(`archive:${game}`, sourceVersion);
      this.setMeta(
        `archive-revision:${game}`,
        String(Number(this.meta(`archive-revision:${game}`) || 0) + 1),
      );
    });
  }
  matches<T>(game: Game): T[] {
    return this.db
      .prepare("SELECT summary FROM matches WHERE game=? ORDER BY date DESC,id")
      .all(game)
      .map((r) => JSON.parse(String(r.summary)));
  }
  summaries(game: Game): StoredMatch[] {
    const revision = this.meta(`archive-revision:${game}`);
    const cached = this.summaryCache.get(game);
    if (cached && cached.revision === revision) return cached.items;
    const teams = this.db
      .prepare(
        "SELECT radiant AS name FROM matches WHERE game=? UNION SELECT dire FROM matches WHERE game=?",
      )
      .all(game, game);
    const players = this.db
      .prepare(
        `
      SELECT player_id, name, team FROM appearances WHERE game=?
      ORDER BY player_id,date DESC,match_id DESC
    `,
      )
      .all(game);
    const people = new Map<
      string,
      NonNullable<StoredMatch["players"]>[number]
    >();
    const aliases = new Map<string, Set<string>>();
    for (const row of players) {
      const id = String(row.player_id);
      if (!people.has(id)) {
        people.set(id, { playerId: id, name: String(row.name), aliases: [] });
        aliases.set(id, new Set());
      }
      aliases.get(id)!.add(String(row.name));
      if (row.team) aliases.get(id)!.add(String(row.team));
    }
    for (const [id, p] of people) p.aliases = [...aliases.get(id)!];
    const items = [
      ...teams.map((t) => ({ id: "", radiant: String(t.name), dire: "" })),
      { id: "", radiant: "", dire: "", players: [...people.values()] },
    ];
    this.summaryCache.set(game, { revision, items });
    return items;
  }
  replaceMedia(game: Game, items: MediaItem[], signature: string) {
    this.transaction(() => {
      this.db.prepare("DELETE FROM media WHERE game=?").run(game);
      const put = this.db.prepare(
        "INSERT INTO media VALUES (?,?,?,?,?,?,?,?,?,?)",
      );
      items.forEach((item, index) =>
        put.run(
          game,
          item.id,
          item.kind,
          item.name,
          index,
          [item.name, ...item.aliases]
            .join("\n")
            .normalize("NFKC")
            .toLowerCase(),
          Number(item.overrides.length > 0),
          Number(
            item.kind === "team"
              ? !item.images.logo
              : item.kind === "player"
                ? !item.images.portrait && !item.images.artwork
                : !item.images.portrait || !item.images.artwork,
          ),
          Number(Boolean(item.logoReview)),
          JSON.stringify(item),
        ),
      );
      this.setMeta(`media:${game}`, signature);
    });
  }
  item(game: Game, id: string): MediaItem | undefined {
    const row = this.db
      .prepare("SELECT data FROM media WHERE game=? AND id=?")
      .get(game, id);
    return row ? JSON.parse(String(row.data)) : undefined;
  }
  page(game: Game, query: MediaQuery): MediaPage {
    const condition = ["game=?", "kind=?"];
    const args: (string | number)[] = [game, query.kind];
    if (query.query) {
      condition.push("instr(search,?)>0");
      args.push(query.query.normalize("NFKC").toLowerCase());
    }
    const filters = {
      all: "",
      custom: "custom=1",
      missing: "missing=1",
      review: "review=1",
    };
    if (!Object.hasOwn(filters, query.filter))
      throw new Error("素材筛选无效。");
    if (
      !Number.isInteger(query.limit) ||
      query.limit < 1 ||
      query.limit > 100 ||
      !Number.isInteger(query.offset) ||
      query.offset < 0
    )
      throw new Error("素材分页无效。");
    if (filters[query.filter]) condition.push(filters[query.filter]);
    const where = condition.join(" AND ");
    const total = Number(
      this.db
        .prepare(`SELECT count(*) AS n FROM media WHERE ${where}`)
        .get(...args)!.n,
    );
    const items = this.db
      .prepare(
        `SELECT data FROM media WHERE ${where} ORDER BY sort_order,id LIMIT ? OFFSET ?`,
      )
      .all(...args, query.limit, query.offset)
      .map((r) => JSON.parse(String(r.data)) as MediaItem);
    const counts = { team: 0, hero: 0, player: 0 };
    for (const row of this.db
      .prepare(
        "SELECT kind,count(*) AS n FROM media WHERE game=? GROUP BY kind",
      )
      .all(game))
      counts[row.kind as keyof typeof counts] = Number(row.n);
    return { items, total, counts, offset: query.offset, limit: query.limit };
  }
}

const stores = new Map<string, LocalStore>();
export function localStore(root = process.cwd()) {
  const key = path.resolve(root);
  let store = stores.get(key);
  if (!store) {
    store = new LocalStore(key);
    stores.set(key, store);
  }
  return store;
}
