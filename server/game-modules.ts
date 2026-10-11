import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { z } from "zod";
import type { Game } from "../src/domain";
import {
  gameModules,
  ownsModuleAsset,
  type GameModuleState,
} from "../src/game-modules";
import { localStore } from "./local-store";
import { fetchModuleRelease } from "./module-download";

const gameSchema = z.enum(["dota2", "lol", "cs2"]);
const stateSchema = z.object({
  schemaVersion: z.literal(1),
  modules: z.array(
    z.object({
      game: gameSchema,
      installed: z.boolean(),
      enabled: z.boolean(),
      version: z.string(),
      retainedData: z.boolean(),
    }),
  ),
});
const packSchema = z.object({
  game: gameSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  file: z.string().regex(/^matchcut-(dota2|lol|cs2)-\d+\.\d+\.\d+\.pack\.gz$/),
  bytes: z
    .number()
    .int()
    .positive()
    .max(256 * 1024 ** 2),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  files: z.number().int().positive().max(5000),
  installedBytes: z
    .number()
    .int()
    .positive()
    .max(512 * 1024 ** 2),
});
const catalogSchema = z.object({
  schemaVersion: z.literal(1),
  modules: z.array(packSchema).max(20),
});
const recordSchema = z.object({
  path: z.string().max(250),
  bytes: z
    .number()
    .int()
    .positive()
    .max(16 * 1024 ** 2),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  data: z.string().max(23 * 1024 ** 2),
});
const releaseBase =
  "https://github.com/Cass-ette/matchcut-data/releases/latest/download/";
const missing = (error: unknown) =>
  (error as NodeJS.ErrnoException).code === "ENOENT";
const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");

async function entries(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (missing(error)) return [];
    throw error;
  }
}
async function hasAssets(file: string): Promise<boolean> {
  try {
    const info = await lstat(file);
    if (info.isSymbolicLink()) return false;
    if (info.isFile()) return /\.(png|jpe?g|webp)$/i.test(file);
    if (info.isDirectory())
      for (const entry of await entries(file))
        if (await hasAssets(path.join(file, entry.name))) return true;
  } catch (error) {
    if (!missing(error)) throw error;
  }
  return false;
}

// Reject symlink parents as well as traversal: packages must never write outside
// their owned local asset folders, even in a modified development checkout.
async function safePath(root: string, relative: string) {
  const parts = relative.split("/");
  if (
    parts.some((p) => !p || p === "." || p === "..") ||
    relative.includes("\\") ||
    path.isAbsolute(relative)
  )
    throw new Error("素材路径无效。");
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error("素材目录不能是符号链接。");
    } catch (error) {
      if (!missing(error)) throw error;
    }
  }
  return current;
}

