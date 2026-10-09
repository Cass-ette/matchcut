import { createWriteStream } from "node:fs";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
  stat,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { DEFAULT_CS_MATCH, matchIdSchema } from "../src/domain";
import {
  normalizeCs,
  summarizeCs,
  type CsSnapshot,
  type CsSummary,
} from "../src/cs";
import { mediaLibrary } from "./media-source";

export const MAX_DEMO_BYTES = 1024 * 1024 * 1024;
const require = createRequire(import.meta.url);
const analyzerVersion: string =
  require("@akiver/cs-demo-analyzer/package.json").version;
const execute = promisify(execFile);
const exists = async (file: string) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};

async function analyze(demo: string, output: string): Promise<unknown> {
  const binary = require(
    path.join(
      path.dirname(require.resolve("@akiver/cs-demo-analyzer")),
      "platform.js",
    ),
  ).getBinaryPath();
  // execFile passes filenames as arguments. The package's API uses a shell.
  try {
    await execute(
      binary,
      ["-demo-path=" + demo, "-output=" + output, "-format=json", "-minify"],
      {
        timeout: 10 * 60 * 1000,
        killSignal: "SIGKILL",
        maxBuffer: 2 * 1024 * 1024,
      },
    );
  } catch (error) {
    throw new Error(
      (error as { killed?: boolean }).killed
        ? "Demo 解析超过十分钟，请检查文件是否完整。"
        : "无法解析 Demo，请使用已解压的完整 CS2 / CS:GO .dem 文件；新游戏版本可能需要更新解析器。",
    );
  }
  const file = (await readdir(output)).find((name) => name.endsWith(".json"));
  if (!file) throw new Error("Demo 解析器没有生成比赛数据。");
  if ((await stat(path.join(output, file))).size > 128 * 1024 * 1024)
    throw new Error("解析结果超过 128 MB，请使用单张地图的 Demo。");
  return JSON.parse(await readFile(path.join(output, file), "utf8"));
}

export class CsLibrary {
  private busy = false;
  constructor(
    private root: string,
    private analyzer = analyze,
  ) {}
  private get cache() {
    return path.join(this.root, "data/cache/cs");
  }
  async snapshot(id: string): Promise<CsSnapshot> {
    matchIdSchema.parse(id);
    if (!id.startsWith("cs2-")) throw new Error("不是 CS 比赛编号。");
    const file =
      id === DEFAULT_CS_MATCH
        ? path.join(this.root, "data/fixtures/cs/monte-og-anubis.json")
        : path.join(this.cache, id, "snapshot.json");
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        throw new Error("本地没有这场 CS 比赛，请先导入 Demo。");
      throw e;
    }
  }
  async load(id: string) {
    const raw = await this.snapshot(id);
    const match = normalizeCs(raw);
    return { match, raw, cached: true };
  }
  async list(): Promise<CsSummary[]> {
    const ids = [DEFAULT_CS_MATCH];
    if (await exists(this.cache))
      ids.push(
        ...(await readdir(this.cache)).filter((id) =>
          /^cs2-[a-f0-9]{64}$/.test(id),
        ),
      );
    const items = await Promise.all(
      ids.map(async (id) => summarizeCs((await this.load(id)).match)),
    );
    return items.sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
  }
  async importDemo(input: Readable, filename: string) {
    if (this.busy) throw new Error("正在解析另一份 Demo，请稍后重试。");
    if (!/\.dem$/i.test(filename))
      throw new Error("请选择已解压的 .dem 文件。");
    this.busy = true;
    let stage: string | undefined;
    try {
      await mkdir(this.cache, { recursive: true });
      stage = await mkdtemp(path.join(this.cache, ".import-"));
      const demo = path.join(stage, "match.dem");
      const hash = createHash("sha256");
      let bytes = 0;
      let header = Buffer.alloc(0);
      const check = new Transform({
        transform(chunk: Buffer, _encoding, next) {
          bytes += chunk.length;
          if (bytes > MAX_DEMO_BYTES) {
            next(new Error("Demo 超过 1 GB。"));
            return;
          }
          if (header.length < 8)
            header = Buffer.concat([
              header,
              chunk.subarray(0, 8 - header.length),
            ]);
          if (
            header.length === 8 &&
            !["PBDEMS2\0", "HL2DEMO\0"].includes(header.toString("ascii"))
          ) {
            next(
              new Error("文件不是有效的 CS Demo；请先解压 ZIP / RAR / BZ2。"),
            );
            return;
          }
          hash.update(chunk);
          next(null, chunk);
        },
      });
      try {
        await pipeline(
          Readable.from(input.iterator({ destroyOnReturn: false })),
          check,
          createWriteStream(demo),
        );
      } catch (error) {
        input.resume();
        throw error;
      }
      if (bytes < 16) throw new Error("Demo 文件为空或不完整。");
      const sha256 = hash.digest("hex");
      const id = "cs2-" + sha256;
      if (await exists(path.join(this.cache, id))) return { id, cached: true };
      const output = path.join(stage, "analysis");
      await mkdir(output);
      const raw = await this.analyzer(demo, output);
      const snapshot: CsSnapshot = {
        id,
        sha256,
        filename: path.basename(filename.replace(/\\/g, "/")).slice(0, 200),
        fetchedAt: new Date().toISOString(),
        analyzerVersion,
        raw,
      };
      normalizeCs(snapshot);
      await writeFile(
        path.join(stage, "snapshot.json"),
        JSON.stringify(snapshot),
      );
      await rm(output, { recursive: true, force: true });
      await rename(stage, path.join(this.cache, id));
      stage = undefined;
      return { id, cached: false };
    } finally {
      this.busy = false;
      if (stage) await rm(stage, { recursive: true, force: true });
    }
  }
}

export const csLibrary = new CsLibrary(process.cwd());
export const listCsMatches = () => csLibrary.list();
export async function loadCsMatch(id: string) {
  const data = await csLibrary.load(id);
  await mediaLibrary.apply(data.match);
  return data;
}
