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
const folder = "output/verification/items";
await mkdir(folder, { recursive: true });
async function load(url: string): Promise<ReportData> {
  const response = await fetch(base + url);
  assert.ok(response.ok);
  return (await response.json()).match;
}
const dota = await load("/api/matches/9035078952");
const lolId =
  process.argv
    .find((arg) => arg.startsWith("--lol-match="))
    ?.slice("--lol-match=".length) || "lol-LOLTMNT02_76144";
const lol = process.argv.includes("--live-items")
  ? await (async () => {
      const response = await fetch(
        base + "/api/lol/items/" + encodeURIComponent(lolId),
        { method: "POST" },
      );
      const data = await response.json();
      assert.ok(response.ok, data.error);
      return data.match as ReportData;
    })()
  : await load("/api/matches/" + encodeURIComponent(lolId));
assert.ok(lol.players.every((p) => p.inventory));
const series = await load("/api/lol/series/lol-LOLTMNT02_76144");
const cs = await load("/api/matches/cs2-monte-og-anubis");
const unavailable = structuredClone(dota);
for (const p of unavailable.players) delete p.inventory;
const missingImages = structuredClone(dota);
for (const p of missingImages.players)
  for (const item of [
    ...p.inventory!.main,
    p.inventory!.neutral,
    p.inventory!.enhancement,
  ])
    if (item) delete item.image;
const browserExecutable = await browserPath();
const browser = await chromium.launch({ executablePath: browserExecutable });
const errors: string[] = [];
const stills: { name: string; props: VideoProps; frame: number }[] = [];
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
async function check(page: Page, expected: number, mode: number) {
  assert.equal(await page.locator("[data-player-inventory]").count(), expected);
  const failures = await page.evaluate((mode) => {
    const failures: string[] = [];
    const overlaps = (a: DOMRect, b: DOMRect) =>
      Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 &&
      Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1;
    const film = document
      .querySelector("[data-match-film]")!
      .getBoundingClientRect();
    const caption = document
      .querySelector("[data-film-caption]")
      ?.getBoundingClientRect();
    for (const row of document.querySelectorAll("[data-player-inventory]")) {
      const bounds = row.getBoundingClientRect();
      if (bounds.right > film.right || bounds.bottom > film.bottom)
        failures.push("Inventory exceeds film");
      if (caption && overlaps(bounds, caption))
        failures.push("Inventory overlaps caption");
      const main = row.querySelector('[data-inventory-group="main"]')!;
      const slotCount = main.querySelectorAll("[data-item-slot]").length;
      if (
        row.getAttribute("data-inventory-layout") === "list"
          ? slotCount < 1 || slotCount > 8
          : slotCount !== 6
      )
        failures.push("Inventory changed slot count");
      for (const img of row.querySelectorAll("img"))
        if (!img.complete || !img.naturalWidth)
          failures.push("Item image failed");
      for (const group of row.querySelectorAll("[data-inventory-group]")) {
        const groupBounds = group.getBoundingClientRect();
        if (groupBounds.right > bounds.right + 1)
          failures.push("Item group exceeds inventory");
      }
      if (mode < 2) {
        for (const selector of [
          "[data-hero-art]",
          "[data-player-identity]",
          "[data-player-stats]",
        ]) {
          const element = document.querySelector(
            selector === "[data-hero-art]" ? "[data-player-art]" : selector,
          );
          if (!element) {
            failures.push("Missing layout element " + selector);
            continue;
          }
          const other = element.getBoundingClientRect();
          if (overlaps(bounds, other))
            failures.push("Inventory overlaps " + selector);
        }
      } else {
        const card = row
          .closest("[data-player-comparison]")!
          .getBoundingClientRect();
        if (bounds.right > card.right + 1 || bounds.bottom > card.bottom + 1)
          failures.push("Inventory exceeds comparison");
      }
    }
    return failures;
  }, mode);
  assert.deepEqual(failures, []);
  checks++;
}
try {
  for (const [name, match] of [
    ["dota", dota],
    ["lol", lol],
    ["cs", cs],
    ["series", series],
    ["unavailable", unavailable],
    ["missing-images", missingImages],
  ] as const) {
    for (const visual of name === "dota" || name === "lol"
      ? (["hero", "photo"] as const)
      : (["hero"] as const)) {
      const page = await browser.newPage({
        viewport: { width: 1680, height: 1100 },
      });
      await page.addInitScript("window.__name = (value) => value;");
      page.on("pageerror", (e) => errors.push(e.message));
      const settings = { ...defaultSettings(match), playerVisual: visual };
      const props = previewProps(match, settings);
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
      const duration = totalFrames(props.segments);
      const start = props.segments[0].frames + props.segments[1].frames;
      const groups = comparisons(match, settings);
      const chapter = props.segments[2].frames / groups.length;
      for (
        let group = 0;
        group < (name === "dota" || name === "lol" ? groups.length : 1);
        group++
      ) {
        for (let mode = 0; mode < 3; mode++) {
          const frame = Math.round(
            start + chapter * group + (chapter / 3) * mode + 65,
          );
          await seek(page, frame, duration);
          const expected =
            name === "series" || name === "unavailable" || name === "cs"
              ? 0
              : mode === 2
                ? 2
                : 1;
          await check(page, expected, mode);
          if (group === 0 || (group === 3 && mode === 0)) {
            const label = `${name}-${visual}-${group}-${mode}`;
            await page
              .locator(".player-shell")
              .screenshot({ path: `${folder}/${label}-preview.png` });
            if (
              (name === "dota" || name === "lol") &&
              visual === "hero" &&
              mode !== 1
            )
              stills.push({ name: label, props, frame });
          }
        }
      }
      if (name === "lol" && visual === "hero") {
        let requests = 0;
        await page.route("**/api/lol/items/**", (route) =>
          ++requests === 1
            ? route.fulfill({
                status: 503,
                json: { error: "测试：官方记录暂不可用" },
              })
            : route.fulfill({ json: { match } }),
        );
        await page
          .getByRole("button", { name: "更新赛末装备", exact: true })
          .click();
        await page
          .getByRole("alert")
          .filter({ hasText: "测试：官方记录暂不可用" })
          .waitFor();
        await check(page, 2, 2);
        await page
          .getByRole("button", { name: "更新赛末装备", exact: true })
          .click();
        await page
          .getByText("已核对并保存这局的赛末装备记录", { exact: true })
          .waitFor();
        assert.equal(requests, 2);
        await check(page, 2, 2);
      }
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 1100 });
        await check(
          page,
          name === "series" || name === "unavailable" || name === "cs" ? 0 : 2,
          2,
        );
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
      }
      await page.close();
    }
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
      });
      console.log("Rendered " + still.name);
    }
  }
  console.log(
    `${checks} inventory preview checks passed; no saved preferences changed.`,
  );
} finally {
  await browser.close();
}
