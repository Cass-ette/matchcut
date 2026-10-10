import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { RenderCancelled, RenderControl } from "../server/render-control";
import type { Job } from "../server/render";

const job = (): Job => ({
  id: "controls",
  status: "rendering",
  message: "渲染中",
  progress: 40,
  createdAt: new Date().toISOString(),
  warnings: [],
});
async function until(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await delay(5);
  }
  assert.fail("control state did not settle");
}

test("pause cancels active work and resume retries only the interrupted operation", async () => {
  const current = job();
  const control = new RenderControl(current, async () => {});
  let attempts = 0,
    interruptions = 0;
  const task = control.run(
    (signal) => {
      attempts++;
      if (attempts > 1) return Promise.resolve("completed");
      return new Promise<string>((_, reject) =>
        signal(() => reject(new Error("cancelled"))),
      );
    },
    () => {
      interruptions++;
    },
  );
  await until(() => attempts === 1);
  await control.pause();
  await until(() => current.status === "paused");
  await delay(20);
  assert.equal(attempts, 1);
  assert.equal(interruptions, 1);
  await control.resume();
  assert.equal(await task, "completed");
  assert.equal(attempts, 2);
  assert.equal(current.status, "rendering");
});

test("stop works during an active operation and while paused; it never retries", async () => {
  for (const paused of [false, true]) {
    const current = job();
    const control = new RenderControl(current, async () => {});
    let attempts = 0;
    const task = control.run((signal) => {
      attempts++;
      return new Promise((_, reject) =>
        signal(() => reject(new Error("cancelled"))),
      );
    });
    const rejected = assert.rejects(task, RenderCancelled);
    await until(() => attempts === 1);
    if (paused) {
      await control.pause();
      await until(() => current.status === "paused");
    }
    await control.cancel();
    await rejected;
    assert.equal(attempts, 1);
    assert.equal(current.status, "cancelling");
  }
});

test("a resume arriving while the paused snapshot is saving cannot lose its wakeup", async () => {
  const current = job();
  let release: () => void = () => {};
  const saving = new Promise<void>((resolve) => {
    release = resolve;
  });
  const control = new RenderControl(current, () =>
    current.status === "paused" ? saving : Promise.resolve(),
  );
  await control.pause();
  const checkpoint = control.checkpoint();
  await control.resume();
  release();
  await checkpoint;
  assert.equal(current.status, "rendering");
});

test("preparation waits for its current step, then pauses before rendering; failures remain failures", async () => {
  const current: Job = { ...job(), status: "preparing" };
  const control = new RenderControl(current, async () => {});
  let release: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const task = control.run(() => waiting).then(() => control.checkpoint());
  await delay(0);
  await control.pause();
  assert.equal(current.status, "pausing");
  release();
  await until(() => current.status === "paused");
  await control.resume();
  await task;
  assert.equal(current.status, "preparing");
  await assert.rejects(
    control.run(async () => {
      throw new Error("real failure");
    }),
    /real failure/,
  );
});
