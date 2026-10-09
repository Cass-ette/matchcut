import { chromium } from "playwright-core";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { browserPath } from "../server/render";
import { comparisons } from "../src/domain";

const base = "http://127.0.0.1:4317",
  folder = "output/verification/lol";
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  executablePath: await browserPath(),
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 1680, height: 1100 },
  deviceScaleFactor: 1,
});
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(base + "?game=lol", { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "一键生成视频", exact: true })
    .waitFor();
  await page.getByLabel("筛选英雄联盟比赛").fill("2024-04-14");
  await page
    .locator(".lol-match-list button")
    .filter({ hasText: "LCK · 2024-04-14" })
    .filter({ hasText: "Gen.G vs T1" })
    .click();
  await page.getByRole("button", { name: "第 5 局", exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector(".match-card-top")?.textContent?.includes("G5"),
  );
  assert.match(
    await page.locator(".source-status").innerText(),
    /自动同步待接入/,
  );
  assert.equal(
    await page.getByRole("button", { name: "自动最新", exact: true }).count(),
    0,
  );
  await page.getByLabel("雷达对比模式").selectOption("positions");
  await page.getByLabel("展示位置").selectOption("all");
  const expected = [
    "Zeus vs Kiin",
    "Oner vs Canyon",
    "Faker vs Chovy",
    "Gumayusi vs Peyz",
    "Keria vs Lehends",
  ];
  assert.equal(await page.locator(".matchup-list button").count(), 5);
  for (const name of expected)
    assert.match(
      await page.locator(".matchup-list").innerText(),
      new RegExp(name),
    );
  await page
    .locator("input[type=file][accept='.csv,text/csv']")
    .setInputFiles("data/fixtures/lol/LOLTMNT02_76148.csv");
  await page.getByRole("status").filter({ hasText: "已保存 1 场" }).waitFor();
  await page.getByLabel("筛选英雄联盟比赛").fill("T1");
  await page.waitForFunction(() => {
    const buttons = [...document.querySelectorAll(".lol-match-list button")];
    return (
      buttons.length > 0 &&
      buttons.every((button) =>
        button.textContent?.toLowerCase().includes("t1"),
      )
    );
  });
  const filtered = await page.locator(".lol-match-list button").allInnerTexts();
  assert.ok(filtered.length > 0);
  assert.ok(filtered.every((text) => text.toLowerCase().includes("t1")));
  await page.getByLabel("筛选英雄联盟比赛").fill("missing-team");
  await page
    .locator(".lol-match-list button")
    .first()
    .waitFor({ state: "hidden" });
  assert.equal(await page.locator(".lol-match-list button").count(), 0);
  await page.getByLabel("筛选英雄联盟比赛").fill("");
  await page.getByRole("button", { name: /黑金荣耀/ }).click();
  await page.getByLabel("画面节奏").selectOption("standard");
  await page.getByLabel("特效强度").selectOption("arena");
  await page.getByLabel("导出清晰度").selectOption("1080");
  await page.locator(".scene-strip button").nth(1).click();
  assert.match(await page.locator(".player-shell").innerText(), /总经济/);
  assert.doesNotMatch(
    await page.locator(".player-shell").innerText(),
    /天辉|夜魇|DOTA|OPENDOTA|最大领先/,
  );
  await page.screenshot({
    path: folder + "/resources-workspace.png",
    fullPage: true,
  });
  await page.getByLabel("展示位置").selectOption("4");
  await page.locator(".matchup-list button").click();
  assert.match(await page.locator(".player-shell").innerText(), /补刀/);
  assert.doesNotMatch(
    await page.locator(".player-shell").innerText(),
    /观察守卫|岗哨|经验/,
  );
  await page.getByLabel("展示位置").selectOption("5");
  await page.locator(".matchup-list button").click();
  assert.match(await page.locator(".player-shell").innerText(), /视野得分/);
  await page.locator(".position-editor summary").click();
  await page.getByLabel("T1 Keria 位置", { exact: true }).selectOption("0");
  assert.ok(
    await page
      .getByRole("button", { name: "一键生成视频", exact: true })
      .isDisabled(),
  );
  await page.getByRole("button", { name: "恢复 CSV 位置" }).click();
  await page.locator(".position-editor summary").click();
  await page.getByLabel("展示位置").selectOption("all");
  await page.screenshot({
    path: folder + "/support-workspace.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Dota 2", exact: true }).click();
  await page.getByLabel("比赛编号", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("比赛编号", { exact: true }).inputValue(),
    "9035078952",
  );
  await page.getByRole("button", { name: "英雄联盟", exact: true }).click();
  await page.getByLabel("筛选英雄联盟比赛").waitFor();
  assert.ok(
    await page
      .getByRole("button", { name: /黑金荣耀/ })
      .evaluate((el) => el.classList.contains("chosen")),
  );
  const boot = await (
    await page.request.get(base + "/api/bootstrap?game=lol")
  ).json();
  const latest = await page.request.post(base + "/api/jobs", {
    data: { matchId: boot.match.id, settings: boot.settings, source: "latest" },
  });
  assert.equal(latest.status(), 400);
  const bad = await page.request.post(base + "/api/lol/import", {
    headers: { "Content-Type": "text/csv" },
    data: "hello,world\na,b",
  });
  assert.equal(bad.status(), 422);
  for (const width of [1280, 390, 1680]) {
    await page.setViewportSize({ width, height: 1100 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Layout overflow at " + width,
    );
  }
  await page.locator(".scene-strip button").nth(0).click();
  await page.screenshot({ path: folder + "/workspace.png", fullPage: true });
  if (process.argv.includes("--render")) {
    const response = page.waitForResponse(
      (r) => r.url().endsWith("/api/jobs") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "一键生成视频", exact: true })
      .click();
    let job = await (await response).json();
    const started = Date.now();
    let bucket = -1;
    console.log("Rendering LoL:", job.id);
    while (!["done", "error"].includes(job.status)) {
      if (Date.now() - started > 900000) throw new Error("Render timed out");
      await page.waitForTimeout(1800);
      job = await (await page.request.get(base + "/api/jobs/" + job.id)).json();
      if (Math.floor(job.progress / 10) !== bucket) {
        bucket = Math.floor(job.progress / 10);
        console.log(job.progress + "% " + job.message);
      }
    }
    assert.equal(job.status, "done", job.error);
    await writeFile(folder + "/job.json", JSON.stringify(job, null, 2));
    assert.equal(job.props.match.game, "lol");
    assert.equal(comparisons(job.props.match, job.props.settings).length, 5);
    const video = path.join(process.cwd(), job.files["matchcut.mp4"]);
    const metadata = JSON.parse(
      execFileSync(
        "ffprobe",
        ["-v", "error", "-show_streams", "-show_format", "-of", "json", video],
        { encoding: "utf8" },
      ),
    );
    assert.equal(metadata.streams.length, 1);
    assert.equal(metadata.streams[0].codec_type, "video");
    assert.equal(metadata.streams[0].width, 1920);
    assert.equal(metadata.streams[0].height, 1080);
    assert.equal(metadata.streams[0].r_frame_rate, "30/1");
    await writeFile(
      folder + "/metadata.json",
      JSON.stringify(metadata, null, 2),
    );
    const segments = job.props.segments as { frames: number }[];
    let start = 0;
    const starts = segments.map((s) => {
      const t = start / 30;
      start += s.frames;
      return t;
    });
    const chapter = segments[2].frames / 30 / 5;
    const times = [
      starts[0] + 2.5,
      starts[1] + 2.5,
      ...expected.flatMap((_, i) =>
        [0, 1, 2].map(
          (phase) => starts[2] + i * chapter + (phase * chapter) / 3 + 2.5,
        ),
      ),
      starts[3] + 2.5,
      starts[4] + 2.5,
    ];
    for (let i = 0; i < times.length; i++)
      execFileSync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        String(times[i]),
        "-i",
        video,
        "-frames:v",
        "1",
        folder + "/frame-" + i + ".png",
      ]);
    await copyFile(video, "output/demo-lol-blackgold.mp4");
    await copyFile(folder + "/frame-10.png", "output/demo-lol-blackgold.png");
    console.log(
      "LoL export verified:",
      metadata.format.duration,
      "seconds; 19 frames extracted; no audio",
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "LoL UI, CSV, role metrics, game switching and source-state checks passed",
  );
} finally {
  await browser.close();
}
