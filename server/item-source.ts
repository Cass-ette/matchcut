import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MatchData } from "../src/domain";
import { dotaItems, dotaItemImage, inventoryItems } from "../src/items";

const png = (bytes: Uint8Array) =>
  Buffer.from(bytes.subarray(0, 8)).toString("hex") === "89504e470d0a1a0a";
export class DotaItemAssets {
  private pending = new Map<number, Promise<boolean>>();
  private retryAfter = new Map<number, number>();
  constructor(
    private root: string,
    private request: typeof fetch = fetch,
  ) {}

  private async image(id: number, signal: AbortSignal): Promise<boolean> {
    if (this.pending.has(id)) return this.pending.get(id)!;
    const task = (async () => {
      const file = path.join(this.root, "public", dotaItemImage(id));
      try {
        if (png(await readFile(file))) return true;
      } catch {}
      const item = dotaItems[id];
      if (
        !item ||
        signal.aborted ||
        (this.retryAfter.get(id) || 0) > Date.now()
      )
        return false;
      try {
        const response = await this.request(item.imageUrl, {
          signal,
          redirect: "error",
        });
        if (
          !response.ok ||
          !response.headers.get("content-type")?.startsWith("image/")
        )
          throw new Error("Item image unavailable");
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > 5 * 1024 * 1024 || !png(bytes))
          throw new Error("Invalid item image");
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, bytes);
        return true;
      } catch {
        this.retryAfter.set(id, Date.now() + 86400000);
        return false;
      }
    })();
    this.pending.set(id, task);
    try {
      return await task;
    } finally {
      this.pending.delete(id);
    }
  }

  async apply(match: MatchData) {
    if (match.game && match.game !== "dota2") return;
    const items = match.players.flatMap((p) =>
      p.inventory ? inventoryItems(p.inventory) : [],
    );
    const ids = [...new Set(items.map((item) => item.id))];
    const available = new Map<number, boolean>();
    // Bound optional downloads for the whole match, including an offline CDN.
    const signal = AbortSignal.timeout(8000);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, ids.length) }, async () => {
        while (next < ids.length) {
          const id = ids[next++];
          available.set(id, await this.image(id, signal));
        }
      }),
    );
    for (const item of items)
      item.image = available.get(item.id) ? dotaItemImage(item.id) : undefined;
  }
}
export const dotaItemAssets = new DotaItemAssets(process.cwd());
