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
import { request as httpRequest } from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { browserPath } from "../server/render";

const root = process.cwd();
const isolated = await mkdtemp(
  path.join(os.tmpdir(), "matchcut-modules-smoke-"),
);
const folder = path.join(root, "output/verification/modules");
await mkdir(folder, { recursive: true });
await cp(
  path.join(root, "data/fixtures"),
  path.join(isolated, "data/fixtures"),
  { recursive: true },
);
await cp(path.join(root, "public"), path.join(isolated, "public"), {
  recursive: true,
});
await mkdir(path.join(isolated, "data/cache/cs"), { recursive: true });
await writeFile(
  path.join(isolated, "data/cache/cs/keep-me.txt"),
  "retained match archive",
);
await symlink(path.join(root, "dist"), path.join(isolated, "dist"));
const base = "http://127.0.0.1:4321";
const server = spawn(
  path.join(root, "node_modules/.bin/tsx"),
  [path.join(root, "server/index.ts")],
  {
    cwd: isolated,
    env: { ...process.env, PORT: "4321" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
server.stdout.on("data", (d) => (logs += d));
server.stderr.on("data", (d) => (logs += d));
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  for (let n = 0; n < 80; n++) {
    if (server.exitCode !== null) throw new Error(logs);
    try {
      if ((await fetch(base + "/api/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: await browserPath() });
  // A slow CSV upload must hold the same reservation as its eventual parser.
  const upload = httpRequest(base + "/api/lol/import", {
    method: "POST",
    headers: { "Content-Type": "text/csv", "Content-Length": "100" },
  });
  upload.on("error", () => {});
  upload.write("pending");
  for (let n = 0; n < 30; n++) {
    if ((await (await fetch(base + "/api/modules")).json()).busyReason) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  const blocked = await fetch(base + "/api/modules/lol", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "hide" }),
  });
  assert.equal(blocked.status, 422);
  const uploadClosed = new Promise(resolve => upload.once("close", resolve));
  upload.destroy();
  await uploadClosed;
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "/games");
  await page.getByRole("heading", { name: "只留下你需要的游戏。" }).waitFor();
  assert.equal(await page.locator(".module-card").count(), 3);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(folder, "desktop.png"),
    fullPage: true,
  });
  const card = (label: string) =>
    page
      .locator(".module-card")
      .filter({ has: page.getByRole("heading", { name: label, exact: true }) });
  for (const label of ["Dota 2", "英雄联盟", "CS"]) {
    await card(label)
      .getByRole("button", { name: "隐藏", exact: true })
      .click();
    await card(label).getByText("已隐藏", { exact: true }).waitFor();
  }
  assert.equal((await fetch(base + "/api/lol/matches")).status, 409);
  assert.equal(
    (await (await fetch(base + "/api/bootstrap?game=lol")).json()).match,
    null,
  );
  await page.goto(base + "/?game=lol");
  await page.getByText("启用一个游戏，即可返回视频工作台。").waitFor();
  await card("英雄联盟")
    .getByRole("button", { name: "启用", exact: true })
    .click();
  await card("英雄联盟").getByText("已启用", { exact: true }).waitFor();
  await page.goto(base + "/admin?game=cs2");
  await page.locator(".media-tile").first().waitFor();
  assert.equal(await page.locator(".game-switch button").count(), 1);
  assert.equal(
    await page.locator(".game-switch button").innerText(),
    "英雄联盟",
  );
  await page.goto(base + "/?game=cs2");
  await page.locator(".workspace").waitFor({ timeout: 30_000 });
  assert.equal(await page.locator(".game-switch button").count(), 1);
  await page.getByRole("link", { name: "游戏管理", exact: true }).click();
  await card("CS").getByRole("button", { name: "移除", exact: true }).click();
  assert.equal(
    await page
      .getByRole("checkbox", { name: "保留比赛记录和自定义资料" })
      .isChecked(),
    true,
  );
  await page.getByRole("button", { name: "确认移除", exact: true }).click();
  await card("CS").getByText("未安装", { exact: true }).waitFor();
  await assert.rejects(
    readFile(path.join(isolated, "public/assets/cs/maps/nuke.png")),
    { code: "ENOENT" },
  );
  assert.equal(
    await readFile(path.join(isolated, "data/cache/cs/keep-me.txt"), "utf8"),
    "retained match archive",
  );
  await card("CS").getByRole("button", { name: "下载并启用" }).click();
  for (let n = 0; n < 240; n++) {
    const state = await (await fetch(base + "/api/modules")).json();
    const cs = state.modules.find((m: { game: string }) => m.game === "cs2");
    assert.equal(cs.error, undefined, JSON.stringify(cs));
    if (cs.installed && !cs.operation) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await card("CS")
    .getByText("素材版本 0.6.0", { exact: true })
    .waitFor({ timeout: 120_000 });
  assert.equal(
    await card("CS").getByText("已启用", { exact: true }).count(),
    1,
  );
  assert.deepEqual(
    await readFile(path.join(isolated, "public/assets/cs/maps/nuke.png")),
    await readFile(path.join(root, "public/assets/cs/maps/nuke.png")),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: path.join(folder, "mobile.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: game management UI, all-hidden recovery, scoped removal, retained data, disabled API, selectors and real GitHub pack installation.",
  );
} catch (error) {
  try {
    console.error(
      "Modules:",
      await (await fetch(base + "/api/modules")).json(),
    );
  } catch {}
  console.error(logs.slice(-2500));
  throw error;
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    await once(server, "exit");
  }
  await rm(isolated, { recursive: true, force: true });
}
