import { mkdir, readFile, rename, writeFile, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { fileVersion } from "./archive-index";
import type { MediaItem } from "../src/media";

export class Thumbnails {
  private pending = new Map<string, Promise<Buffer>>();
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(
    private root: string,
    private logoImage: (sha: string) => Promise<Buffer>,
  ) {}
  async image(item: MediaItem): Promise<Buffer | undefined> {
    const src =
      item.kind === "team"
        ? item.images.logo
        : item.images.portrait || item.images.artwork;
    if (!src) return;
    const remote = /^\/api\/logo-catalog\/image\/([a-f0-9]{40})$/.exec(src);
    let file: string | undefined;
    if (!remote) {
      if (!src.startsWith("/assets/")) throw new Error("素材路径无效。");
      try {
        const base = await realpath(path.join(this.root, "public/assets"));
        file = await realpath(path.join(this.root, "public", src));
        if (!file.startsWith(base + path.sep))
          throw new Error("素材路径无效。");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
    }
    const key = createHash("sha256")
      .update(
        JSON.stringify([
          "thumb-v1",
          src,
          file ? await fileVersion(file) : "remote",
        ]),
      )
      .digest("hex");
    const dest = path.join(this.root, "data/cache/thumbnails", key + ".webp");
    try {
      return await readFile(dest);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (this.pending.has(key)) return this.pending.get(key)!;
    const task = (async () => {
      if (this.active >= 4)
        await new Promise<void>((resolve) => this.waiting.push(resolve));
      else this.active++;
      try {
        const bytes = remote
          ? await this.logoImage(remote[1])
          : await readFile(file!);
        const result = await sharp(bytes, { limitInputPixels: 40_000_000 })
          .rotate()
          .resize({
            width: 320,
            height: 320,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 78, alphaQuality: 85 })
          .toBuffer();
        await mkdir(path.dirname(dest), { recursive: true });
        const temporary = dest + "." + randomUUID() + ".tmp";
        await writeFile(temporary, result);
        await rename(temporary, dest);
        return result;
      } finally {
        const next = this.waiting.shift();
        if (next) next();
        else this.active--;
      }
    })();
    this.pending.set(key, task);
    try {
      return await task;
    } finally {
      this.pending.delete(key);
    }
  }
}
