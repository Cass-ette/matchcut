import os from "node:os";
import { browserPath } from "./browser";
import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveBgm } from "./audio-source";
import {
  FPS,
  exportResolutions,
  assertComparisons,
  assignedPositions,
  comparisons,
  ReportData,
  Settings,
  settingsSchema,
  VideoProps,
  previewProps,
  srt,
  totalFrames,
  providerName,
  reportModeOf,
  videoScenes,
} from "../src/domain";

const root = process.cwd();
export function renderConcurrency(resolution?: Settings["resolution"]) {
  const available = Math.max(1, os.cpus().length - 1);
  const defaultConcurrency = resolution === "2160" ? 1 : 2;
  const configured = Number(
    process.env.MATCHCUT_RENDER_CONCURRENCY || defaultConcurrency,
  );
  const requested =
    Number.isInteger(configured) && configured > 0
      ? configured
      : defaultConcurrency;
  return Math.min(available, requested);
}
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
export { browserPath } from "./browser";
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
  match: ReportData,
  raw: any,
  settings: Settings,
  origin: string,
  update: () => Promise<void>,
) {
  const folder = path.join(root, "output", job.id);
  await mkdir(folder, { recursive: true });
  try {
    settings = settingsSchema.parse(settings);
    job.matchId = match.id;
    job.title = settings.headline;
    job.message = "按阅读节奏编排字幕与镜头";
    job.progress = 5;
    await update();
    const bgmTrack = await resolveBgm(settings);
    const props = previewProps(match, settings, bgmTrack);
    const { segments, captions } = props;
    job.props = props;
    for (const chapter of props.chapters ?? [props])
      assertComparisons(chapter.match, chapter.settings);
    const output = exportResolutions[settings.resolution];
    job.width = output.width;
    job.height = output.height;
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
      concurrency: renderConcurrency(settings.resolution),
      crf: 19,
      pixelFormat: "yuv420p",
      muted: !bgmTrack,
      ...(bgmTrack ? { audioCodec: "aac" as const, audioBitrate: "192k" } : {}),
      scale: output.scale,
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
      scale: output.scale,
    });
    await writeFile(path.join(folder, "captions.srt"), srt(captions));
    await writeFile(
      path.join(folder, "project.json"),
      JSON.stringify(
        {
          schemaVersion: 7,
          game: match.game || "dota2",
          aspectRatio: "16:9",
          width: job.width,
          height: job.height,
          matchId: match.id,
          reportMode: reportModeOf(match),
          gameIds: match.series?.games.map((g) => g.id),
          series: match.series,
          settings,
          backgroundMusic: bgmTrack || null,
          chapters: props.chapters?.map((c) => ({
            key: c.key,
            label: c.label,
            matchId: c.match.id,
            slots: c.slots,
          })),
          timeline: videoScenes(props).map((s) => ({
            from: s.from,
            frames: s.frames,
            scene: s.name,
            chapter: s.chapter?.label,
            matchId: s.match.id,
          })),
          segments,
          frames: totalFrames(segments),
          fps: FPS,
          comparisonMode: settings.radarMode,
          positions: assignedPositions(match, settings).map((x) => ({
            slot: x.player.slot,
            name: x.player.name,
            position: x.position,
            source: x.source,
          })),
          comparisons: comparisons(match, settings).map((x) => ({
            label: x.label,
            slots: x.pair?.map((p) => p.slot),
            provenance: x.provenance,
          })),
        },
        null,
        2,
      ),
    );
    await writeFile(
      path.join(folder, "source.json"),
      JSON.stringify(
        {
          provider: providerName(match),
          reportMode: reportModeOf(match),
          games: match.series?.games,
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
        (match.series
          ? `\n系列赛累计 · 已收录 ${match.series.games.length} 局 · 比分 ${match.series.wins.radiant} : ${match.series.wins.dire}\nG${match.series.games.map((g) => g.gameNumber || "?").join(" / G")}\n对位按位置累计；伤害榜按选手累计。每分钟值按出场时长计算，参团率按出场局的队伍击杀计算。`
          : "") +
        "\n数据来源：" +
        match.source +
        "\n雷达各轴按对比二人较高值归一化，非综合能力评分。\n" +
        comparisons(match, settings)
          .map(
            (x) =>
              x.label +
              "：" +
              x.pair?.map((p) => p.name).join(" vs ") +
              "（" +
              x.provenance +
              "）",
          )
          .join("\n") +
        "\n\n" +
        segments
          .filter((segment) => segment.frames > 0)
          .map((segment) => segment.text)
          .join("\n\n") +
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
