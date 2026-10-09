import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Page } from "playwright-core";
import { browserPath } from "../server/render";

const output = "output/design-study/verification";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: await browserPath() });
const errors: string[] = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => {
  if (response.status() >= 400)
    errors.push(`${response.status()} ${response.url()}`);
});
const videoState = () =>
  page.locator("video").evaluateAll((elements) =>
    elements.map((element) => {
      const video = element as HTMLVideoElement;
      return {
        time: video.currentTime,
        paused: video.paused,
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
      };
    }),
  );
async function seek(target: Page, id: string, time: number) {
  await target.locator(id).evaluate(async (element, value) => {
    const video = element as HTMLVideoElement;
    video.pause();
    if (Math.abs(video.currentTime - value) < 0.01 && video.readyState >= 2)
      return;
    await new Promise<void>((resolve) => {
      video.requestVideoFrameCallback(() => resolve());
      video.currentTime = value;
    });
  }, time);
}
try {
  await page.goto("http://127.0.0.1:4317/output/design-study/", {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() =>
    [...document.querySelectorAll("video")].every(
      (video) => video.readyState >= 2,
    ),
  );
  for (const state of await videoState()) {
    assert.equal(state.width, 1920);
    assert.equal(state.height, 1080);
    assert.equal(state.duration, 25);
  }
  const fingerprints: number[] = [];
  for (const time of [0.8, 7.5, 13.5, 19, 24]) {
    await seek(page, "#new-video", time);
    const pixels = await page.locator("#new-video").evaluate((element) => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      const context = canvas.getContext("2d")!;
      context.drawImage(element as HTMLVideoElement, 0, 0, 320, 180);
      const data = context.getImageData(0, 0, 320, 180).data;
      let lit = 0,
        sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (brightness > 90) lit++;
        sum += brightness;
      }
      return { lit, sum };
    });
    assert.ok(pixels.lit > 800, `Blank video frame at ${time}s`);
    fingerprints.push(pixels.sum);
  }
  assert.ok(
    new Set(fingerprints).size > 3,
    "The video must contain changing scenes",
  );
  await seek(page, "#new-video", 9.5);
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
  await page.getByRole("button", { name: "现版", exact: true }).click();
  assert.equal(await page.locator("#new-figure").isVisible(), false);
  assert.ok(Math.abs((await videoState())[1].time - 9.5) < 0.15);
  await page.locator("#play").click();
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLVideoElement>("#current-video")!.currentTime >
      10,
  );
  await page.getByRole("button", { name: "并排", exact: true }).click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("video")].every(
      (video) => !video.paused && video.currentTime > 10.2,
    ),
  );
  let states = await videoState();
  assert.ok(Math.abs(states[0].time - states[1].time) < 0.2);
  await page.locator("#play").click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("video")].every((video) => video.paused),
  );
  await seek(page, "#current-video", 19);
  await page.waitForFunction(
    () =>
      Math.abs(
        document.querySelector<HTMLVideoElement>("#new-video")!.currentTime -
          19,
      ) < 0.15,
  );
  await page.screenshot({ path: `${output}/desktop-pair.png`, fullPage: true });
  await page.getByRole("button", { name: "从头播放", exact: true }).click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("video")].every(
      (video) => !video.paused && video.currentTime < 2,
    ),
  );
  await page.locator("#play").click();
  await seek(page, "#new-video", 13.5);
  await page.waitForFunction(
    () =>
      Math.abs(
        document.querySelector<HTMLVideoElement>("#current-video")!
          .currentTime - 13.5,
      ) < 0.15,
  );
  for (const width of [390, 768, 1920]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
    for (const mode of ["new", "current", "pair"]) {
      await page.locator(`[data-mode="${mode}"]`).click();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `Overflow at ${width}/${mode}`,
      );
      assert.ok(
        await page
          .locator("button")
          .evaluateAll((buttons) =>
            buttons.every(
              (button) => button.scrollWidth <= button.clientWidth + 1,
            ),
          ),
        `Clipped buttons at ${width}/${mode}`,
      );
      if (width === 390)
        await page.screenshot({
          path: `${output}/mobile-${mode}.png`,
          fullPage: true,
        });
    }
  }
  assert.equal(await page.locator("#error").textContent(), "");
  assert.deepEqual(errors, []);
  states = await videoState();
  await writeFile(
    `${output}/checks.json`,
    JSON.stringify(
      {
        video: states,
        fingerprints,
        errors,
        checks: [
          "decoded video frames",
          "1920x1080, 25 seconds",
          "version switching",
          "synchronized play/pause/seek/replay",
          "390/768/1920 layout",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "Design study verified: decoded video, playback, synchronization, and responsive layouts.",
  );
} finally {
  await browser.close();
}