export class GameModuleManager {
  private states: GameModuleState[] = [];
  private task?: Promise<void>;
  private initialized = false;
  constructor(
    readonly root: string,
    private options: {
      fetch?: typeof fetch;
      busyReason?: () => string | undefined;
      purgeData?: (game: Game) => Promise<void>;
    } = {},
  ) {}
  get busy() {
    return Boolean(this.task);
  }
  async initialize() {
    if (this.initialized) return;
    try {
      const saved = stateSchema.parse(
        JSON.parse(
          await readFile(
            path.join(this.root, "data/game-modules.json"),
            "utf8",
          ),
        ),
      );
      if (
        new Set(saved.modules.map((m) => m.game)).size !== saved.modules.length
      )
        throw new Error("游戏配置重复。");
      this.states = saved.modules.map((m) => ({
        ...m,
        enabled: m.installed && m.enabled,
      }));
    } catch (error) {
      if (!missing(error))
        throw new Error("游戏配置读取失败，请检查 data/game-modules.json。", {
          cause: error,
        });
    }
    for (const definition of gameModules) {
      if (this.states.some((m) => m.game === definition.game)) continue;
      let installed = false;
      for (const file of await this.assetPaths(definition.game))
        if (await hasAssets(path.join(this.root, file))) {
          installed = true;
          break;
        }
      this.states.push({
        game: definition.game,
        installed,
        enabled: installed,
        version: installed ? "bundled" : "",
        retainedData: true,
      });
    }
    await this.save();
    this.initialized = true;
  }
  list() {
    return {
      modules: this.states.map((m) => structuredClone(m)),
      busyReason: this.options.busyReason?.(),
    };
  }
  private state(game: Game) {
    return this.states.find((m) => m.game === game)!;
  }
  select(requested?: string) {
    return (
      this.states.find(
        (m) => m.game === requested && m.installed && m.enabled && !m.operation,
      )?.game ??
      this.states.find((m) => m.installed && m.enabled && !m.operation)?.game
    );
  }
  assertEnabled(game: Game) {
    const module = this.state(game);
    if (!module?.installed || !module.enabled)
      throw new Error("这个游戏尚未启用，请在游戏管理中安装或启用。");
    if (module.operation) throw new Error("这个游戏正在更新，请稍后再试。");
  }
  private async save() {
    const file = path.join(this.root, "data/game-modules.json");
    await mkdir(path.dirname(file), { recursive: true });
    const temp = file + "." + randomUUID() + ".tmp";
    try {
      await writeFile(
        temp,
        JSON.stringify(
          {
            schemaVersion: 1,
            modules: this.states.map(({ operation, error, ...state }) => state),
          },
          null,
          2,
        ) + "\n",
      );
      await rename(temp, file);
    } finally {
      await rm(temp, { force: true });
    }
  }
  private available() {
    if (this.busy) throw new Error("已有游戏正在处理，请稍后再试。");
    const reason = this.options.busyReason?.();
    if (reason) throw new Error(reason);
  }
  start(
    game: Game,
    action: "enable" | "hide" | "install" | "remove",
    keepData = true,
  ) {
    this.available();
    const state = this.state(game);
    if (!state) throw new Error("不支持这个游戏。");
    if (
      (action === "enable" || action === "hide" || action === "remove") &&
      !state.installed
    )
      throw new Error("请先安装这个游戏。");
    const previous = structuredClone(state);
    delete state.error;
    // Reserve synchronously before the first await so concurrent requests cannot
    // begin a render, import or second module change in the intervening gap.
    if (action === "install" || action === "remove")
      state.operation = {
        action,
        progress: 0,
        message: action === "install" ? "连接素材库" : "正在移除",
      };
    this.task = (async () => {
      if (action === "enable" || action === "hide") {
        state.enabled = action === "enable";
        await this.save();
      } else if (action === "install") await this.install(state);
      else await this.remove(state, keepData);
    })()
      .catch((error) => {
        Object.assign(state, previous);
        state.error = (error as Error).message || "操作失败，请重试。";
      })
      .finally(() => {
        delete state.operation;
        this.task = undefined;
      });
  }
  async settled() {
    await this.task;
  }
  private async assetPaths(game: Game) {
    const definition = gameModules.find((m) => m.game === game)!;
    const paths: string[] = [];
    for (const dir of definition.directories) {
      try {
        await lstat(path.join(this.root, dir));
        paths.push(dir);
      } catch (error) {
        if (!missing(error)) throw error;
      }
    }
    for (const dir of ["public/assets/teams", "public/assets/players"]) {
      for (const entry of await entries(path.join(this.root, dir)))
        if (entry.name.startsWith(definition.prefix + "-"))
          paths.push(dir + "/" + entry.name);
    }
    return paths;
  }
  private async dataPaths(game: Game) {
    if (game === "lol") return ["data/cache/lol", "data/preferences-lol.json"];
    if (game === "cs2") return ["data/cache/cs", "data/preferences-cs2.json"];
    return [
      "data/preferences.json",
      ...(await entries(path.join(this.root, "data/cache")))
        .filter((e) => /^\d+\.json$/.test(e.name))
        .map((e) => "data/cache/" + e.name),
    ];
  }
  private async remove(state: GameModuleState, keepData: boolean) {
    const trash = await safePath(
      this.root,
      "data/module-staging/" + randomUUID(),
    );
    const moved: { from: string; to: string }[] = [];
    const previous = structuredClone(state);
    await mkdir(trash, { recursive: true });
    try {
      for (const relative of [
        ...(await this.assetPaths(state.game)),
        ...(!keepData ? await this.dataPaths(state.game) : []),
      ]) {
        const from = await safePath(this.root, relative),
          to = path.join(trash, String(moved.length));
        try {
          await rename(from, to);
          moved.push({ from, to });
        } catch (error) {
          if (!missing(error)) throw error;
        }
      }
      state.installed = state.enabled = false;
      state.version = "";
      state.retainedData = keepData;
      await this.save();
      if (!keepData) await this.options.purgeData?.(state.game);
    } catch (error) {
      Object.assign(state, previous);
      for (const item of moved.reverse()) await rename(item.to, item.from);
      await this.save();
      throw error;
    } finally {
      await rm(trash, { recursive: true, force: true }).catch((error) =>
        console.error("游戏移除暂存目录清理失败：", error),
      );
    }
  }
  private async install(state: GameModuleState) {
    const request = this.options.fetch ?? fetchModuleRelease;
    const catalogResponse = await request(releaseBase + "modules.json", {
      signal: AbortSignal.timeout(20_000),
    });
    if (!catalogResponse.ok)
      throw new Error("素材库暂时无法连接，请稍后重试。");
    const catalogText = await catalogResponse.text();
    if (catalogText.length > 32_000) throw new Error("素材包目录无效。");
    const pack = catalogSchema
      .parse(JSON.parse(catalogText))
      .modules.find((m) => m.game === state.game);
    if (!pack || pack.file !== `matchcut-${state.game}-${pack.version}.pack.gz`)
      throw new Error("暂未找到这个游戏的素材包。");
    const stage = await safePath(
      this.root,
      "data/module-staging/" + randomUUID(),
    );
    await mkdir(stage, { recursive: true });
    const moved: { destination: string; backup?: string }[] = [];
    const previous = structuredClone(state);
    try {
      const response = await request(
        `https://github.com/Cass-ette/matchcut-data/releases/download/v${pack.version}/${pack.file}`,
        {
          signal: AbortSignal.timeout(300_000),
        },
      );
      if (!response.ok || !response.body)
        throw new Error("素材下载失败，请重试。");
      const digest = createHash("sha256");
      let bytes = 0;
      const check = new Transform({
        transform(chunk: Buffer, _encoding, next) {
          bytes += chunk.length;
          if (bytes > pack.bytes) {
            next(new Error("素材包大小不匹配。"));
            return;
          }
          digest.update(chunk);
          state.operation = {
            action: "install",
            progress: Math.round((bytes / pack.bytes) * 70),
            message: "下载游戏素材",
          };
          next(null, chunk);
        },
      });
      const archive = path.join(stage, "download.gz");
      await pipeline(
        Readable.fromWeb(response.body as any),
        check,
        createWriteStream(archive),
      );
      if (bytes !== pack.bytes || digest.digest("hex") !== pack.sha256)
        throw new Error("素材包校验失败，原有素材已保留。");
      const files: string[] = [];
      let total = 0,
        buffer = "",
        header = false;
      const consume = async (line: string) => {
        if (!header) {
          const value = JSON.parse(line);
          if (
            value.schemaVersion !== 1 ||
            value.game !== state.game ||
            value.version !== pack.version
          )
            throw new Error("素材包版本不匹配。");
          header = true;
          return;
        }
        const item = recordSchema.parse(JSON.parse(line));
        if (
          !ownsModuleAsset(state.game, item.path) ||
          files.includes(item.path)
        )
          throw new Error("素材包包含无效或重复路径。");
        const content = Buffer.from(item.data, "base64");
        total += content.length;
        if (
          content.length !== item.bytes ||
          hash(content) !== item.sha256 ||
          total > pack.installedBytes ||
          files.length >= pack.files
        )
          throw new Error("素材文件校验失败。");
        const file = path.join(stage, "new", item.path);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, content);
        files.push(item.path);
        state.operation = {
          action: "install",
          progress: 70 + Math.round((files.length / pack.files) * 25),
          message: "校验并准备素材",
        };
      };
      // A streamed gzip/JSONL pack keeps memory bounded to one asset, instead of
      // expanding a whole game pack or allowing archive links and traversal.
      const compressed = createReadStream(archive),
        unpacked = createGunzip();
      compressed.on("error", (error) => unpacked.destroy(error));
      compressed.pipe(unpacked);
      try {
        for await (const chunk of unpacked) {
          buffer += chunk.toString("utf8");
          let newline: number;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline);
            buffer = buffer.slice(newline + 1);
            await consume(line);
          }
          if (buffer.length > 24 * 1024 ** 2) throw new Error("素材文件过大。");
        }
      } finally {
        compressed.destroy();
        unpacked.destroy();
      }
      if (
        buffer ||
        !header ||
        total !== pack.installedBytes ||
        files.length !== pack.files
      )
        throw new Error("素材包不完整。");
      for (const relative of files) {
        const destination = await safePath(this.root, relative);
        await mkdir(path.dirname(destination), { recursive: true });
        const backup = path.join(stage, "backup", String(moved.length));
        await mkdir(path.dirname(backup), { recursive: true });
        let existing = false;
        try {
          await rename(destination, backup);
          existing = true;
        } catch (error) {
          if (!missing(error)) throw error;
        }
        moved.push({ destination, backup: existing ? backup : undefined });
        await rename(path.join(stage, "new", relative), destination);
      }
      state.installed = true;
      state.enabled = previous.installed ? previous.enabled : true;
      state.version = pack.version;
      await this.save();
    } catch (error) {
      Object.assign(state, previous);
      for (const item of moved.reverse()) {
        await rm(item.destination, { force: true });
        if (item.backup) await rename(item.backup, item.destination);
      }
      throw error;
    } finally {
      await rm(stage, { recursive: true, force: true }).catch((error) =>
        console.error("游戏下载暂存目录清理失败：", error),
      );
    }
  }
}

