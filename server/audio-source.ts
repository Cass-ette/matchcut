import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { BgmTrack, Settings } from "../src/domain";

const exec = promisify(execFile);
const trackSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  name: z.string().min(1).max(160),
  duration: z.number().positive().max(21600),
  createdAt: z.string(),
});
const assets = path.join(process.cwd(), "public/assets/bgm");
const cache = path.join(process.cwd(), "data/cache/bgm");
const inflight = new Map<string, Promise<BgmTrack>>();
const exists = async (file: string) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};
export async function loadBgm(id: string): Promise<BgmTrack> {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("BGM 编号无效。");
  try {
    const data = trackSchema.parse(
      JSON.parse(await readFile(path.join(cache, id + ".json"), "utf8")),
    );
    if (data.id !== id) throw new Error("BGM 不匹配");
    await access(path.join(assets, id + ".m4a"));
    return { ...data, src: "/assets/bgm/" + id + ".m4a" };
  } catch {
    throw new Error("找不到选定的 BGM，请重新导入这首音乐或移除 BGM。");
  }
}
export async function listBgm(): Promise<BgmTrack[]> {
  await mkdir(cache, { recursive: true });
  const items = await Promise.all(
    (await readdir(cache))
      .filter((f) => /^[a-f0-9]{64}\.json$/.test(f))
      .map(async (file) => {
        try {
          return await loadBgm(file.slice(0, -5));
        } catch {
          return null;
        }
      }),
  );
  return items
    .filter((x): x is BgmTrack => Boolean(x))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export const resolveBgm = (settings: Settings) =>
  settings.bgm ? loadBgm(settings.bgm.trackId) : undefined;
export async function importBgm(
  content: Buffer,
  filename: string,
): Promise<BgmTrack> {
  if (!content.length || content.length > 100 * 1024 * 1024)
    throw new Error("BGM 文件需小于 100 MB，且不能为空。");
  const id = createHash("sha256").update(content).digest("hex");
  const existing = inflight.get(id);
  if (existing) return existing;
  const task = (async () => {
    await mkdir(cache, { recursive: true });
    await mkdir(assets, { recursive: true });
    if (await exists(path.join(cache, id + ".json"))) {
      try {
        return await loadBgm(id);
      } catch {
        /* Repair an incomplete local import. */
      }
    }
    const temp = await mkdtemp(path.join(cache, ".upload-"));
    try {
      const input = path.join(temp, "input");
      await writeFile(input, content);
      const probe = JSON.parse(
        (
          await exec(
            "ffprobe",
            [
              "-v",
              "error",
              "-show_streams",
              "-show_format",
              "-of",
              "json",
              input,
            ],
            { timeout: 30000, maxBuffer: 2 * 1024 * 1024 },
          )
        ).stdout,
      );
      const audio = probe.streams.find((s: any) => s.codec_type === "audio");
      const duration = Number(probe.format?.duration || audio?.duration);
      if (
        !audio ||
        !Number.isFinite(duration) ||
        duration < 0.2 ||
        duration > 21600
      )
        throw new Error("没有有效音轨，或时长超出范围。");
      const output = path.join(temp, "audio.m4a");
      await exec(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-nostdin",
          "-y",
          "-i",
          input,
          "-map",
          "0:a:0",
          "-vn",
          "-map_metadata",
          "-1",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-ar",
          "48000",
          "-ac",
          "2",
          "-movflags",
          "+faststart",
          output,
        ],
        { timeout: 180000, maxBuffer: 1024 * 1024 },
      );
      const actual = JSON.parse(
        (
          await exec(
            "ffprobe",
            ["-v", "error", "-show_format", "-of", "json", output],
            { timeout: 10000 },
          )
        ).stdout,
      );
      const data = trackSchema.parse({
        id,
        name:
          path
            .basename(filename)
            .replace(/[\u0000-\u001f]/g, "")
            .slice(0, 160) || "我的 BGM",
        duration: Number(actual.format.duration),
        createdAt: new Date().toISOString(),
      });
      await rename(output, path.join(assets, id + ".m4a"));
      await writeFile(path.join(temp, "metadata.json"), JSON.stringify(data));
      await rename(
        path.join(temp, "metadata.json"),
        path.join(cache, id + ".json"),
      );
      return { ...data, src: "/assets/bgm/" + id + ".m4a" };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new Error("导入音乐需要本机安装 FFmpeg。");
      throw new Error(
        "BGM 导入失败：请使用可播放的 MP3、M4A、WAV、AAC、OGG 或 FLAC 音频。",
      );
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  })();
  inflight.set(id, task);
  try {
    return await task;
  } finally {
    inflight.delete(id);
  }
}
