import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, stat, access } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { browserPath } from "../server/browser";
import { renderChunks } from "../server/render-chunks";
import { RenderCancelled, RenderControl } from "../server/render-control";
import type { Job } from "../server/render";

const folder = path.resolve("output/verification/render-controls");
const fixture = path.resolve(".cache/render-controls-fixture");
await mkdir(folder, { recursive: true });
await mkdir(fixture, { recursive: true });
await writeFile(
  path.join(fixture, "index.tsx"),
  `
import React from 'react';
import {AbsoluteFill, Audio, Composition, registerRoot, useCurrentFrame} from 'remotion';
const Film=({tone})=>{const f=useCurrentFrame();return <AbsoluteFill style={{background:f<30?'red':f<60?'green':'blue',color:'white',fontSize:60}}>{f}<Audio src={tone}/></AbsoluteFill>};
registerRoot(()=> <Composition id="Controls" component={Film} durationInFrames={73} fps={30} width={320} height={180} defaultProps={{tone:''}}/>);
`,
);
// A changing frequency makes dropped/repeated audio at chunk boundaries observable.
execFileSync("ffmpeg", [
  "-v",
  "error",
  "-f",
  "lavfi",
  "-i",
  "aevalsrc=0.1*sin(2*PI*(300*t+40*t*t)):s=48000:d=3",
  "-y",
  path.join(fixture, "tone.wav"),
]);
const tone =
  "data:audio/wav;base64," +
  (await readFile(path.join(fixture, "tone.wav"))).toString("base64");
const serveUrl = await bundle({
  entryPoint: path.join(fixture, "index.tsx"),
  outDir: path.resolve(".cache/render-controls-bundle"),
  publicDir: null,
});
const executable = await browserPath();
const composition = await selectComposition({
  serveUrl,
  id: "Controls",
  inputProps: { tone },
  browserExecutable: executable,
});
const options = {
  composition,
  serveUrl,
  codec: "h264" as const,
  inputProps: { tone },
  browserExecutable: executable,
  concurrency: 1,
  crf: 19,
  pixelFormat: "yuv420p" as const,
  muted: false,
  audioCodec: "aac" as const,
  audioBitrate: "192k" as const,
  timeoutInMilliseconds: 7000,
};
const makeJob = (id: string): Job => ({
  id,
  status: "rendering",
  progress: 20,
  message: "渲染中",
  warnings: [],
  createdAt: new Date().toISOString(),
});
async function until(check: () => boolean, timeout = 60_000) {
  const end = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > end) throw new Error("render controls timed out");
    await delay(10);
  }
}
const job = makeJob("pause-resume");
const control = new RenderControl(job, async () => {});
let renderError: unknown;
const rendering = renderChunks(
  { ...options, outputLocation: path.join(folder, "resumed.mp4") },
  job,
  control,
  async () => {},
  30,
).catch((error) => {
  renderError = error;
});
await until(
  () => !!renderError || (job.renderProgress?.renderedFrames ?? 0) > 38,
);
if (renderError) throw renderError;
await control.pause();
await until(() => job.status === "paused" || !!renderError);
if (renderError) throw renderError;
assert.equal(job.renderProgress?.savedFrames, 30);
const savedChunk = path.join(folder, "chunks/00000000.ts");
const savedBefore = await stat(savedChunk);
const state = JSON.stringify(job.renderProgress);
// A pause longer than the render timeout must still resume successfully.
await delay(7500);
assert.equal(
  JSON.stringify(job.renderProgress),
  state,
  "paused work must stop advancing",
);
await control.resume();
await until(
  () => (job.renderProgress?.savedFrames ?? 0) >= 60 || !!renderError,
);
assert.equal(
  (await stat(savedChunk)).mtimeMs,
  savedBefore.mtimeMs,
  "saved chunk must not be rendered again",
);
await rendering;
if (renderError) throw renderError;
const meta = JSON.parse(
  execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      path.join(folder, "resumed.mp4"),
    ],
    { encoding: "utf8" },
  ),
);
assert.equal(
  Number(meta.streams.find((s: any) => s.codec_type === "video").nb_frames),
  73,
);
assert.equal(
  meta.streams.find((s: any) => s.codec_type === "video").r_frame_rate,
  "30/1",
);
assert.ok(meta.streams.some((s: any) => s.codec_type === "audio"));
assert.ok(Math.abs(Number(meta.format.duration) - 73 / 30) < 0.1);
const pixels = execFileSync("ffmpeg", [
  "-v",
  "error",
  "-i",
  path.join(folder, "resumed.mp4"),
  "-vf",
  "crop=2:2:310:170",
  "-pix_fmt",
  "rgb24",
  "-f",
  "rawvideo",
  "pipe:1",
]);
for (let frame = 0; frame < 73; frame++) {
  const rgb = [...pixels.subarray(frame * 12, frame * 12 + 3)];
  const dominant = rgb.indexOf(Math.max(...rgb));
  assert.equal(
    dominant,
    frame < 30 ? 0 : frame < 60 ? 1 : 2,
    `wrong or duplicated frame at ${frame}`,
  );
}
await renderMedia({
  ...options,
  outputLocation: path.join(folder, "reference.mp4"),
});
const decode = (name: string) =>
  execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path.join(folder, name),
      "-vn",
      "-ac",
      "1",
      "-ar",
      "48000",
      "-f",
      "f32le",
      "pipe:1",
    ],
    { maxBuffer: 4_000_000 },
  );
