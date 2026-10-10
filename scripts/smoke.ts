import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { browserPath } from "../server/render";
import { comparisons } from "../src/domain";

if (process.argv.includes("--job-api")) {
  await import("./job-api-smoke");
  process.exit(0);
}

if (process.argv.includes("--render-controls")) {
  await import("./render-control-smoke");
  process.exit(0);
}

if (process.argv.includes("--render-status")) {
  await import("./render-status-smoke");
  process.exit(0);
}

if (process.argv.includes("--settings")) {
  await import("./settings-smoke");
  process.exit(0);
}

if (process.argv.includes("--full")) {
  await import("./full-video-smoke");
  process.exit(0);
}

if (process.argv.includes("--items")) {
  await import("./items-smoke");
  process.exit(0);
}

if (process.argv.includes("--cs")) {
  await import("./cs-smoke");
  process.exit(0);
}

if (process.argv.includes("--media")) {
  await import("./media-smoke");
  process.exit(0);
}

if (process.argv.includes("--layout")) {
  await import("./layout-smoke");
  process.exit(0);
}
if (process.argv.includes("--series")) {
  await import("./series-smoke");
  process.exit(0);
}
if (process.argv.includes("--lol")) {
  await import("./lol-smoke");
  process.exit(0);
}
if (process.argv.includes("--bgm")) {
  await import("./bgm-smoke");
  process.exit(0);
}

