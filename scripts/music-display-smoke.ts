import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { chromium, type Page } from "playwright-core";
import { renderStill, selectComposition } from "@remotion/renderer";
import { browserPath, prepareBundle } from "../server/render";
import {
  defaultSettings,
  previewProps,
  totalFrames,
  videoScenes,
  type BgmTrack,
  type ReportData,
  type VideoProps,
} from "../src/domain";

const base = "http://127.0.0.1:4317";
const folder = "output/verification/music-display";
await mkdir(folder, { recursive: true });
const browserExecutable = await browserPath();
const browser = await chromium.launch({ executablePath: browserExecutable });
const cleanup: string[] = [];
const stills: { name: string; props: VideoProps; frame: number }[] = [];
const errors: string[] = [];
async function seek(page: Page, frame: number, duration: number) {
  const bar = page
    .locator('.player-shell [style*="touch-action: none"]')
    .last();
  const box = await bar.boundingBox();
  assert.ok(box);
  await bar.click({
    position: { x: (frame / (duration - 1)) * box.width, y: box.height / 2 },
  });
  await page.waitForTimeout(160);
}
async function checkLayout(page: Page) {
  assert.deepEqual(
    await page.evaluate(() => {
      const film = document
        .querySelector("[data-match-film]")!
        .getBoundingClientRect();
      const badge = document
        .querySelector("[data-bgm-badge]")!
        .getBoundingClientRect();
      const nav = document
        .querySelector("[data-film-navigation]")!
        .getBoundingClientRect();
      const caption = document
        .querySelector("[data-film-caption]")
        ?.getBoundingClientRect();
      const failures: string[] = [];
      if (badge.left < film.left || badge.bottom > film.bottom)
        failures.push("Music badge outside film");
      if (badge.right > nav.left) failures.push("Music overlaps navigation");
      if (caption && badge.top < caption.bottom)
        failures.push("Music overlaps captions");
      const footer = document.querySelector("[data-film-footer]")!;
      if (footer.scrollWidth > footer.clientWidth + 1)
        failures.push("Footer overflows");
      return failures;
    }),
    [],
  );
}
try {
  const audio = path.join(folder, "display-test.wav");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=293:duration=2.4",
    audio,
  ]);
  const response = await fetch(base + "/api/bgm?filename=Night%20Drive.wav", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: await readFile(audio),
  });
  assert.ok(response.ok);
  let track: BgmTrack = await response.json();
  cleanup.push(`data/cache/bgm/${track.id}.json`, `public${track.src}`);
  const art = await sharp(
    Buffer.from(
      '<svg width="512" height="512"><rect width="512" height="512" fill="#123041"/><circle cx="310" cy="185" r="132" fill="#f3b36c"/><path d="M0 315L512 220V512H0Z" fill="#508586"/><path d="M0 416L512 300V512H0Z" fill="#162c40"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  const coverResponse = await fetch(`${base}/api/bgm/${track.id}/cover`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: art,
  });
  assert.ok(coverResponse.ok);
  track = await coverResponse.json();
  assert.ok(track.cover);
  cleanup.push(`public${track.cover}`);
  const bad = await fetch(`${base}/api/bgm/${track.id}/cover`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: "invalid",
  });
  assert.equal(bad.status, 422);

  for (const [name, url] of [
    ["lol", "/api/matches/lol-LOLTMNT02_76148"],
    ["dota2", "/api/matches/9035078952"],
    ["cs2", "/api/matches/cs2-monte-og-anubis"],
    ["full", "/api/lol/full/lol-LOLTMNT02_76144"],
  ]) {
    const data = await (await fetch(base + url)).json();
    const match: ReportData = data.match;
    assert.ok(match, url);
    const settings = defaultSettings(match);
    settings.bgm = {
      trackId: track.id,
      volume: 0.3,
      loop: true,
      showInfo: true,
      displayTitle: "NIGHT DRIVE / 夜航",
      displayArtist: "Test Artist",
    };
    settings.mvp.enabled = true;
    const props = previewProps(match, settings, track);
    const duration = totalFrames(props.segments);
    const page = await browser.newPage({
      viewport: { width: 1680, height: 1100 },
    });
    let preferences: any = null;
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/bootstrap?*", (route) =>
      route.fulfill({
        json: { match, settings, preferences, bgmTracks: [track], jobs: [] },
      }),
    );
    await page.route("**/api/preferences?*", async (route) => {
      preferences = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(base + "/?game=" + (match.game || "dota2"), {
      waitUntil: "networkidle",
    });
    await page.getByLabel("显示音乐信息", { exact: true }).waitFor();
    await seek(page, 90, duration);
    await page.locator("[data-bgm-badge]").waitFor();
    assert.equal(await page.locator("[data-bgm-badge] img").count(), 1);
    await checkLayout(page);
    const rotation = await page
      .locator("[data-bgm-record]")
      .getAttribute("style");
    await page.waitForTimeout(150);
    assert.equal(
      await page.locator("[data-bgm-record]").getAttribute("style"),
      rotation,
      "Paused record should stay still",
    );
    for (const scene of videoScenes(props)) {
      await seek(page, scene.from + 65, duration);
      await checkLayout(page);
      const angle = await page
        .locator("[data-bgm-record]")
        .evaluate((el: HTMLElement) =>
          Number(el.style.transform.match(/rotate\(([-.\d]+)deg\)/)?.[1]),
        );
      assert.ok(
        Math.abs(angle - (scene.from + 65)) < 40,
        "Rotation must use the global film clock",
      );
    }
    const previewFrame =
      videoScenes(props).find((scene) => scene.slot === 3)!.from + 90;
    await seek(page, previewFrame, duration);
    await page
      .locator("[data-match-film]")
      .screenshot({ path: `${folder}/${name}-preview.png` });
    if (name === "lol" || name === "full")
      stills.push({ name, props, frame: previewFrame });
    if (name === "lol") {
      await page
        .getByLabel("显示曲名", { exact: true })
        .fill(
          "很长的曲名 / This is a very long music title that must stay inside the footer",
        );
      await checkLayout(page);
      await page.getByLabel("显示曲名", { exact: true }).fill("分享的 BGM");
      await page.getByLabel(/^歌手/).fill("歌手名字");
      await page.waitForTimeout(850);
      await page.reload({ waitUntil: "networkidle" });
      assert.equal(
        await page.getByLabel("显示曲名", { exact: true }).inputValue(),
        "分享的 BGM",
      );
      await page.getByLabel("显示音乐信息", { exact: true }).uncheck();
      assert.equal(await page.locator("[data-bgm-badge]").count(), 0);
      assert.ok(
        await page.getByLabel("选择 BGM").inputValue(),
        "Hiding credits must not remove audio",
      );
      await page.getByLabel("显示音乐信息", { exact: true }).check();
      await page.getByLabel("循环 BGM", { exact: true }).uncheck();
      await seek(page, 160, duration);
      assert.equal(
        await page
          .locator("[data-bgm-badge]")
          .evaluate((el) => getComputedStyle(el).opacity),
        "0",
        "Hide after non-looping audio ends",
      );
      await page.getByLabel("循环 BGM", { exact: true }).check();
      await seek(page, 160, duration);
      assert.equal(
        await page
          .locator("[data-bgm-badge]")
          .evaluate((el) => getComputedStyle(el).opacity),
        "1",
      );
      await page.getByLabel("BGM 音量").fill("0");
      assert.equal(await page.locator("[data-bgm-badge]").count(), 0);
      await page.getByLabel("BGM 音量").fill("30");
      await page.setViewportSize({ width: 390, height: 1000 });
      await checkLayout(page);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.getByRole("button", { name: "移除 BGM", exact: true }).click();
      assert.equal(await page.locator("[data-bgm-badge]").count(), 0);
      await page.setViewportSize({ width: 1680, height: 1100 });
      // A legacy track without any artwork must still preview and export.
      const noCover = { ...track, cover: undefined };
      await page.route("**/api/bootstrap?*", (route) =>
        route.fulfill({
          json: {
            match,
            settings,
            preferences: null,
            bgmTracks: [noCover],
            jobs: [],
          },
        }),
      );
      await page.reload({ waitUntil: "networkidle" });
      await seek(page, 90, duration);
      assert.equal(await page.locator("[data-bgm-badge] img").count(), 0);
      await checkLayout(page);
      stills.push({
        name: "no-cover",
        props: previewProps(match, settings, noCover),
        frame: 90,
      });
    }
    await page.close();
    console.log(`${name}: all scenes checked; music fits the footer`);
  }
  assert.deepEqual(errors, []);
  if (process.argv.includes("--render")) {
    const jobs = await (await fetch(base + "/api/jobs")).json();
    assert.ok(
      jobs.every((job: any) =>
        ["done", "cancelled", "error"].includes(job.status),
      ),
      "Do not prepare a render bundle during an active job",
    );
    const serveUrl = await prepareBundle();
    for (const still of stills) {
      const composition = await selectComposition({
        serveUrl,
        id: "MatchFilm",
        inputProps: still.props,
        browserExecutable,
      });
      await renderStill({
        serveUrl,
        composition,
        inputProps: still.props,
        browserExecutable,
        frame: still.frame,
        output: `${folder}/${still.name}-export.png`,
        imageFormat: "png",
        scale: still.name === "full" ? 2 : 1,
      });
      console.log(
        `${still.name}: exported ${still.name === "full" ? "4K" : "1080p"} still`,
      );
    }
  }
  console.log("Music display verified without changing user preferences.");
} finally {
  await browser.close();
  for (const file of cleanup) await rm(file, { force: true });
}
