import { readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Game } from "../src/domain";
import type { MediaItem, MediaQuery } from "../src/media";
import { mediaLibrary, listDotaTeams } from "./media-source";
import { listCsMatches } from "./cs-source";
import { ensureLolIndex } from "./lol-source";
import { ArchiveIndex, fileVersion, fingerprint } from "./archive-index";
import { localStore, type StoredMatch } from "./local-store";

export const mediaQuerySchema = z.object({
  kind: z.enum(["team", "hero", "player"]).default("team"),
  query: z.string().trim().max(150).default(""),
  filter: z.enum(["all", "custom", "missing", "review"]).default("all"),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(60),
});
const root = process.cwd();
const store = localStore(root);
const pending = new Map<Game, Promise<void>>();
const archives = {
  dota2: new ArchiveIndex(store, "dota2"),
  cs2: new ArchiveIndex(store, "cs2"),
};
async function directoryVersion(dir: string, deep = false): Promise<unknown> {
  try {
    const names = (
      await readdir(path.join(root, dir), { withFileTypes: true })
    ).filter((e) => deep || e.name.endsWith(".json"));
    return Promise.all(
      names.map(async (entry) => [
        entry.name,
        entry.isDirectory() && deep
          ? await fileVersion(path.join(root, dir, entry.name, "snapshot.json"))
          : await fileVersion(path.join(root, dir, entry.name)),
      ]),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
export async function ensureMediaArchive(game: Game) {
  if (game === "lol") return ensureLolIndex();
  const version = fingerprint(
    game === "cs2"
      ? await Promise.all([
          directoryVersion("data/fixtures/cs"),
          directoryVersion("data/cache/cs", true),
        ])
      : await Promise.all([
          directoryVersion("data/fixtures"),
          directoryVersion("data/cache"),
        ]),
  );
  await archives[game].ensure(version, async () => {
    const summaries =
      game === "cs2" ? await listCsMatches() : await listDotaTeams();
    const unique = new Map(summaries.map((m, i) => [m.id || `dota2-${i}`, m]));
    return [...unique].map(([id, m]) => ({
      id,
      version: fingerprint(m),
      load: async () => ({ ...m, id }) as StoredMatch,
    }));
  });
}
async function signature(game: Game) {
  const files = [
    "data/fixtures/media-catalog-version.json",
    "data/fixtures/team-logos.json",
    "data/fixtures/player-photos.json",
    "data/fixtures/logo-catalog.json",
    "data/cache/logo-catalog/index.json",
    game === "lol"
      ? "data/fixtures/lol/players.json"
      : "data/fixtures/heroes.json",
    game === "lol"
      ? "data/fixtures/lol/champions.json"
      : "data/fixtures/heroes.json",
    "public/assets/lol",
    "public/assets/heroes",
    "public/assets/renders",
    "public/assets/cs",
    "public/assets/players",
    "public/assets/teams",
  ];
  return fingerprint([
    "media-v1",
    store.meta(`archive-revision:${game}`),
    store.meta("overrides-revision"),
    await Promise.all(files.map((f) => fileVersion(path.join(root, f)))),
  ]);
}
export async function ensureMediaIndex(game: Game): Promise<void> {
  if (pending.has(game)) return pending.get(game)!;
  const task = (async () => {
    await ensureMediaArchive(game);
    await mediaLibrary.initialize();
    for (;;) {
      const version = await signature(game);
      if (store.meta(`media:${game}`) === version) return;
      const items = await mediaLibrary.list(game, store.summaries(game));
      // An upload or import may complete while the projection is being built.
      // Never mark that older snapshot with the newer revision.
      if (version !== (await signature(game))) continue;
      store.replaceMedia(game, items, version);
      return;
    }
  })();
  pending.set(game, task);
  try {
    await task;
  } finally {
    pending.delete(game);
  }
}
export async function withThumbnail(item: MediaItem) {
  const src =
    item.kind === "team"
      ? item.images.logo
      : item.images.portrait || item.images.artwork;
  const version = src
    ? fingerprint([
        src,
        src.startsWith("/assets/")
          ? await fileVersion(path.join(root, "public", src))
          : "",
      ])
    : "";
  return {
    ...item,
    thumbnail: src
      ? `/api/media/${encodeURIComponent(item.id)}/thumbnail?game=${item.game}&v=${version}`
      : undefined,
  };
}
export async function mediaPage(game: Game, query: MediaQuery) {
  await ensureMediaIndex(game);
  const result = store.page(game, query);
  return {
    ...result,
    items: await Promise.all(result.items.map(withThumbnail)),
  };
}
export async function mediaItem(game: Game, id: string) {
  await ensureMediaIndex(game);
  const item = store.item(game, id);
  return item ? withThumbnail(item) : undefined;
}
export async function mediaSummaries(game: Game) {
  await ensureMediaArchive(game);
  return store.summaries(game);
}
