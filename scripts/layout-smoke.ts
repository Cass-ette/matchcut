import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, type Page } from "playwright-core";
import { renderStill, selectComposition } from "@remotion/renderer";
import { browserPath, prepareBundle } from "../server/render";
import {
  comparisons,
  defaultSettings,
  previewProps,
  totalFrames,
  type ReportData,
  type VideoProps,
} from "../src/domain";

const base = "http://127.0.0.1:4317";
const folder = "output/verification/layout";
await mkdir(folder, { recursive: true });
async function load(url: string): Promise<ReportData> {
  const response = await fetch(base + url);
  assert.ok(response.ok, url);
  return (await response.json()).match;
}
const dota = await load("/api/matches/9035078952");
const lol = await load("/api/matches/lol-LOLTMNT02_76148");
const series = await load("/api/lol/series/lol-LOLTMNT02_76144");
const stress = structuredClone(series);
for (const pl of [...stress.players, ...stress.series!.players]) {
  pl.name = "Gumayusi / VeryLongPlayerName";
  pl.kills = 123;
  pl.deaths = 100;
  pl.assists = 456;
}
const browserExecutable = await browserPath();
const browser = await chromium.launch({ executablePath: browserExecutable });
const errors: string[] = [];
const stills: {
  name: string;
  props: VideoProps;
  frame: number;
  scale?: number;
}[] = [];
let checks = 0;

async function seek(page: Page, frame: number, duration: number) {
  const bar = page.locator('.player-shell [style*="touch-action: none"]');
  const box = await bar.boundingBox();
  assert.ok(box);
  await bar.click({
    position: { x: (frame / (duration - 1)) * box.width, y: box.height / 2 },
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => document.fonts.ready);
}

async function check(page: Page, mode: number | "damage") {
  const failures = await page.evaluate((mode) => {
    const errors: string[] = [];
    const rect = (selector: string) =>
      document.querySelector(selector)!.getBoundingClientRect();
    const overlap = (a: DOMRect, b: DOMRect) =>
      Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 &&
      Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1;
    const containedText = (selector: string) => {
      for (const el of document.querySelectorAll(selector)) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const text = range.getBoundingClientRect();
        const bounds = el.getBoundingClientRect();
        if (text.right > bounds.right + 1 || text.left < bounds.left - 1)
          errors.push("Text overflow: " + el.textContent);
      }
    };
    if (mode === "damage" || mode < 2) {
      const identity = rect(
        mode === "damage" ? "[data-damage-identity]" : "[data-player-identity]",
      );
      const scale =
        mode === "damage" ? identity.width / 610 : identity.width / 280;
      if (overlap(identity, rect("[data-hero-art]")))
        errors.push("Name overlaps hero");
      const caption = document.querySelector("[data-film-caption]");
      if (
        caption &&
        identity.bottom > caption.getBoundingClientRect().top - 5 * scale
      )
        errors.push("Identity reaches caption area");
      containedText(
        mode === "damage"
          ? "[data-damage-identity] > div"
          : "[data-player-name], [data-player-kda]",
      );
      if (mode !== "damage") {
        const stats = rect("[data-player-stats]");
        const kda = rect("[data-player-kda]");
        if (kda.left - stats.left < 24 * scale)
          errors.push("KDA has insufficient padding");
        if (identity.bottom > stats.top - 5 * scale)
          errors.push("Identity reaches stats panel");
      }
    } else {
      containedText(
        "[data-comparison-stats], [data-player-comparison] > div > div",
      );
    }
    return errors;
  }, mode);
  assert.deepEqual(failures, []);
  checks++;
}

async function checkCopy(page: Page, match: ReportData) {
  const text = await page.locator("[data-match-film]").innerText();
  assert.ok(!text.includes(match.id), "Internal match ID appears in the film");
  assert.doesNotMatch(
    text,
    /OpenDota|Oracle|opendota\.com|oracleselixir\.com|MATCHCUT|统计口径|能力评分|每轴以|DPM =|KP =|仅统计|最终解释权/,
  );
  if (match.series) assert.match(text, /G1-G5/);
}

try {
  for (const [name, match] of [
    ["dota", dota],
    ["lol", lol],
    ["series", series],
    ["stress", stress],
  ] as const) {
    const page = await browser.newPage({
      viewport: { width: 1680, height: 1100 },
    });
    // tsx preserves function names with a helper in serialized browser callbacks.
    await page.addInitScript("window.__name = (value) => value;");
    page.on("pageerror", (error) => errors.push(error.message));
    const settings = defaultSettings(match);
    const props = previewProps(match, settings);
    const duration = totalFrames(props.segments);
    await page.route("**/api/bootstrap?*", (route) =>
      route.fulfill({
        json: { match, settings, preferences: null, jobs: [], bgmTracks: [] },
      }),
    );
    await page.route("**/api/preferences?*", (route) =>
      route.fulfill({ json: { ok: true } }),
    );
    await page.goto(base + "/?game=" + (match.game || "dota2"), {
      waitUntil: "networkidle",
    });
    await page.locator(".scene-strip button").first().waitFor();
    if (name !== "stress") {
      let offset = 0;
      for (let scene = 0; scene < props.segments.length; scene++) {
        if ([0, 1, 4].includes(scene)) {
          const frame = offset + 150;
          await seek(page, frame, duration);
          await checkCopy(page, match);
          checks++;
          const stillName = `${name}-scene-${scene}`;
          await page.locator(".player-shell").screenshot({
            path: `${folder}/${stillName}-preview.png`,
          });
          stills.push({ name: stillName, props, frame });
        }
        offset += props.segments[scene].frames;
      }
    }
    const start = props.segments[0].frames + props.segments[1].frames;
    const groups = comparisons(match, settings);
    const chapter = props.segments[2].frames / groups.length;
    for (let group = 0; group < groups.length; group++) {
      for (let mode = 0; mode < 3; mode++) {
        const frame = Math.round(
          start + chapter * group + (chapter / 3) * mode + 65,
        );
        await seek(page, frame, duration);
        await page
          .locator(
            mode === 2 ? "[data-player-comparison]" : "[data-player-identity]",
          )
          .first()
          .waitFor();
        if ((group === 3 && mode < 2) || (group === 0 && mode === 2)) {
          await page.locator(".player-shell").screenshot({
            path: `${folder}/${name}-${group}-${mode}-preview.png`,
          });
          if (name !== "stress" || mode === 0)
            stills.push({
              name: `${name}-${group}-${mode}`,
              props,
              frame,
              ...(name === "stress" ? { scale: 2 / 3 } : {}),
            });
        }
        await check(page, mode);
        await checkCopy(page, match);
      }
    }
    const damageFrame = start + props.segments[2].frames + 90;
    await seek(page, damageFrame, duration);
    await page.locator("[data-damage-identity]").waitFor();
    await check(page, "damage");
    await checkCopy(page, match);
    await page
      .locator(".player-shell")
      .screenshot({ path: `${folder}/${name}-damage-preview.png` });
    if (name !== "stress")
      stills.push({ name: `${name}-damage`, props, frame: damageFrame });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      await check(page, "damage");
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
    }
    await page.close();
    console.log(name + " role focus, comparison and damage layouts checked");
  }
  assert.deepEqual(errors, []);
  if (process.argv.includes("--render")) {
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
        frame: still.frame,
        output: `${folder}/${still.name}.png`,
        imageFormat: "png",
        browserExecutable,
        scale: still.scale ?? 1,
      });
      console.log("Export frame: " + still.name);
    }
  }
  console.log(
    `${checks} layout checks passed without changing saved preferences`,
  );
} finally {
  await browser.close();
}