const base = "http://127.0.0.1:4317";
const folder = "output/verification";
await mkdir(folder, { recursive: true });
const executablePath = await browserPath();
assert.ok(executablePath, "No Chromium executable found");
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  deviceScaleFactor: 1,
});
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base, { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "一键生成视频", exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("比赛编号", { exact: true }).inputValue(),
    "9035078952",
  );
  await page.getByRole("button", { name: "指定比赛", exact: true }).click();
  await page.getByRole("button", { name: /烈焰对决/ }).click();
  await page.getByLabel("栏目名称", { exact: true }).fill("赛后雷达");
  await page.getByLabel("导出清晰度").selectOption("1080");
  await page.getByLabel("雷达对比模式").selectOption("positions");
  await page.getByLabel("展示位置").selectOption("all");
  assert.equal(await page.locator(".matchup-list button").count(), 5);
  assert.match(
    await page.locator(".matchup-list").innerText(),
    /Mikoto vs bzm/,
  );
  await page.getByLabel("雷达对比模式").selectOption("damage");
  assert.equal(await page.locator(".matchup-list button").count(), 1);
  assert.match(
    await page.locator(".matchup-list").innerText(),
    /skiter vs Pure/,
  );
  await page.getByLabel("雷达对比模式").selectOption("positions");
  await page.getByLabel("展示位置").selectOption("2");
  assert.equal(await page.locator(".matchup-list button").count(), 1);
  assert.match(
    await page.locator(".matchup-list").innerText(),
    /Mikoto vs bzm/,
  );
  await page.locator(".position-editor summary").click();
  await page
    .getByLabel("Aurora Gaming skiter 位置", { exact: true })
    .selectOption("2");
  assert.match(
    await page.locator(".matchup-list").innerText(),
    /skiter vs bzm/,
  );
  assert.equal(
    await page
      .getByLabel("Aurora Gaming Mikoto 位置", { exact: true })
      .inputValue(),
    "1",
  );
  await page
    .getByLabel("Aurora Gaming skiter 位置", { exact: true })
    .selectOption("0");
  assert.ok(
    await page
      .getByRole("button", { name: "一键生成视频", exact: true })
      .isDisabled(),
  );
  await page.getByRole("button", { name: "恢复数据源估计" }).click();
  assert.ok(
    await page
      .getByRole("button", { name: "一键生成视频", exact: true })
      .isEnabled(),
  );
  await page.locator(".position-editor summary").click();
  await page.getByLabel("展示位置").selectOption("all");
  await page.locator(".matchup-list button").nth(4).click();
  await page.screenshot({
    path: folder + "/support-preview.png",
    fullPage: true,
  });
  await page.locator(".scene-strip button").nth(0).click();
  assert.match(
    await page.locator(".preview-meta").innerText(),
    /16:9.*1920 × 1080/s,
  );
  const previewBox = await page.locator(".player-shell").boundingBox();
  assert.ok(
    previewBox &&
      Math.abs(previewBox.width / previewBox.height - 16 / 9) < 0.01,
  );
  await page.screenshot({ path: folder + "/workspace.png", fullPage: true });
  await page.getByRole("button", { name: /霓虹交锋/ }).click();
  await page.screenshot({
    path: folder + "/neon-template.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /烈焰对决/ }).click();
  await page.getByRole("button", { name: /黑金荣耀/ }).click();
  await page.getByLabel("特效强度").selectOption("restrained");
  await page.getByLabel("特效强度").selectOption("arena");
  await page.getByRole("button", { name: "标题与文案", exact: true }).click();
  const headline = page.getByLabel("开场标题", { exact: true });
  const original = await headline.inputValue();
  await headline.fill("测试标题 · 可自由修改");
  await page.waitForTimeout(300);
  await headline.fill(original);
  await page.getByRole("button", { name: "外观与节奏", exact: true }).click();
  await page.locator(".scene-strip button").nth(2).click();
  await page.screenshot({
    path: folder + "/radar-preview.png",
    fullPage: true,
  });
  await page.locator(".scene-strip button").nth(0).click();
  // Invalid IDs and untrusted cross-origin mutation attempts must fail explicitly.
  const invalid = await page.request.get(base + "/api/matches/not-a-number");
  assert.equal(invalid.status(), 422);
  const denied = await page.request.post(base + "/api/jobs", {
    headers: { Origin: "https://example.org" },
    data: {},
  });
  assert.equal(denied.status(), 403);
  const broken = await page.request.post(base + "/api/jobs", {
    data: { matchId: "9035078952", settings: {} },
  });
  assert.equal(broken.status(), 400);
  await page.getByRole("button", { name: "使用指南" }).click();
  assert.ok(
    (await page.locator(".help-modal").innerText()).includes("视频不含音轨"),
  );
  await page.locator(".help-modal .icon-button").click();
  if (process.argv.includes("--render")) {
    await page.getByLabel("导出清晰度").selectOption("1080");
    const response = page.waitForResponse(
      (r) => r.url().endsWith("/api/jobs") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "一键生成视频", exact: true })
      .click();
    const job = await (await response).json();
    assert.ok(job.id);
    console.log("Rendering job:", job.id);
    let current = job;
    const started = Date.now();
    let last = -1;
    while (!["done", "error"].includes(current.status)) {
      if (Date.now() - started > 900000) throw new Error("Render timed out");
      await page.waitForTimeout(1800);
      current = await (
        await page.request.get(base + "/api/jobs/" + job.id)
      ).json();
      const bucket = Math.floor(current.progress / 10);
      if (bucket !== last) {
        last = bucket;
        console.log(current.progress + "% " + current.message);
      }
    }
    assert.equal(current.status, "done", current.error);
    assert.ok(current.files["matchcut.mp4"]);
    await writeFile(
      folder + "/last-job.json",
      JSON.stringify(current, null, 2),
    );
    await page.getByText("成片已就绪", { exact: true }).waitFor();
    await page.screenshot({ path: folder + "/generated.png", fullPage: true });
    console.log("Completed:", current.files["matchcut.mp4"]);
    const video = path.join(process.cwd(), current.files["matchcut.mp4"]);
    const metadata = JSON.parse(
      execFileSync(
        "ffprobe",
        ["-v", "error", "-show_streams", "-show_format", "-of", "json", video],
        { encoding: "utf8" },
      ),
    );
    assert.equal(
      metadata.streams.length,
      1,
      "Export must have exactly one video stream and no audio",
    );
    assert.equal(metadata.streams[0].codec_type, "video");
    assert.equal(metadata.streams[0].width, 1920);
    assert.equal(metadata.streams[0].height, 1080);
    assert.equal(metadata.streams[0].r_frame_rate, "30/1");
    await writeFile(
      folder + "/landscape-metadata.json",
      JSON.stringify(metadata, null, 2),
    );
    const segments = current.props.segments as { frames: number }[];
    let start = 0;
    const sceneTimes = segments.map((s) => {
      const t = start / 30 + 2.5;
      start += s.frames;
      return t;
    });
    const radarStart = (segments[0].frames + segments[1].frames) / 30;
    const matchups = comparisons(current.props.match, current.props.settings);
    assert.equal(matchups.length, 5);
    const chapterDuration = segments[2].frames / 30 / matchups.length;
    const times = [
      sceneTimes[0],
      sceneTimes[1],
      ...matchups.flatMap((_, index) =>
        [0, 1, 2].map(
          (phase) =>
            radarStart +
            chapterDuration * index +
            (chapterDuration / 3) * phase +
            2.5,
        ),
      ),
      sceneTimes[3],
      sceneTimes[4],
    ];
    times.forEach((time, i) =>
      execFileSync("ffmpeg", [
        "-y",
        "-v",
        "error",
        "-ss",
        String(time),
        "-i",
        video,
        "-frames:v",
        "1",
        path.resolve(folder, "landscape-" + i + ".png"),
      ]),
    );
    console.log(
      "Verified 1920×1080 / 30 fps / no audio. All five role chapters and four other scenes saved.",
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: folder + "/mobile.png", fullPage: true });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "Mobile layout overflows",
  );
  assert.deepEqual(errors, []);
  console.log("Browser checks passed. Screenshots: " + folder);
} finally {
  await browser.close();
}
