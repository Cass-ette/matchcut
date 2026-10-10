import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { browserPath } from "../server/browser";
import { defaultSettings, previewProps, type ReportData } from "../src/domain";

const base = "http://127.0.0.1:4317";
const response = await fetch(base + "/api/lol/full/lol-LOLTMNT02_76144");
assert.ok(response.ok);
const { match }: { match: ReportData } = await response.json();
const settings = defaultSettings(match);
const legacy = JSON.parse(JSON.stringify(settings));
delete legacy.mvp;
const legacyProps = JSON.parse(JSON.stringify(previewProps(match, settings)));
delete legacyProps.settings.mvp;
for (const chapter of legacyProps.chapters) delete chapter.settings.mvp;
const browser = await chromium.launch({ executablePath: await browserPath() });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/bootstrap?*", (route) =>
    route.fulfill({
      json: {
        match,
        settings: legacy,
        preferences: null,
        jobs: [],
        bgmTracks: [],
      },
    }),
  );
  await page.route("**/api/preferences?*", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  const job = {
    id: "legacy-settings-smoke",
    status: "preparing",
    progress: 1,
    message: "校验比赛数据",
    createdAt: new Date().toISOString(),
  };
  await page.route("**/api/jobs", (route) => {
    assert.equal(route.request().method(), "POST");
    assert.deepEqual(route.request().postDataJSON().settings.mvp, {
      enabled: false,
      mode: "auto",
      manual: {},
    });
    return route.fulfill({ status: 202, json: job });
  });
  await page.route("**/api/jobs/legacy-settings-smoke", (route) =>
    route.fulfill({
      json: {
        ...job,
        status: "error",
        progress: 20,
        props: legacyProps,
        error: "模拟旧版任务失败",
      },
    }),
  );
  await page.goto(base + "/?game=lol", { waitUntil: "networkidle" });
  await page.locator("[data-match-film]").waitFor();
  assert.equal(
    await page.getByRole("checkbox", { name: /MVP 展示/ }).isChecked(),
    false,
  );
  await page.getByRole("button", { name: "一键生成视频", exact: true }).click();
  await page.getByText("模拟旧版任务失败", { exact: true }).waitFor();
  assert.equal(await page.locator("[data-match-film]").count(), 1);
  assert.equal(
    await page.getByRole("checkbox", { name: /MVP 展示/ }).isChecked(),
    false,
  );
  assert.ok(
    await page
      .getByRole("button", { name: "一键生成视频", exact: true })
      .isEnabled(),
  );
  await page.getByRole("checkbox", { name: /MVP 展示/ }).check();
  assert.equal(
    await page.getByRole("checkbox", { name: /MVP 展示/ }).isChecked(),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Legacy bootstrap and render-job settings keep the workspace usable; no saved preferences or real jobs changed.",
  );
} finally {
  await browser.close();
}
