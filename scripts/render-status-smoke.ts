import assert from "node:assert/strict";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
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
  // Preview a built UI before restarting an existing long-running render.
  const uiDir = process.argv
    .find((arg) => arg.startsWith("--ui-dir="))
    ?.slice(9);
  if (uiDir)
    await page.route(base + "/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const file = path.join(
        path.resolve(uiDir),
        pathname === "/" ? "index.html" : pathname,
      );
      try {
        await access(file);
      } catch {
        await route.fallback();
        return;
      }
      await route.fulfill({ path: file });
    });
  await page.route("**/api/bootstrap?*", (route) =>
    route.fulfill({
      json: { match, settings, preferences: null, jobs: [job], bgmTracks: [] },
    }),
  );
  await page.route("**/api/preferences?*", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  let phase:
    | "slow"
    | "offline"
    | "rendering"
    | "pausing"
    | "paused"
    | "cancelling"
    | "cancelled"
    | "done"
    | "error" = "slow";
  const jobState = () => ({
    ...job,
    status: phase,
    progress: 77,
    message:
      phase === "paused"
        ? "已暂停 · 已保存 9600 帧"
        : "渲染画面 10000 / 12673 帧",
  });
  await page.route("**/api/jobs/render-status-smoke/*", async (route) => {
    const action = route.request().url().split("/").at(-1);
    assert.equal(route.request().method(), "POST");
    if (action === "pause") phase = "pausing";
    else if (action === "resume") {
      assert.equal(phase, "paused");
      phase = "rendering";
    } else if (action === "cancel") phase = "cancelling";
    else assert.fail("unexpected control action");
    await route.fulfill({ json: jobState() });
  });
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
        ...jobState(),
        progress: phase === "done" ? 100 : 77,
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
  assert.ok(
    await page
      .getByRole("button", { name: "暂停任务", exact: true })
      .isDisabled(),
  );
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
  await page.getByRole("button", { name: "暂停任务", exact: true }).click();
  await page.getByRole("button", { name: "正在暂停", exact: true }).waitFor();
  assert.ok(
    await page
      .getByRole("button", { name: "暂停任务", exact: true })
      .isDisabled(),
  );
  phase = "paused";
  await page.getByRole("button", { name: "继续生成", exact: true }).waitFor();
  assert.equal(await page.locator(".generate-button .spin").count(), 0);
  await page.route("**/api/bootstrap?*", (route) =>
    route.fulfill({
      json: {
        match,
        settings,
        preferences: null,
        jobs: [jobState()],
        bgmTracks: [],
      },
    }),
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "继续生成", exact: true }).waitFor();
  await page.locator(".export-bar").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "output/verification/render-paused.png",
    fullPage: false,
  });
  await page.getByRole("button", { name: "继续生成", exact: true }).click();
  await page.getByRole("button", { name: "生成中 77%", exact: true }).waitFor();
  await page.getByRole("button", { name: "暂停任务", exact: true }).click();
  phase = "paused";
  await page.getByRole("button", { name: "继续生成", exact: true }).waitFor();
  await page.getByRole("button", { name: "停止任务", exact: true }).click();
  await page.getByRole("button", { name: "正在停止", exact: true }).waitFor();
  phase = "cancelled";
  await page
    .getByRole("button", { name: "一键生成视频", exact: true })
    .waitFor();
  assert.ok(
    await page
      .getByRole("button", { name: "一键生成视频", exact: true })
      .isEnabled(),
  );
  assert.equal(await page.locator(".job-controls").count(), 0);
  phase = "rendering";
  await page.getByRole("button", { name: "一键生成视频", exact: true }).click();
  await page.getByRole("button", { name: "生成中 77%", exact: true }).waitFor();
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
    "Render progress: pause/resume/stop, reload while paused, disconnect/reconnect, completion and backend restart recover correctly. No real jobs or preferences changed.",
  );
} finally {
  await browser.close();
}
