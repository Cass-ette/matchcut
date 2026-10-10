import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import { browserPath, prepareBundle } from "../server/render";
import {
  defaultSettings,
  previewProps,
  totalFrames,
  videoScenes,
  type ReportData,
} from "../src/domain";

const base = "http://127.0.0.1:4317";
const folder = "output/verification/full";
const id =
  process.argv.find((s) => s.startsWith("--lol-match="))?.split("=")[1] ??
  "lol-LOLTMNT02_76144";
async function load(url: string) {
  const res = await fetch(base + url);
  const body = await res.json();
  assert.ok(res.ok, body.error);
  return body;
}
const full = await load("/api/lol/full/" + id);
const match: ReportData = full.match;
assert.ok(match.fullGames && match.fullGames.length > 1);
const ids = match.series!.games.map((g) => g.id);
const g2 = ids[1];
const single = await load("/api/matches/" + g2);
const initialSettings = {
  ...defaultSettings(single.match),
  radarPosition: "3",
  pace: "snappy",
  mvp: { enabled: true, mode: "auto" as const, manual: {} },
};
let preferences: any;
const browserExecutable = await browserPath();
const browser = await chromium.launch({ executablePath: browserExecutable });
const page = await browser.newPage({ viewport: { width: 1680, height: 1100 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
await mkdir(folder, { recursive: true });
// Exercise reloads without replacing the user's saved preferences or starting jobs.
await page.route("**/api/preferences?*", async (route) => {
  preferences = route.request().postDataJSON();
  await route.fulfill({ json: { ok: true } });
});
await page.route("**/api/bootstrap?*", async (route) => {
  const data = preferences
    ? await load(
        (preferences.reportMode === "game"
          ? "/api/matches/"
          : `/api/lol/${preferences.reportMode}/`) +
          preferences.matchId +
          (preferences.gameIds
            ? "?games=" + preferences.gameIds.join(",")
            : ""),
      )
    : single;
  await route.fulfill({
    json: {
      ...data,
      settings: initialSettings,
      preferences,
      jobs: [],
      bgmTracks: [],
    },
  });
});
try {
  await page.goto(base + "/?game=lol", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "完整视频", exact: true }).click();
  await page.locator(".chapter-strip").waitFor();
  assert.equal(
    await page.locator(".chapter-strip button").count(),
    ids.length + 2,
  );
  await page.getByRole("button", { name: "标题与文案", exact: true }).click();
  await page.getByLabel("开场标题", { exact: true }).fill("完整战报自定义标题");
  for (let c = 0; c < ids.length + 2; c++) {
    await page.locator(".chapter-strip button").nth(c).click();
    const count = await page.locator(".scene-strip button").count();
    assert.equal(count, c === 0 ? 1 : 5);
    for (let s = 0; s < count; s++) {
      await page.locator(".scene-strip button").nth(s).click();
      await page.waitForTimeout(180);
      const film = page.locator("[data-match-film]");
      assert.equal(
        await film.getAttribute("data-film-chapter"),
        c === 0 ? "opening" : c === ids.length + 1 ? "summary" : ids[c - 1],
      );
      assert.equal(
        await film.getAttribute("data-film-match"),
        c === 0 || c === ids.length + 1 ? match.id : ids[c - 1],
      );
      if (c > 0 && c <= ids.length) {
        assert.match(await page.locator("[data-film-scope]").innerText(), /胜/);
      } else {
        assert.equal(await page.locator("[data-player-inventory]").count(), 0);
      }
      assert.deepEqual(
        await page.evaluate(() => {
          const failures: string[] = [];
          const film = document
            .querySelector("[data-match-film]")!
            .getBoundingClientRect();
          const scope = document
            .querySelector("[data-film-scope]")!
            .getBoundingClientRect();
          if (scope.right > film.right || scope.left < film.left)
            failures.push("scope overflow");
          for (const img of document.querySelectorAll<HTMLImageElement>(
            "[data-match-film] img",
          ))
            if (img.complete && !img.naturalWidth)
              failures.push("broken image: " + img.src);
          return failures;
        }),
        [],
      );
    }
  }
  await page.locator(".chapter-strip button").nth(2).click();
  await page.getByLabel("资源对比文案").fill("第二局单独文案");
  await page.getByRole("button", { name: "单局视频", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector(".chapter-strip"));
  await page.waitForFunction(
    (id) =>
      document
        .querySelector("[data-film-match]")
        ?.getAttribute("data-film-match") === id,
    g2,
  );
  await page
    .getByLabel("视频统计范围")
    .getByRole("button", { name: "系列赛汇总", exact: true })
    .click();
  await page.locator(".series-scope").waitFor();
  assert.equal(await page.locator(".chapter-strip").count(), 0);
  await page.getByRole("button", { name: "完整视频", exact: true }).click();
  await page.locator(".chapter-strip").waitFor();
  assert.equal(
    await page.getByLabel("开场标题", { exact: true }).inputValue(),
    "完整战报自定义标题",
  );
  await page.locator(".chapter-strip button").nth(2).click();
  assert.equal(
    await page.getByLabel("资源对比文案").inputValue(),
    "第二局单独文案",
  );
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出项目", exact: true }).click();
  const project = JSON.parse(
    await readFile((await (await downloadEvent).path())!, "utf8"),
  );
  assert.equal(project.reportMode, "full");
  assert.deepEqual(project.gameIds, ids);
  assert.equal(project.settings.gameScripts[g2][1], "第二局单独文案");
  await page.waitForTimeout(850);
  assert.equal(preferences.reportMode, "full");
  assert.deepEqual(preferences.gameIds, ids);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(
    await page
      .getByRole("button", { name: "完整视频", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "标题与文案", exact: true }).click();
  assert.equal(
    await page.getByLabel("开场标题", { exact: true }).inputValue(),
    "完整战报自定义标题",
  );
  await page.locator(".chapter-strip button").nth(2).click();
  await page.locator(".scene-strip button").nth(1).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: folder + "/workspace.png", fullPage: true });
  const partialIds = [ids[0], ids.at(-1)];
  const partialData = await load(
    "/api/lol/full/" + id + "?games=" + partialIds.join(","),
  );
  const partial = {
    ...project,
    gameIds: partialIds,
    settings: defaultSettings(partialData.match),
  };
  await page.locator("input[type=file][accept='.json']").setInputFiles({
    name: "full.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(partial)),
  });
  await page.waitForFunction(
    () => document.querySelectorAll(".chapter-strip button").length === 4,
  );
  const invalid = await fetch(
    base + "/api/lol/full/" + id + "?games=" + id + ",lol-UNKNOWN",
  );
  assert.equal(invalid.status, 422);
  let payload: any;
  await page.route("**/api/jobs", async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({
      status: 422,
      json: { error: "Smoke: export payload captured" },
    });
  });
  await page.getByRole("button", { name: "一键生成视频", exact: true }).click();
  await page.waitForTimeout(150);
  assert.equal(payload.reportMode, "full");
  assert.deepEqual(payload.gameIds, partial.gameIds);
  for (const width of [390, 1280, 1680]) {
    await page.setViewportSize({ width, height: 1100 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "page overflow at " + width,
    );
  }
  assert.deepEqual(errors, []);
  if (process.argv.includes("--render")) {
    const props = previewProps(match, {
      ...defaultSettings(match),
      radarPosition: "3",
      pace: "snappy",
    });
    const scenes = videoScenes(props);
    const serveUrl = await prepareBundle();
    const composition = await selectComposition({
      serveUrl,
      id: "MatchFilm",
      inputProps: props,
      browserExecutable,
    });
    assert.equal(composition.durationInFrames, totalFrames(props.segments));
    const samples = scenes.filter(
      (s) => s.slot === 2 || s.slot === 0 || s.slot === 4,
    );
    for (const sample of samples) {
      const frame =
        sample.from +
        (sample.slot === 2 ? Math.floor((sample.frames * 2) / 3) + 40 : 65);
      await renderStill({
        composition,
        serveUrl,
        inputProps: props,
        browserExecutable,
        frame,
        imageFormat: "png",
        output: `${folder}/chapter-${sample.chapterIndex}-scene-${sample.slot}.png`,
      });
    }
    // Cross a game boundary and the switch from last game to aggregate with real encoding.
    for (const chapter of [2, props.chapters!.length - 1]) {
      const boundary = scenes.find((s) => s.chapterIndex === chapter)!.from;
      const outputLocation = `${folder}/transition-${chapter}.mp4`;
      await renderMedia({
        composition,
        serveUrl,
        inputProps: props,
        browserExecutable,
        codec: "h264",
        muted: true,
        scale: 2 / 3,
        concurrency: 2,
        frameRange: [boundary - 20, boundary + 39],
        outputLocation,
      });
      const meta = JSON.parse(
        execFileSync(
          "ffprobe",
          ["-v", "error", "-show_streams", "-of", "json", outputLocation],
          { encoding: "utf8" },
        ),
      );
      assert.equal(meta.streams[0].nb_frames, "60");
      assert.equal(meta.streams[0].width, 1280);
    }
    await writeFile(
      folder + "/timeline.json",
      JSON.stringify(
        scenes.map((s) => ({
          chapter: s.chapter?.label,
          name: s.name,
          from: s.from,
          frames: s.frames,
        })),
        null,
        2,
      ),
    );
  }
  console.log(
    `Full video verified: ${ids.length} games, chapter navigation, isolated copy, reload, exact project game set, export payload and responsive layout${process.argv.includes("--render") ? ", rendered stills and encoded transitions" : ""}. Saved preferences untouched.`,
  );
} finally {
  await browser.close();
}