const actual = decode("resumed.mp4"),
  reference = decode("reference.mp4");
let squareError = 0,
  squareSignal = 0;
for (
  let i = 4800 * 4;
  i < Math.min(actual.length, reference.length) - 4800 * 4;
  i += 4
) {
  const a = actual.readFloatLE(i),
    b = reference.readFloatLE(i);
  squareError += (a - b) ** 2;
  squareSignal += b ** 2;
}
assert.ok(
  squareError / squareSignal < 0.05,
  `audio drift or restart: relative error ${squareError / squareSignal}`,
);
await mkdir(path.join(folder, "silent"), { recursive: true });
const silent = makeJob("silent");
await renderChunks(
  {
    ...options,
    muted: true,
    outputLocation: path.join(folder, "silent/matchcut.mp4"),
  },
  silent,
  new RenderControl(silent, async () => {}),
  async () => {},
  30,
);
const silentMeta = JSON.parse(
  execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_streams",
      "-of",
      "json",
      path.join(folder, "silent/matchcut.mp4"),
    ],
    { encoding: "utf8" },
  ),
);
assert.equal(silentMeta.streams.length, 1);
assert.equal(silentMeta.streams[0].codec_type, "video");
assert.equal(Number(silentMeta.streams[0].nb_frames), 73);
// Stop an actual active render, then stop another one while paused.
for (const paused of [false, true]) {
  const dir = path.join(folder, paused ? "cancel-paused" : "cancel-active");
  await mkdir(dir, { recursive: true });
  const cancelled = makeJob("cancel");
  const controls = new RenderControl(cancelled, async () => {});
  const task = renderChunks(
    { ...options, muted: true, outputLocation: path.join(dir, "matchcut.mp4") },
    cancelled,
    controls,
    async () => {},
    30,
  );
  const rejection = assert.rejects(task, RenderCancelled);
  await until(() => (cancelled.renderProgress?.renderedFrames ?? 0) >= 4);
  if (paused) {
    await controls.pause();
    await until(() => cancelled.status === "paused");
  }
  await controls.cancel();
  await rejection;
  await assert.rejects(access(path.join(dir, "chunks")));
  await assert.rejects(access(path.join(dir, "matchcut.mp4")));
}
console.log(
  "Actual render controls verified: pause halts progress, resume preserves saved chunks, 73 frames and AAC match uninterrupted reference, active/paused cancellation cleans up.",
);
