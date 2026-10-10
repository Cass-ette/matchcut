import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  combineChunks,
  renderMedia,
  type RenderMediaOptions,
} from "@remotion/renderer";
import { RenderControl } from "./render-control";
import type { Job } from "./render";

// 9.6 seconds at 30 fps; bounded work is repeated if interrupted mid-chunk.
export const FRAMES_PER_CHUNK = 288;

export async function renderChunks(
  options: RenderMediaOptions & { outputLocation: string },
  job: Job,
  control: RenderControl,
  update: () => Promise<void>,
  framesPerChunk = FRAMES_PER_CHUNK,
) {
  const folder = path.join(path.dirname(options.outputLocation), "chunks");
  await mkdir(folder, { recursive: true });
  const totalFrames = options.composition.durationInFrames;
  const videoFiles: string[] = [],
    audioFiles: string[] = [];
  let savedFrames = 0,
    lastUpdate = 0,
    lastLog = 0;
  const saveProgress = () => {
    if (Date.now() - lastUpdate > 1500) {
      lastUpdate = Date.now();
      void update().catch((error) =>
        console.error(`[job:${job.id}] 保存进度失败：`, error),
      );
    }
    if (Date.now() - lastLog > 30_000) {
      lastLog = Date.now();
      console.info(
        `[${new Date().toISOString()}] [job:${job.id}] ${job.progress}% ${job.message}`,
      );
    }
  };
  try {
    for (let from = 0; from < totalFrames; from += framesPerChunk) {
      const to = Math.min(from + framesPerChunk, totalFrames) - 1;
      const file = path.join(folder, String(from).padStart(8, "0"));
      const audio = options.muted ? undefined : file + ".aac";
      await control.run(
        (cancelSignal) =>
          renderMedia({
            ...options,
            codec: "h264-ts",
            outputLocation: file + ".ts",
            frameRange: [from, to],
            cancelSignal,
            ...(audio
              ? {
                  separateAudioTo: audio,
                  forSeamlessAacConcatenation: true,
                  sampleRate: 48000,
                }
              : {}),
            onProgress: ({ progress, renderedFrames, encodedFrames }) => {
              if (!control.running) return;
              job.progress =
                20 +
                Math.floor(
                  ((from + progress * (to - from + 1)) / totalFrames) * 68,
                );
              job.renderProgress = {
                renderedFrames: from + renderedFrames,
                encodedFrames: from + encodedFrames,
                totalFrames,
                savedFrames,
                stage: "rendering",
              };
              job.message = `渲染画面 ${from + renderedFrames} / ${totalFrames} 帧 · 已保存 ${savedFrames} 帧`;
              saveProgress();
            },
          }),
        () => {
          job.progress = 20 + Math.floor((savedFrames / totalFrames) * 68);
          job.renderProgress = {
            renderedFrames: savedFrames,
            encodedFrames: savedFrames,
            totalFrames,
            savedFrames,
            stage: "rendering",
          };
        },
      );
      videoFiles.push(file + ".ts");
      if (audio) audioFiles.push(audio);
      savedFrames = to + 1;
      job.renderProgress = {
        renderedFrames: savedFrames,
        encodedFrames: savedFrames,
        totalFrames,
        savedFrames,
        stage: "rendering",
      };
      await update();
    }
    await control.checkpoint();
    job.message = "合并音视频";
    job.progress = 88;
    job.renderProgress = {
      renderedFrames: totalFrames,
      encodedFrames: totalFrames,
      totalFrames,
      savedFrames,
      stage: "muxing",
    };
    await update();
    await control.run((cancelSignal) =>
      combineChunks({
        outputLocation: options.outputLocation,
        videoFiles,
        audioFiles,
        codec: "h264",
        audioCodec: audioFiles.length ? "aac" : undefined,
        audioBitrate: options.audioBitrate,
        fps: options.composition.fps,
        framesPerChunk,
        compositionDurationInFrames: totalFrames,
        preferLossless: false,
        cancelSignal,
        sampleRate: 48000,
        onProgress: ({ totalProgress }) => {
          if (!control.running) return;
          job.progress = 88 + Math.floor(totalProgress * 4);
          saveProgress();
        },
      }),
    );
  } finally {
    // This finally runs after cancellation/completion, never while paused.
    // Remove only this task's intermediate chunks; settings and outputs remain.
    await rm(folder, { recursive: true, force: true });
  }
}
