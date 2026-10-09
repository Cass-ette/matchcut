import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import path from "node:path";
import { createHash } from "node:crypto";
import { browserPath, runRender, Job } from "../server/render";
import { loadLolMatch } from "../server/lol-source";
import { refreshSettings, settingsSchema } from "../src/domain";

const base = "http://127.0.0.1:4317",
  folder = "output/verification/bgm";
await mkdir(folder, { recursive: true });
const original = await (await fetch(base + "/api/bootstrap?game=lol")).json();
const browser = await chromium.launch({
  executablePath: await browserPath(),
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
let trackId: string | undefined;
try {
  const audioFile = path.join(folder, "BGM 验证测试音.wav");
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=330:duration=2.4:sample_rate=48000",
    audioFile,
  ]);
  trackId = createHash("sha256")
    .update(await readFile(audioFile))
    .digest("hex");
  await page.goto(base + "?game=lol", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "导入 BGM", exact: true }).waitFor();
  const imported = page.waitForResponse(
    (r) =>
      r.url().includes("/api/bgm?filename=") && r.request().method() === "POST",
  );
  await page
    .locator('input[type=file][accept*=".mp3"]')
    .setInputFiles(audioFile);
  assert.equal((await imported).status(), 200);
  await page.getByLabel("BGM 音量").waitFor();
  const track = (await (await page.request.get(base + "/api/bgm")).json()).find(
    (t: any) => t.id === trackId,
  );
  assert.ok(track.id, JSON.stringify(track));
  trackId = track.id;
  await page.getByLabel("BGM 音量").fill("23");
  assert.ok(await page.getByLabel("循环 BGM").isChecked());
  await page
    .getByLabel("预听 BGM")
    .evaluate(async (element: HTMLAudioElement) => {
      await element.play();
      element.pause();
    });
  await page.waitForTimeout(1000);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.getByLabel("选择 BGM").inputValue(), track.id);
  assert.equal(await page.getByLabel("BGM 音量").inputValue(), "23");
  await page.getByLabel("循环 BGM").uncheck();
  await page.getByLabel("循环 BGM").check();
  await page.screenshot({ path: folder + "/workspace.png", fullPage: true });
  const invalid = await page.request.post(base + "/api/bgm?filename=bad.mp3", {
    headers: { "Content-Type": "application/octet-stream" },
    data: "not an audio file",
  });
  assert.equal(invalid.status(), 422);
  const duplicate = await page.request.post(
    base + "/api/bgm?filename=same.wav",
    {
      headers: { "Content-Type": "application/octet-stream" },
      data: await readFile(audioFile),
    },
  );
  assert.equal((await duplicate.json()).id, track.id);
  const boot = await (
    await page.request.get(base + "/api/bootstrap?game=lol")
  ).json();
  const missing = await page.request.post(base + "/api/jobs", {
    data: {
      matchId: boot.match.id,
      settings: {
        ...boot.settings,
        bgm: { trackId: "f".repeat(64), volume: 0.5, loop: true },
      },
    },
  });
  assert.equal(missing.status(), 422);
  const selected = settingsSchema.parse({
    ...boot.preferences.settings,
    radarPosition: "3",
    resolution: "720",
    pace: "snappy",
    headline: "BGM 功能验证 · 测试音",
  });
  const { match, raw } = await loadLolMatch(boot.match.id);
  const singleSettings = refreshSettings(match, selected);
  // Same render pipeline as /api/jobs, stored outside the user's recent-exports history.
  const job: Job = {
    id: "verification/bgm/render",
    status: "preparing",
    progress: 0,
    message: "BGM verification",
    createdAt: new Date().toISOString(),
    warnings: [],
  };
  let last = -1;
  await runRender(job, match, raw, singleSettings, base, async () => {
    const bucket = Math.floor(job.progress / 10);
    if (bucket !== last) {
      last = bucket;
      console.log(job.progress + "% " + job.message);
    }
  });
  assert.equal(job.status, "done", job.error);
  const file = path.join(process.cwd(), job.files!["matchcut.mp4"]);
  const metadata = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", file],
      { encoding: "utf8" },
    ),
  );
  assert.equal(metadata.streams.length, 2);
  assert.equal(
    metadata.streams.find((s: any) => s.codec_type === "video").width,
    1280,
  );
  assert.equal(
    metadata.streams.find((s: any) => s.codec_type === "audio").codec_name,
    "aac",
  );
  const rms = (start: number, seconds: number) => {
    const pcm = execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(start),
      "-i",
      file,
      "-t",
      String(seconds),
      "-vn",
      "-ac",
      "1",
      "-ar",
      "48000",
      "-f",
      "f32le",
      "pipe:1",
    ]);
    let sum = 0;
    for (let i = 0; i < pcm.length; i += 4) sum += pcm.readFloatLE(i) ** 2;
    return Math.sqrt(sum / (pcm.length / 4));
  };
  const middle = rms(20, 1),
    late = rms(Number(metadata.format.duration) - 4, 1),
    first = rms(0, 0.1),
    lastAudio = rms(Number(metadata.format.duration) - 0.1, 0.08);
  assert.ok(
    middle > 0.005 && middle < 0.035,
    "Selected volume should reach the encoded audio",
  );
  assert.ok(late > middle * 0.7, "Short BGM should repeat throughout the film");
  assert.ok(
    first < middle * 0.2 && lastAudio < middle * 0.2,
    "Film boundaries should fade",
  );
  await writeFile(
    folder + "/result.json",
    JSON.stringify(
      { job, metadata, rms: { middle, late, first, lastAudio } },
      null,
      2,
    ),
  );
  await page.getByRole("button", { name: "移除 BGM", exact: true }).click();
  assert.equal(await page.getByLabel("预听 BGM").count(), 0);
  await page.waitForTimeout(1000);
  const after = await (
    await page.request.get(base + "/api/bootstrap?game=lol")
  ).json();
  assert.equal(after.preferences.settings.bgm, undefined);
  assert.deepEqual(errors, []);
  console.log(
    "BGM upload, playback, persistence, removal and actual AAC export verified",
    JSON.stringify({ middle, late, first, lastAudio }),
  );
} finally {
  await browser.close();
  await fetch(base + "/api/preferences?game=lol", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      original.preferences || {
        settings: original.settings,
        source: "current",
        leagueId: "",
        teamId: "",
      },
    ),
  });
  if (
    trackId &&
    !original.bgmTracks.some(
      (t: any) => t.id === trackId && t.name !== "BGM 验证测试音.wav",
    )
  ) {
    await unlink(path.join("data/cache/bgm", trackId + ".json")).catch(
      () => {},
    );
    await unlink(path.join("public/assets/bgm", trackId + ".m4a")).catch(
      () => {},
    );
  }
}