export async function purgeGameData(root: string, game: Game) {
  const store = localStore(root);
  // Migrate legacy overrides before purging so a later initialization cannot
  // resurrect bindings from the old JSON file.
  await store.settled();
  const registry = store.registry();
  for (const kind of ["teams", "players", "heroes"] as const)
    for (const [id, value] of Object.entries(registry[kind])) {
      if (
        id.startsWith(game + "-") ||
        (value as { game?: string }).game === game
      )
        delete registry[kind][id];
    }
  store.transaction(() => {
    store.writeRegistry(registry);
    store.setMeta("registry-migrated", "1");
    for (const table of ["appearances", "matches", "people", "media"])
      store.db.prepare(`DELETE FROM ${table} WHERE game=?`).run(game);
    for (const key of [
      `media:${game}`,
      `archive:${game}`,
      `archive-revision:${game}`,
    ])
      store.db.prepare("DELETE FROM metadata WHERE key=?").run(key);
    store.setMeta(`archive-revision:${game}`, randomUUID());
  });
  // Content-addressed uploads can be shared by several games. Only remove
  // genuinely unreferenced files; exported videos and music are never touched.
  const retained = JSON.stringify(registry);
  for (const entry of await entries(path.join(root, "public/assets/library"))) {
    if (
      /^[a-f0-9]{64}\.png$/.test(entry.name) &&
      !retained.includes(entry.name)
    )
      await rm(path.join(root, "public/assets/library", entry.name), {
        force: true,
      }).catch((error) => console.error("未引用的自定义图片清理失败：", error));
  }
}
