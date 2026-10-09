import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { browserPath } from "../server/render";

const base = "http://127.0.0.1:4317";
const folder = "output/verification/series";
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  executablePath: await browserPath(),
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1680, height: 1100 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base + "/?game=lol", { waitUntil: "networkidle" });
  const game = (n: number) =>
    page.getByRole("button", { name: `第 ${n} 局`, exact: true });
  await game(1).click();
  await page.waitForFunction(() =>
    document.querySelector(".match-card-top")?.textContent?.includes("G1"),
  );
  assert.equal(await page.locator(".game-numbers button").count(), 5);
  const single = await (
    await page.request.get(base + "/api/matches/lol-LOLTMNT02_76144")
  ).json();
  assert.equal(single.match.gameNumber, 1);
  assert.equal(single.match.radiantScore, 24);
  await game(3).click();
  await page.waitForFunction(() =>
    document.querySelector(".match-card-top")?.textContent?.includes("G3"),
  );
  await page.getByRole("button", { name: "标题与文案", exact: true }).click();
  await page.getByLabel("开场标题", { exact: true }).fill("第三局自定义标题");
  await page.getByRole("button", { name: "系列赛汇总", exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector(".series-scope")?.textContent?.includes("5 局"),
  );
  assert.match(
    await page.getByLabel("开场标题", { exact: true }).inputValue(),
    /Gen.G 3 : 2 T1/,
  );
  assert.match(
    await page.locator(".player-shell").innerText(),
    /系列赛比分 · 5 局/,
  );
  assert.doesNotMatch(
    await page.locator(".player-shell").innerText(),
    /单局数据|DEFEAT|VICTORY/,
  );
  await page.getByRole("button", { name: "单局视频", exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector(".match-card-top")?.textContent?.includes("G3"),
  );
  assert.equal(
    await page.getByLabel("开场标题", { exact: true }).inputValue(),
    "第三局自定义标题",
  );
  await page.getByRole("button", { name: "系列赛汇总", exact: true }).click();
  await page.waitForFunction(() => !!document.querySelector(".series-scope"));
  await page.getByRole("button", { name: "外观与节奏", exact: true }).click();
  await page.getByRole("button", { name: /黑金荣耀/ }).click();
  await page.getByLabel("雷达对比模式").selectOption("positions");
  await page.getByLabel("展示位置").selectOption("all");
  await page.getByLabel("画面节奏").selectOption("snappy");
  await page.getByLabel("导出清晰度").selectOption("1080");
  if (await page.getByRole("button", { name: "移除 BGM", exact: true }).count())
    await page.getByRole("button", { name: "移除 BGM", exact: true }).click();
  assert.equal(await page.locator(".matchup-list button").count(), 5);
  assert.match(
    await page.locator(".matchup-list").innerText(),
    /Chovy vs Faker/,
  );
  assert.equal(await page.locator(".position-editor").count(), 0);
  for (let i = 0; i < 5; i++) {
    await page.locator(".scene-strip button").nth(i).click();
    await page.waitForTimeout(180);
    assert.match(await page.locator(".player-shell").innerText(), /G1-G5/);
    await page
      .locator(".player-shell")
      .screenshot({ path: `${folder}/scene-${i}.png` });
  }
  await page.locator(".scene-strip button").nth(0).click();
  await page.screenshot({ path: folder + "/workspace.png", fullPage: true });
  // Preferences restore mode; exported projects freeze the exact list of games.
  await page.waitForTimeout(900);
  await page.reload({ waitUntil: "networkidle" });
  assert.match(await page.locator(".series-scope").innerText(), /5 局/);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出项目", exact: true }).click();
  const download = await downloadPromise;
  const project = JSON.parse(await readFile((await download.path())!, "utf8"));
  assert.equal(project.reportMode, "series");
  assert.equal(project.gameIds.length, 5);
  await game(2).click();
  await page.waitForFunction(() =>
    document.querySelector(".match-card-top")?.textContent?.includes("G2"),
  );
  await page.locator("input[type=file][accept='.json']").setInputFiles({
    name: "series.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.waitForFunction(() => !!document.querySelector(".series-scope"));
  // An intentionally partial archive remains partial and reports its missing games.
  const partial = await (
    await page.request.get(
      base +
        "/api/lol/series/lol-LOLTMNT02_76144?games=lol-LOLTMNT02_76144,lol-LOLTMNT02_76146",
    )
  ).json();
  assert.deepEqual(partial.match.series.missingGames, [2]);
  assert.deepEqual(partial.match.series.wins, { radiant: 1, dire: 1 });
  const invalid = await page.request.get(
    base + "/api/lol/series/lol-LOLTMNT02_76144?games=lol-UNKNOWN",
  );
  assert.equal(invalid.status(), 422);
  for (const width of [1280, 390, 1680]) {
    await page.setViewportSize({ width, height: 1100 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Overflow at " + width,
    );
  }
  if (process.argv.includes("--render")) {
    const response = page.waitForResponse(
      (r) => r.url().endsWith("/api/jobs") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "一键生成视频", exact: true })
      .click();
    let job = await (await response).json();
    assert.ok(job.id);
    const id = job.id,
      start = Date.now();
    let last = -1;
    console.log("Rendering BO5:", id);
    while (!["done", "error"].includes(job.status)) {
      if (Date.now() - start > 900000) throw new Error("Render timed out");
      await page.waitForTimeout(1800);
      job = await (await page.request.get(base + "/api/jobs/" + id)).json();
      if (Math.floor(job.progress / 10) !== last) {
        last = Math.floor(job.progress / 10);
        console.log(job.progress + "% " + job.message);
      }
    }
    assert.equal(job.status, "done", job.error);
    const video = path.join(process.cwd(), job.files["matchcut.mp4"]);
    const meta = JSON.parse(
      execFileSync(
        "ffprobe",
        ["-v", "error", "-show_streams", "-show_format", "-of", "json", video],
        { encoding: "utf8" },
      ),
    );
    assert.equal(meta.streams.length, 1);
    assert.deepEqual(
      [meta.streams[0].width, meta.streams[0].height],
      [1920, 1080],
    );
    assert.equal(meta.streams[0].r_frame_rate, "30/1");
    const archive = JSON.parse(
      await readFile(
        path.join(process.cwd(), job.files["source.json"]),
        "utf8",
      ),
    );
    assert.equal(archive.games.length, 5);
    assert.equal(archive.raw.games.length, 5);
    const saved = JSON.parse(
      await readFile(
        path.join(process.cwd(), job.files["project.json"]),
        "utf8",
      ),
    );
    assert.equal(saved.reportMode, "series");
    assert.deepEqual(saved.gameIds, project.gameIds);
    await writeFile(folder + "/job.json", JSON.stringify(job, null, 2));
    await writeFile(folder + "/metadata.json", JSON.stringify(meta, null, 2));
    let from = 0;
    for (let i = 0; i < job.props.segments.length; i++) {
      execFileSync("ffmpeg", [
        "-y",
        "-v",
        "error",
        "-ss",
        String(from / 30 + 3),
        "-i",
        video,
        "-frames:v",
        "1",
        `${folder}/render-${i}.png`,
      ]);
      from += job.props.segments[i].frames;
    }
    await copyFile(video, "output/demo-lol-series.mp4");
    console.log(
      "BO5 verified: 1080p / 30 fps / silent / five source snapshots",
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "Series UI, game selection, rates, project import/export, persistence and partial archive checks passed",
  );
} finally {
  await browser.close();
}
