import assert from "node:assert/strict";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { chromium, type Page } from "playwright-core";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import sharp from "sharp";
import { browserPath } from "../server/render";
import {
  defaultSettings,
  previewProps,
  totalFrames,
  type ReportData,
} from "../src/domain";
import type { MediaItem } from "../src/media";
import { LogoCatalog } from "../server/logo-catalog";

const root = process.cwd();
const isolated = await mkdtemp(path.join(os.tmpdir(), "matchcut-media-smoke-"));
const folder = path.join(root, "output/verification/media");
await mkdir(folder, { recursive: true });
await mkdir(path.join(isolated, "data"));
await cp(
  path.join(root, "data/fixtures"),
  path.join(isolated, "data/fixtures"),
  { recursive: true },
);
await cp(path.join(root, "public"), path.join(isolated, "public"), {
  recursive: true,
});
// Fetch one real upstream image, then run all binding actions against an isolated cache.
const catalogSource = new LogoCatalog(root);
const catalogData = await catalogSource.list();
const catalogT1 = catalogData.logos.find(
  (logo) => logo.game === "lol" && logo.name === "t1",
)!;
const catalogImage = await catalogSource.image(catalogT1.sha);
await mkdir(path.join(isolated, "data/cache/logo-catalog/images"), {
  recursive: true,
});
await writeFile(
  path.join(isolated, "data/cache/logo-catalog/images", catalogT1.sha + ".png"),
  catalogImage,
);
const catalogKT = catalogData.logos.find(
  (logo) =>
    logo.game === "lol" &&
    logo.path === "league-of-legends/kt-rolster/kt-rolster-logo.png",
)!;
await writeFile(
  path.join(isolated, "data/cache/logo-catalog/images", catalogKT.sha + ".png"),
  await catalogSource.image(catalogKT.sha),
);
await symlink(path.join(root, "dist"), path.join(isolated, "dist"));
const port = 4318;
const base = `http://127.0.0.1:${port}`;
const server = spawn(
  path.join(root, "node_modules/.bin/tsx"),
  [path.join(root, "server/index.ts")],
  {
    cwd: isolated,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let serverLog = "";
server.stdout.on("data", (data) => {
  serverLog += data;
});
server.stderr.on("data", (data) => {
  serverLog += data;
});
const browserExecutable = await browserPath();
const browser = await chromium.launch({ executablePath: browserExecutable });
const page = await browser.newPage({ viewport: { width: 1512, height: 1080 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript("window.__name = (value) => value;");
async function loaded() {
  await page.getByText("已保存", { exact: true }).waitFor();
}
async function api<T = any>(endpoint: string) {
  const response = await fetch(base + endpoint);
  assert.ok(response.ok, endpoint);
  return (await response.json()) as T;
}
async function checkOverflow(p: Page) {
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
}
try {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (server.exitCode !== null) throw new Error(serverLog);
    try {
      await api("/api/health");
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  assert.ok(serverLog.includes("Matchcut is ready"), serverLog);
  await page.goto(base + "/admin?game=lol", { waitUntil: "networkidle" });
  await page.getByLabel("搜索素材").fill("T1");
  await page.locator(".media-tile").filter({ hasText: /^T1/ }).click();
  assert.match(
    (await page.locator(".media-image-preview.logo img").getAttribute("src")) ||
      "",
    /lol-t1/,
  );
  const testImage = await readFile(
    path.join(root, "public/assets/teams/lol-t1.png"),
  );
  await page.getByLabel("上传战队图标", { exact: true }).setInputFiles({
    name: "test.png",
    mimeType: "image/png",
    buffer: testImage,
  });
  await loaded();
  const logo = await page
    .locator(".media-image-preview.logo img")
    .getAttribute("src");
  assert.match(logo!, /\/library\//);
  await page.getByLabel("战队别名").fill("T1 Test Alias");
  await page.getByRole("button", { name: "保存队名" }).click();
  await loaded();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("搜索素材").fill("T1 Test Alias");
  await page.locator(".media-tile").click();
  assert.equal(
    await page.locator(".media-image-preview.logo img").getAttribute("src"),
    logo,
  );
  await page.getByLabel("上传战队图标", { exact: true }).setInputFiles({
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await page.getByRole("alert").filter({ hasText: "无法读取图片" }).waitFor();
  assert.equal(
    await page.locator(".media-image-preview.logo img").getAttribute("src"),
    logo,
  );
  await page.getByRole("button", { name: "恢复默认战队图标" }).click();
  await loaded();
  assert.match(
    (await page.locator(".media-image-preview.logo img").getAttribute("src")) ||
      "",
    /lol-t1/,
  );
  await page.getByRole("button", { name: "新增战队" }).click();
  await page.getByLabel("新战队名称").fill("Smoke Test Club");
  await page.getByRole("button", { name: "创建战队" }).click();
  await loaded();
  assert.equal(
    await page.getByLabel("战队名称", { exact: true }).inputValue(),
    "Smoke Test Club",
  );
  await page.getByRole("button", { name: "从图标库选择", exact: true }).click();
  await page.getByLabel("搜索开源图标").fill("zzzzxqnomatchzzzz");
  await page
    .getByText("没有匹配结果，试试战队简称或「查看全部」。", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "绑定到当前战队", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByLabel("搜索开源图标").fill("T1");
  await page
    .locator(".logo-candidate")
    .filter({ has: page.getByText("t1", { exact: true }) })
    .click();
  await page.locator(".logo-binding-preview img").waitFor();
  await page.screenshot({ path: folder + "/logo-picker.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await checkOverflow(page);
  await page.screenshot({
    path: folder + "/logo-picker-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1512, height: 1080 });
  await page
    .getByRole("button", { name: "绑定到当前战队", exact: true })
    .click();
  await page.getByText("图标已绑定", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("战队名称", { exact: true }).inputValue(),
    "Smoke Test Club",
  );
  await page.getByRole("link", { name: "已绑定：t1", exact: true }).waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("搜索素材").fill("Smoke Test Club");
  await page.locator(".media-tile").click();
  await page.getByRole("link", { name: "已绑定：t1", exact: true }).waitFor();
  assert.match(
    (await page.locator(".media-image-preview.logo img").getAttribute("src")) ||
      "",
    /\/library\//,
  );
  await page.getByRole("button", { name: "新增战队" }).click();
  await page.getByLabel("新战队名称").fill("kT RoLsTeR");
  await page.getByRole("button", { name: "创建战队" }).click();
  await loaded();
  await page
    .getByRole("link", { name: "自动匹配：kt rolster", exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".media-image-preview.logo img").getAttribute("src"),
    "/api/logo-catalog/image/" + catalogKT.sha,
  );
  await page.getByLabel("搜索素材").fill("kT RoLsTeR");
  assert.match(await page.locator(".media-tile").innerText(), /自动匹配/);
  await page.screenshot({
    path: folder + "/automatic-logo.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: /英雄图片/ }).click();
  await page.getByLabel("搜索素材").fill("Aatrox");
  await page.locator(".media-tile").click();
  const portrait = await readFile(
    path.join(root, "public/assets/lol/Aatrox.png"),
  );
  await page.getByLabel("上传英雄头像", { exact: true }).setInputFiles({
    name: "portrait.png",
    mimeType: "image/png",
    buffer: portrait,
  });
  await loaded();
  assert.match(
    (await page
      .locator(".media-image-preview.portrait img")
      .getAttribute("src")) || "",
    /\/library\//,
  );
  const artwork = await readFile(
    path.join(root, "public/assets/lol/Aatrox.jpg"),
  );
  await page.getByLabel("上传英雄立绘", { exact: true }).setInputFiles({
    name: "artwork.jpg",
    mimeType: "image/jpeg",
    buffer: artwork,
  });
  await loaded();
  assert.match(
    (await page
      .locator(".media-image-preview.artwork img")
      .getAttribute("src")) || "",
    /\/library\//,
  );
  await page.screenshot({ path: folder + "/admin-heroes.png", fullPage: true });
  await page.getByRole("tab", { name: /战队图标/ }).click();
  await page.getByLabel("搜索素材").fill("T1");
  await page.locator(".media-tile").click();
  await page.getByLabel("上传战队图标", { exact: true }).setInputFiles({
    name: "final-logo.png",
    mimeType: "image/png",
    buffer: testImage,
  });
  await loaded();
  await page.getByRole("button", { name: "从图标库选择", exact: true }).click();
  await page
    .locator(".logo-candidate")
    .filter({ has: page.getByText("t1", { exact: true }) })
    .click();
  await page
    .getByRole("button", { name: "绑定到当前战队", exact: true })
    .click();
  await page.getByText("图标已绑定", { exact: true }).waitFor();
  await page.getByLabel("搜索素材").fill("");
  await page.waitForTimeout(250);
  await page.screenshot({ path: folder + "/admin-teams.png", fullPage: true });
  await checkOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await checkOverflow(page);
  await page.screenshot({ path: folder + "/admin-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1512, height: 1080 });
  await page.getByRole("button", { name: "Dota 2", exact: true }).click();
  await page
    .locator(".media-tile")
    .filter({ hasText: "Aurora Gaming" })
    .waitFor();
  assert.equal(
    await page.locator(".game-switch button.selected").innerText(),
    "Dota 2",
  );
  for (const [name, endpoint] of [
    ["dota", "/api/matches/9035078952"],
    ["lol", "/api/matches/lol-LOLTMNT02_76144"],
    ["series", "/api/lol/series/lol-LOLTMNT02_76144"],
  ]) {
    const { match } = await api<{ match: ReportData }>(endpoint);
    assert.ok(match.radiantLogo && match.direLogo);
    if (match.game === "lol")
      assert.match(
        match[match.radiant === "T1" ? "radiantLogo" : "direLogo"]!,
        /\/library\//,
      );
    const settings = {
      ...defaultSettings(match),
      theme: "obsidian" as const,
      accent: "#f6c453",
      secondary: "#c4d0e4",
    };
    const props = previewProps(match, settings);
    await page.route("**/api/bootstrap?*", (route) =>
      route.fulfill({
        json: { match, settings, preferences: null, jobs: [], bgmTracks: [] },
      }),
    );
    await page.goto(base + "/?game=" + (match.game || "dota2"), {
      waitUntil: "networkidle",
    });
    const bar = page.locator('.player-shell [style*="touch-action: none"]');
    const box = await bar.boundingBox();
    assert.ok(box);
    await bar.click({
      position: {
        x: (150 / (totalFrames(props.segments) - 1)) * box.width,
        y: box.height / 2,
      },
    });
    await page.locator("[data-team-logo] img").first().waitFor();
    assert.equal(await page.locator("[data-team-logo] img").count(), 2);
    assert.equal(await page.locator("[data-hero-art]").count(), 0);
    assert.equal(
      await page
        .locator("[data-team-logo] img")
        .evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
        ),
      true,
    );
    await page
      .locator(".player-shell")
      .screenshot({ path: `${folder}/${name}-opening-preview.png` });
    await page.unroute("**/api/bootstrap?*");
    if (process.argv.includes("--render")) {
      const serveUrl = await bundle({
        entryPoint: path.join(root, "src/video/index.tsx"),
        outDir: path.join(isolated, ".bundle"),
        publicDir: path.join(isolated, "public"),
      });
      const composition = await selectComposition({
        serveUrl,
        id: "MatchFilm",
        inputProps: props,
        browserExecutable,
      });
      const output = `${folder}/${name}-opening.png`;
      await renderStill({
        serveUrl,
        composition,
        inputProps: props,
        frame: 150,
        output,
        imageFormat: "png",
        browserExecutable,
      });
      const stats = await sharp(output).stats();
      assert.ok(stats.channels.some((channel) => channel.stdev > 20));
    }
  }
  const library = await api<MediaItem[]>("/api/media?game=lol");
  assert.ok(
    library
      .find((item) => item.name === "Aatrox")
      ?.overrides.includes("artwork"),
  );
  assert.deepEqual(errors, []);
  console.log(
    "Media admin uploads, catalog search/binding, persistence, reset, invalid files, mobile layout and three opening scenes passed. Isolated data only.",
  );
} catch (error) {
  await page.screenshot({ path: folder + "/failure.png", fullPage: true });
  console.error(await page.locator("body").innerText());
  throw error;
} finally {
  await browser.close();
  server.kill("SIGTERM");
  if (server.exitCode === null) await once(server, "exit");
  await rm(isolated, { recursive: true, force: true });
}
