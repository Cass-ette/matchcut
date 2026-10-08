import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  FPS,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  MatchData,
  Settings,
  VideoProps,
  previewProps,
  srt,
  totalFrames,
} from "../src/domain";

const root = process.cwd();
export type Job = {
  id: string;
  status: "preparing" | "rendering" | "done" | "error";
  progress: number;
  message: string;
  createdAt: string;
  matchId?: string;
  title?: string;
  error?: string;
  files?: Record<string, string>;
  props?: VideoProps;
  width?: number;
  height?: number;
  warnings: string[];
};
export async function browserPath(): Promise<string | undefined> {
  if (process.env.MATCHCUT_BROWSER) return process.env.MATCHCUT_BROWSER;
  const base = path.join(os.homedir(), "Library/Caches/ms-playwright");
  try {
    const dirs = (await readdir(base))
      .filter((x) => x.startsWith("chromium_headless_shell-"))
      .sort()
      .reverse();
    for (const d of dirs) {
      const p = path.join(
        base,
        d,
        "chrome-headless-shell-mac-arm64/chrome-headless-shell",
      );
      try {
        await access(p);
        return p;
      } catch {}
    }
  } catch {}
  return undefined;
}
let bundlePromise: Promise<string> | undefined;
export async function prepareBundle() {
  if (!bundlePromise)
    bundlePromise = bundle({
      entryPoint: path.join(root, "src/video/index.tsx"),
      outDir: path.join(root, ".cache/render-bundle"),
      publicDir: path.join(root, "public"),
      onProgress: () => {},
    }).catch((e) => {
      bundlePromise = undefined;
      throw e;
    });
  return bundlePromise;
}
export function invalidateBundle() {
  bundlePromise = undefined;
}
export async function runRender(
  job: Job,
  match: MatchData,
  raw: any,
  settings: Settings,
  origin: string,
  update: () => Promise<void>,
) {
  const folder = path.join(root, "output", job.id);
  await mkdir(folder, { recursive: true });
  try {
    job.matchId = match.id;
    job.title = settings.headline;
    job.message = "按阅读节奏编排字幕与镜头";
    job.progress = 5;
    await update();
    const props = previewProps(match, settings);
    const { segments, captions } = props;
    job.props = props;
    job.width = settings.resolution === "720" ? 1280 : VIDEO_WIDTH;
    job.height = settings.resolution === "720" ? 720 : VIDEO_HEIGHT;
    job.message = "准备视频模板";
    job.progress = 15;
    await update();
    // Rebundle after collecting assets so newly downloaded portraits are included.
    invalidateBundle();
    const serveUrl = await prepareBundle();
    const browserExecutable = await browserPath();
    const composition = await selectComposition({
      serveUrl,
      id: "MatchFilm",
      inputProps: props,
      browserExecutable,
    });
    job.status = "rendering";
    job.message = "渲染视频画面";
    job.progress = 20;
    await update();
    let lastProgress = 0;
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: path.join(folder, "matchcut.mp4"),
      inputProps: props,
      browserExecutable,
      concurrency: Math.max(1, Math.min(4, os.cpus().length - 1)),
      crf: 19,
      pixelFormat: "yuv420p",
      muted: true,
      scale: settings.resolution === "720" ? 2 / 3 : 1,
      timeoutInMilliseconds: 120000,
      onProgress: ({ progress }) => {
        job.progress = 20 + Math.floor(progress * 72);
        if (Date.now() - lastProgress > 1500) {
          lastProgress = Date.now();
          void update();
        }
      },
    });
    job.progress = 94;
    job.message = "导出封面、字幕与数据档案";
    await update();
    await renderStill({
      composition,
      serveUrl,
      output: path.join(folder, "cover.png"),
      inputProps: props,
      frame: Math.min(80, segments[0].frames - 20),
      imageFormat: "png",
      browserExecutable,
      scale: settings.resolution === "720" ? 2 / 3 : 1,
    });
    await writeFile(path.join(folder, "captions.srt"), srt(captions));
    await writeFile(
      path.join(folder, "project.json"),
      JSON.stringify(
        {
          schemaVersion: 2,
          aspectRatio: "16:9",
          width: job.width,
          height: job.height,
          matchId: match.id,
          settings,
          segments,
          frames: totalFrames(segments),
          fps: FPS,
        },
        null,
        2,
      ),
    );
    await writeFile(
      path.join(folder, "source.json"),
      JSON.stringify(
        {
          provider: "OpenDota",
          url: match.source,
          fetchedAt: match.fetchedAt,
          generatedAt: new Date().toISOString(),
          raw,
        },
        null,
        2,
      ),
    );
    await writeFile(
      path.join(folder, "publish.txt"),
      settings.headline +
        "\n\n" +
        match.radiant +
        " vs " +
        match.dire +
        " · " +
        match.league +
        "\n数据来源：" +
        match.source +
        "\n雷达各轴按两名选手较高值归一化，非综合能力评分。\n\n" +
        settings.scripts.join("\n\n") +
        "\n",
    );
    job.files = Object.fromEntries(
      [
        "matchcut.mp4",
        "cover.png",
        "captions.srt",
        "project.json",
        "source.json",
        "publish.txt",
      ].map((file) => [file, "/output/" + job.id + "/" + file]),
    );
    job.status = "done";
    job.progress = 100;
    job.message = "视频已生成，可以预览和下载";
    await update();
  } catch (e) {
    job.status = "error";
    job.error = (e as Error).message;
    job.message = "生成失败，设置和数据已保留";
    await update();
  }
}
