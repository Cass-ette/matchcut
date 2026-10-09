import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { browserPath } from "../server/render";
import { DEFAULT_CS_MATCH } from "../src/domain";

const base = process.env.MATCHCUT_URL || "http://127.0.0.1:4317";
const folder = "output/verification/cs";
await mkdir(folder, { recursive: true });
const preference = "data/preferences-cs2.json";
const saved = await readFile(preference).catch(() => undefined);
const browser = await chromium.launch({
  executablePath: await browserPath(),
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1680, height: 1100 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/?game=cs2", {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await page
    .getByRole("button", { name: "一键生成视频", exact: true })
    .waitFor();
  await page
    .locator(".cs-match-list button")
    .filter({ hasText: "内置真实比赛" })
    .click();
  await page.getByLabel("雷达对比模式").selectOption("ranked");
  await page.getByLabel("展示排名").selectOption("all");
  assert.equal(await page.locator(".matchup-list button").count(), 5);
  assert.match(
    await page.locator(".matchup-list button").first().innerText(),
    /k1to vs Woro2k/,
  );
  assert.match(
    await page.locator(".matchup-list button").nth(1).innerText(),
    /regali vs DemQQ/,
  );
  assert.equal(
    await page.getByRole("button", { name: "自动最新", exact: true }).count(),
    0,
  );
  assert.equal(await page.locator(".position-editor").count(), 0);
  const boot = await (
    await page.request.get(base + "/api/matches/" + DEFAULT_CS_MATCH)
  ).json();
  assert.deepEqual([boot.match.radiantScore, boot.match.direScore], [7, 13]);
  assert.equal(await page.locator(".scene-strip button").count(), 4);
  for (const i of [0, 1, 2, 3]) {
    await page.locator(".scene-strip button").nth(i).click();
    await page.waitForTimeout(200);
    const text = await page.locator(".player-shell").innerText();
    assert.doesNotMatch(
      text,
      /回合走势|DOTA|LEAGUE OF LEGENDS|天辉|夜魇|分均经验|英雄伤害|参战率/,
    );
    if (i === 1) assert.match(text, /ADR/);
    if (i === 2) assert.match(text, /击杀排行.*Woro2k/s);
    await page
      .locator(".player-shell")
      .screenshot({ path: `${folder}/scene-${i}.png` });
  }
  await page.getByLabel("雷达对比模式").selectOption("positions");
  const generate = page.getByRole("button", {
    name: "一键生成视频",
    exact: true,
  });
  assert.ok(await generate.isDisabled());
  await page.locator(".position-editor summary").click();
  for (const p of boot.match.players) {
    await page
      .getByLabel(boot.match[p.side] + " " + p.name + " 位置", { exact: true })
      .selectOption(String((p.slot % 128) + 1));
  }
  assert.ok(await generate.isEnabled());
  assert.match(
    await page.locator(".matchup-list").innerText(),
    /狙击手.*突破手.*自由人.*辅助.*指挥/s,
  );
  await page.waitForTimeout(1100);
  const savedPrefs = await (
    await page.request.get(base + "/api/bootstrap?game=cs2")
  ).json();
  assert.equal(
    savedPrefs.preferences?.settings.radarMode,
    "positions",
    JSON.stringify(savedPrefs.preferences),
  );
  await page.reload({ waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "一键生成视频", exact: true })
    .waitFor();
  assert.equal(await page.getByLabel("雷达对比模式").inputValue(), "positions");
  assert.ok(await generate.isEnabled());
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出项目", exact: true }).click();
  const download = await downloadPromise;
  const project = JSON.parse(await readFile((await download.path())!, "utf8"));
  assert.equal(project.game, "cs2");
  assert.equal(
    Object.keys(project.settings.positionOverrides.roles).length,
    10,
  );
  await page.getByLabel("雷达对比模式").selectOption("ranked");
  await page.locator("input[type=file][accept='.json']").setInputFiles({
    name: "cs-project.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.waitForFunction(
    () =>
      (
        document.querySelector(
          '[aria-label="雷达对比模式"]',
        ) as HTMLSelectElement
      )?.value === "positions",
  );
  assert.ok(await generate.isEnabled());
  await page.getByLabel("雷达对比模式").selectOption("ranked");
  await page.getByLabel("展示排名").selectOption("all");
  const bad = await page.request.post(
    base + "/api/cs/import?filename=bad.dem",
    {
      headers: { "Content-Type": "application/octet-stream" },
      data: Buffer.from("this is not a real demo"),
    },
  );
  assert.equal(bad.status(), 422);
  assert.match((await bad.json()).error, /Demo/);
  const latest = await page.request.post(base + "/api/jobs", {
    data: { matchId: boot.match.id, settings: boot.settings, source: "latest" },
  });
  assert.equal(latest.status(), 400);
  if (process.env.MATCHCUT_CS_DEMO) {
    const response = page.waitForResponse(
      (r) => r.url().includes("/api/cs/import?"),
      { timeout: 600000 },
    );
    await page
      .getByLabel("导入 CS Demo 文件")
      .setInputFiles(process.env.MATCHCUT_CS_DEMO);
    assert.equal((await response).status(), 200);
    await page
      .getByRole("status")
      .filter({ hasText: /Demo/ })
      .waitFor({ timeout: 60000 });
    const matches = await (
      await page.request.get(base + "/api/cs/matches")
    ).json();
    assert.ok(
      matches.some((m: { id: string }) => /^cs2-[a-f0-9]{64}$/.test(m.id)),
    );
    console.log("Demo upload completed through browser");
  }
  const admin = await browser.newPage();
  await admin.goto(base + "/admin?game=cs2", { waitUntil: "networkidle" });
  await admin.getByRole("tab", { name: /选手定妆照/ }).click();
  assert.equal(await admin.locator(".media-tile").count(), 10);
  await admin.locator(".media-tile").filter({ hasText: "Woro2k" }).click();
  assert.ok(await admin.getByLabel("上传选手头像").count());
  await admin.screenshot({ path: folder + "/media.png", fullPage: true });
  await admin.close();
  for (const width of [1280, 390, 1680]) {
    await page.setViewportSize({ width, height: 1100 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Overflow at " + width,
    );
  }
  await page.locator(".scene-strip button").first().click();
  await page.screenshot({ path: folder + "/workspace.png", fullPage: true });
  if (process.argv.includes("--render")) {
    await page.getByLabel("画面节奏").selectOption("snappy");
    await page.getByLabel("导出清晰度").selectOption("720");
    const response = page
      .waitForResponse(
        (r) => r.url().endsWith("/api/jobs") && r.request().method() === "POST",
      )
      .then((r) => r.json());
    await generate.click();
    let job = await response;
    assert.ok(job.id);
    console.log("CS rendering:", job.id);
    const start = Date.now();
    let last = -1;
    while (!["done", "error"].includes(job.status)) {
      if (Date.now() - start > 900000)
        throw new Error("CS rendering timed out");
      await page.waitForTimeout(1800);
      job = await (await page.request.get(base + "/api/jobs/" + job.id)).json();
      if (Math.floor(job.progress / 10) !== last) {
        last = Math.floor(job.progress / 10);
        console.log(job.progress + "% " + job.message);
      }
    }
    assert.equal(job.status, "done", job.error);
    const metadata = JSON.parse(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_streams",
          "-show_format",
          "-of",
          "json",
          path.join(process.cwd(), job.files["matchcut.mp4"]),
        ],
        { encoding: "utf8" },
      ),
    );
    assert.equal(metadata.streams.length, 1);
    assert.equal(metadata.streams[0].codec_name, "h264");
    assert.deepEqual(
      [metadata.streams[0].width, metadata.streams[0].height],
      [1280, 720],
    );
    assert.equal(metadata.streams[0].r_frame_rate, "30/1");
    const source = JSON.parse(
      await readFile(
        path.join(process.cwd(), job.files["source.json"]),
        "utf8",
      ),
    );
    assert.equal(source.provider, "CS Demo Analyzer");
    assert.equal(source.raw.analyzerVersion, "1.11.0");
    assert.equal(job.props.match.cs.rounds.length, 20);
    assert.equal(job.props.segments[1].frames, 0);
    assert.equal(
      job.props.segments.filter((s: { frames: number }) => s.frames > 0).length,
      4,
    );
    await writeFile(folder + "/last-job.json", JSON.stringify(job, null, 2));
    await writeFile(
      folder + "/metadata.json",
      JSON.stringify(metadata, null, 2),
    );
    console.log("CS video:", job.files["matchcut.mp4"]);
  }
  assert.deepEqual(errors, []);
  console.log("CS browser checks passed");
} finally {
  await browser.close();
  if (saved) await writeFile(preference, saved);
  else await rm(preference, { force: true });
}
