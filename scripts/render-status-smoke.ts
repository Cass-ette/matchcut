import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { browserPath } from "../server/browser";
import { defaultSettings, previewProps, type ReportData } from "../src/domain";

const base = "http://127.0.0.1:4317";
const response = await fetch(base + "/api/lol/full/lol-LOLTMNT02_76144");
assert.ok(response.ok);
const { match }: { match: ReportData } = await response.json();
const settings = defaultSettings(match);
settings.mvp = {
  enabled: true,
  mode: "manual",
  manual: { [match.id]: match.players[0].slot },
};
const props = previewProps(match, settings);
const job = {
  id: "render-status-smoke",
  status: "rendering",
  progress: 76,
  message: "渲染画面 9800 / 12673 帧",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  props,
};
const browser = await chromium.launch({ executablePath: await browserPath() });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/bootstrap?*", (route) =>
    route.fulfill({
      json: { match, settings, preferences: null, jobs: [job], bgmTracks: [] },
    }),
  );
  await page.route("**/api/preferences?*", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  let phase: "slow" | "offline" | "rendering" | "done" | "error" = "slow";
  let requests = 0;
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/jobs/render-status-smoke", async (route) => {
    requests++;
    if (phase === "slow") {
      await held;
      return route.fulfill({ json: job });
    }
    if (phase === "offline") return route.abort("connectionrefused");
    return route.fulfill({
      json: {
        ...job,
        status: phase,
        progress: phase === "done" ? 100 : 77,
        message: "渲染画面 10000 / 12673 帧",
        ...(phase === "done"
          ? { files: { "matchcut.mp4": "/output/smoke/matchcut.mp4" } }
          : {}),
        ...(phase === "error"
          ? {
              error: "上次后台服务已退出，生成已中断。设置已保留，请重新生成。",
            }
          : {}),
      },
    });
  });
  await page.route("**/api/jobs", (route) => {
    assert.equal(route.request().method(), "POST");
    assert.deepEqual(route.request().postDataJSON().settings.mvp, settings.mvp);
    return route.fulfill({ status: 202, json: job });
  });
  await page.goto(base + "/?game=lol", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "生成中 76%", exact: true }).waitFor();
  await page.waitForTimeout(1800);
  assert.equal(requests, 1, "slow progress requests must not overlap");
  assert.equal(
    await page
      .getByRole("link", { name: "下载比赛 CSV · Oracle’s Elixir" })
      .getAttribute("href"),
    "https://oracleselixir.com/tools/downloads",
  );
  phase = "offline";
  release();
  await page.getByRole("button", { name: "连接中断", exact: true }).waitFor();
  assert.equal(await page.locator(".generate-button .spin").count(), 0);
  assert.ok(await page.locator(".generate-button").isDisabled());
  assert.match(
    (await page.getByRole("progressbar").getAttribute("aria-valuetext")) || "",
    /最后进度 76%/,
  );
  await mkdir("output/verification", { recursive: true });
  await page.screenshot({
    path: "output/verification/render-disconnected.png",
    fullPage: true,
  });
  phase = "rendering";
  await page.getByRole("button", { name: "生成中 77%", exact: true }).waitFor();
  await page.getByText("渲染画面 10000 / 12673 帧", { exact: true }).waitFor();
  phase = "done";
  await page.getByText("成片已就绪", { exact: true }).waitFor();
  phase = "error";
  await page.getByRole("button", { name: "一键生成视频", exact: true }).click();
  await page
    .getByText("上次后台服务已退出，生成已中断。设置已保留，请重新生成。", {
      exact: true,
    })
    .waitFor();
  assert.ok(
    await page
      .getByRole("button", { name: "一键生成视频", exact: true })
      .isEnabled(),
  );
  assert.deepEqual(errors, []);
  console.log(
    "Render progress: slow requests do not overlap; disconnect/reconnect, completion and backend restart recover correctly. CSV download link is visible. No real jobs or preferences changed.",
  );
} finally {
  await browser.close();
}
