import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import type { CatalogLogo, LogoCatalogData } from "../src/media";

const repo = "lootmarket/esport-team-logos";
const folders = { "dota-2": "dota2", "league-of-legends": "lol" } as const;
export const logoShaSchema = z.string().regex(/^[a-f0-9]{40}$/);
const logoSchema = z.object({
  game: z.enum(["dota2", "lol"]),
  name: z.string().min(1),
  path: z.string().refine((value) => {
    const pieces = value.split("/");
    return (
      pieces[0] in folders &&
      pieces.length >= 3 &&
      pieces.every(
        (piece) =>
          !!piece &&
          piece !== "." &&
          piece !== ".." &&
          !/[\\\x00-\x1f]/.test(piece),
      ) &&
      /\.(png|jpe?g|webp)$/i.test(value)
    );
  }),
  sha: logoShaSchema,
});
const catalogSchema = z.object({
  fetchedAt: z.string(),
  logos: z.array(logoSchema).min(1).max(15000),
});
export const logoRepositoryUrl = (logo: CatalogLogo) =>
  `https://github.com/${repo}/blob/master/${logo.path.split("/").map(encodeURIComponent).join("/")}`;

export class LogoCatalog {
  private cached?: LogoCatalogData;
  private loading?: Promise<LogoCatalogData>;
  private downloads = new Map<string, Promise<Buffer>>();
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(
    private root: string,
    private fetcher: typeof fetch = fetch,
  ) {}
  private get cacheFile() {
    return path.join(this.root, "data/cache/logo-catalog/index.json");
  }
  private async atomic(file: string, content: Buffer | string) {
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, content);
    await rename(temporary, file);
  }
  private async request(url: string, limit: number): Promise<Buffer> {
    const response = await this.fetcher(url, {
      headers: {
        "User-Agent": "Matchcut/0.1",
        Accept: "application/vnd.github+json",
      },
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(
        response.status === 403 || response.status === 429
          ? "图标库暂时限流，请稍后重试。"
          : `图标库请求失败（HTTP ${response.status}）。`,
      );
    if (Number(response.headers.get("content-length")) > limit)
      throw new Error("图标文件过大。");
    if (!response.body) throw new Error("图标库返回了空文件。");
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) {
          await reader.cancel();
          throw new Error("图标文件过大。");
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks);
  }
  private async tree(ref: string, recursive = false) {
    const bytes = await this.request(
      `https://api.github.com/repos/${repo}/git/trees/${ref}${recursive ? "?recursive=1" : ""}`,
      8 * 1024 * 1024,
    );
    const data = JSON.parse(bytes.toString("utf8"));
    if (!Array.isArray(data.tree) || data.truncated)
      throw new Error("图标目录不完整，请稍后更新。");
    return data.tree as { path: string; sha: string; type: string }[];
  }
  private async refresh(): Promise<LogoCatalogData> {
    const root = await this.tree("master");
    const results = await Promise.all(
      Object.entries(folders).map(async ([folder, game]) => {
        const branch = root.find(
          (entry) => entry.path === folder && entry.type === "tree",
        );
        if (!branch) throw new Error("图标库缺少游戏目录。");
        logoShaSchema.parse(branch.sha);
        return (await this.tree(branch.sha, true))
          .filter(
            (entry) =>
              entry.type === "blob" && /\.(png|jpe?g|webp)$/i.test(entry.path),
          )
          .flatMap((entry) => {
            const parsed = logoSchema.safeParse({
              game,
              name: entry.path.split("/")[0].replace(/-/g, " "),
              path: `${folder}/${entry.path}`,
              sha: entry.sha,
            });
            return parsed.success ? [parsed.data] : [];
          });
      }),
    );
    const result = catalogSchema.parse({
      fetchedAt: new Date().toISOString(),
      logos: results.flat().sort((a, b) => a.name.localeCompare(b.name)),
    });
    await this.atomic(this.cacheFile, JSON.stringify(result));
    this.cached = result;
    return result;
  }
  async list(refresh = false): Promise<LogoCatalogData> {
    if (this.loading) return this.loading;
    if (this.cached && !refresh) return this.cached;
    this.loading = (async () => {
      await this.local();
      if (this.cached && !refresh) return this.cached;
      try {
        return await this.refresh();
      } catch (error) {
        if (this.cached)
          return {
            ...this.cached,
            warning: "更新失败，继续使用本地图标目录。",
          };
        throw new Error("无法连接图标库，请稍后重试。");
      }
    })();
    try {
      return await this.loading;
    } finally {
      this.loading = undefined;
    }
  }
  async local(): Promise<LogoCatalogData | undefined> {
    if (this.cached) return this.cached;
    for (const file of [
      this.cacheFile,
      path.join(this.root, "data/fixtures/logo-catalog.json"),
    ]) {
      try {
        this.cached = catalogSchema.parse(
          JSON.parse(await readFile(file, "utf8")),
        );
        return this.cached;
      } catch {
        /* Local discovery never waits on the network. */
      }
    }
    return undefined;
  }
  async find(sha: string, selectedPath?: string) {
    logoShaSchema.parse(sha);
    const logo = (await this.list()).logos.find(
      (entry) =>
        entry.sha === sha && (!selectedPath || entry.path === selectedPath),
    );
    if (!logo) throw new Error("未找到这张图标，请更新图标目录。");
    return logo;
  }
  async image(sha: string): Promise<Buffer> {
    const logo = await this.find(sha);
    const file = path.join(
      this.root,
      "data/cache/logo-catalog/images",
      sha + ".png",
    );
    try {
      return await readFile(file);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    const pending = this.downloads.get(sha);
    if (pending) return pending;
    const task = (async () => {
      if (this.active >= 4)
        await new Promise<void>((resolve) => this.waiting.push(resolve));
      else this.active++;
      try {
        const bytes = await this.request(
          `https://raw.githubusercontent.com/${repo}/master/${logo.path.split("/").map(encodeURIComponent).join("/")}`,
          12 * 1024 * 1024,
        );
        const blobSha = createHash("sha1")
          .update(`blob ${bytes.length}\0`)
          .update(bytes)
          .digest("hex");
        if (blobSha !== sha)
          throw new Error("这张图标已更新，请更新图标目录后再选。");
        const image = sharp(bytes, { limitInputPixels: 40_000_000 });
        const info = await image.metadata();
        if (
          !["png", "jpeg", "webp"].includes(info.format || "") ||
          (info.pages || 1) > 1
        )
          throw new Error("图标格式不支持。");
        const png = await image
          .rotate()
          .trim()
          .resize({
            width: 1600,
            height: 1600,
            fit: "inside",
            withoutEnlargement: true,
          })
          .png()
          .toBuffer();
        await this.atomic(file, png);
        return png;
      } finally {
        const next = this.waiting.shift();
        if (next) next();
        else this.active--;
      }
    })();
    this.downloads.set(sha, task);
    try {
      return await task;
    } finally {
      this.downloads.delete(sha);
    }
  }
}
export const logoCatalog = new LogoCatalog(process.cwd());
