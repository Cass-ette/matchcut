import { stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { Game } from "../src/domain";
import { LocalStore, type StoredMatch } from "./local-store";

export async function fileVersion(file: string): Promise<string> {
  try {
    const s = await stat(file);
    return `${s.size}:${s.mtimeMs}:${s.ctimeMs}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    throw error;
  }
}
export const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type ArchiveEntry = {
  id: string;
  version: string;
  load: () => Promise<StoredMatch>;
};

export class ArchiveIndex {
  private pending?: Promise<void>;
  constructor(
    private store: LocalStore,
    private game: Game,
  ) {}
  async ensure(
    version: string,
    entries: () => Promise<ArchiveEntry[]>,
  ): Promise<void> {
    if (this.pending) {
      await this.pending;
      return this.ensure(version, entries);
    }
    if (this.store.meta(`archive:${this.game}`) === version) return;
    const task = (async () => {
      const source = await entries();
      const ids = new Set(source.map((e) => e.id));
      if (ids.size !== source.length) throw new Error("比赛索引包含重复 ID。");
      const existing = this.store.matchVersions(this.game);
      const changed = source.filter((e) => existing.get(e.id) !== e.version);
      const loaded: { match: StoredMatch; version: string }[] = [];
      let cursor = 0;
      const workers = await Promise.allSettled(
        Array.from({ length: 4 }, async () => {
          while (cursor < changed.length) {
            const entry = changed[cursor++];
            const match = await entry.load();
            if (match.id !== entry.id)
              throw new Error("比赛索引与原始文件 ID 不一致。");
            loaded.push({ match, version: entry.version });
          }
        }),
      );
      for (const result of workers)
        if (result.status === "rejected") throw result.reason;
      this.store.syncMatches(this.game, loaded, ids, version);
    })();
    this.pending = task;
    try {
      await task;
    } finally {
      this.pending = undefined;
    }
  }
}
