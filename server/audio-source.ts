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
import sharp from "sharp";
import { BgmTrack, Settings } from "../src/domain";

const exec = promisify(execFile);
const trackSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  name: z.string().min(1).max(160),
  title: z.string().min(1).max(160).optional(),
  artist: z.string().min(1).max(160).optional(),
  coverFile: z
    .string()
    .regex(/^[a-f0-9]{64}\.jpg$/)
    .optional(),
  metadataVersion: z.union([z.literal(1), z.literal(2)]).optional(),
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
    const { coverFile, metadataVersion: _version, ...track } = data;
    return {
      ...track,
      src: "/assets/bgm/" + id + ".m4a",
      ...(coverFile && (await exists(path.join(assets, coverFile)))
        ? { cover: "/assets/bgm/" + coverFile }
        : {}),
    };
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

async function saveCover(content: Buffer, temp: string) {
  const image = await sharp(content, { limitInputPixels: 25_000_000 })
    .rotate()
    .resize(512, 512, { fit: "cover" })
    .flatten({ background: "#14151b" })
    .jpeg({ quality: 88 })
    .toBuffer();
  // Immutable URLs also keep an already submitted video's cover unchanged.
  const file = createHash("sha256").update(image).digest("hex") + ".jpg";
  await writeFile(path.join(temp, "cover.jpg"), image);
  await rename(path.join(temp, "cover.jpg"), path.join(assets, file));
  return file;
}

export async function importBgmCover(id: string, content: Buffer) {
  await loadBgm(id);
  if (!content.length || content.length > 10 * 1024 * 1024)
    throw new Error("封面需小于 10 MB，且不能为空。");
  const temp = await mkdtemp(path.join(cache, ".cover-"));
  try {
    let coverFile: string;
    try {
      coverFile = await saveCover(content, temp);
    } catch {
      throw new Error("无法读取封面，请使用 JPG、PNG 或 WebP 图片。");
    }
    const data = trackSchema.parse(
      JSON.parse(await readFile(path.join(cache, id + ".json"), "utf8")),
    );
    await writeFile(
      path.join(temp, "metadata.json"),
      JSON.stringify({ ...data, coverFile }),
    );
    await rename(
      path.join(temp, "metadata.json"),
      path.join(cache, id + ".json"),
    );
    return await loadBgm(id);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

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
    let previous: z.infer<typeof trackSchema> | undefined;
    if (await exists(path.join(cache, id + ".json"))) {
      try {
        const track = await loadBgm(id);
        previous = trackSchema.parse(
          JSON.parse(await readFile(path.join(cache, id + ".json"), "utf8")),
        );
        if (
          previous.metadataVersion === 2 &&
          (!previous.coverFile || track.cover)
        )
          return track;
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
      const tags: Record<string, unknown> = Object.fromEntries(
        Object.entries({ ...audio.tags, ...probe.format?.tags }).map(
          ([key, value]) => [key.toLowerCase(), value],
        ),
      );
      const tag = (key: string) =>
        typeof tags[key] === "string"
          ? tags[key]
              .replace(/[\u0000-\u001f]/g, "")
              .trim()
              .slice(0, 160) || undefined
          : undefined;
      let coverFile =
        previous?.coverFile &&
        (await exists(path.join(assets, previous.coverFile)))
          ? previous.coverFile
          : undefined;
      const cover = probe.streams.find(
        (stream: any) =>
          stream.codec_type === "video" &&
          stream.disposition?.attached_pic === 1,
      );
      if (!coverFile && cover) {
        try {
          const picture = path.join(temp, "embedded.img");
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
              `0:${cover.index}`,
              "-frames:v",
              "1",
              // Some music files label TIFF/PNG covers as JPEG. Copy the
              // original bytes so sharp can detect the actual image format.
              "-c:v",
              "copy",
              "-f",
              "image2",
              picture,
            ],
            { timeout: 30000, maxBuffer: 1024 * 1024 },
          );
          coverFile = await saveCover(await readFile(picture), temp);
        } catch {
          // A broken embedded image must not prevent importing playable music.
        }
      }
      const output = path.join(temp, "audio.m4a");
      let actualDuration = previous?.duration;
      if (!previous) {
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
        actualDuration = Number(actual.format.duration);
        await rename(output, path.join(assets, id + ".m4a"));
      }
      const data = trackSchema.parse({
        id,
        name:
          previous?.name ||
          path
            .basename(filename)
            .replace(/[\u0000-\u001f]/g, "")
            .slice(0, 160) ||
          "我的 BGM",
        title: tag("title"),
        artist: tag("artist") || tag("album_artist"),
        coverFile,
        metadataVersion: 2,
        duration: actualDuration,
        createdAt: previous?.createdAt || new Date().toISOString(),
      });
      await writeFile(path.join(temp, "metadata.json"), JSON.stringify(data));
      await rename(
        path.join(temp, "metadata.json"),
        path.join(cache, id + ".json"),
      );
      return await loadBgm(id);
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
