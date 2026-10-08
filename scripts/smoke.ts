import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { browserPath } from "../server/render";

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
  await page.getByRole("button", { name: /夜场橙/ }).click();
  await page.screenshot({ path: folder + "/workspace.png", fullPage: true });
  await page.getByRole("button", { name: /纸上比赛/ }).click();
  await page.screenshot({
    path: folder + "/paper-template.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /夜场橙/ }).click();
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
