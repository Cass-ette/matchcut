import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { jobWriter, restoreJobs } from "../server/job-store";
import type { Job } from "../server/render";

test("restart persists interrupted jobs without losing settings, while completed jobs remain unchanged", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "matchcut-jobs-"));
  try {
    const job: Job = {
      id: "interrupted",
      status: "rendering",
      progress: 76,
      message: "渲染视频画面",
      createdAt: "2026-10-10T14:23:57.080Z",
      warnings: [],
      width: 3840,
      height: 2160,
      props: {
        settings: {
          resolution: "2160",
          mvp: { enabled: true, mode: "manual", manual: { game1: 131 } },
          scripts: ["原文案"],
        },
      } as unknown as Job["props"],
    };
    await jobWriter(path.join(output, job.id), job)();
    const done: Job = {
      ...job,
      id: "done",
      status: "done",
      progress: 100,
      files: { "matchcut.mp4": "/output/done/matchcut.mp4" },
    };
    await jobWriter(path.join(output, done.id), done)();
    const jobs = await restoreJobs(output);
    assert.equal(jobs.get(job.id)?.status, "error");
    assert.match(jobs.get(job.id)!.error!, /生成已中断/);
    const saved = JSON.parse(
      await readFile(path.join(output, job.id, "job.json"), "utf8"),
    );
    assert.equal(saved.status, "error");
    assert.equal(saved.progress, 76);
    assert.deepEqual(saved.props, job.props);
    assert.equal(saved.width, 3840);
    assert.deepEqual(jobs.get(done.id), done);
    const again = await restoreJobs(output);
    assert.deepEqual(again.get(job.id), saved);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("progress writes are serialized and the final state wins", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "matchcut-progress-"));
  try {
    const job: Job = {
      id: "job",
      status: "rendering",
      progress: 20,
      message: "渲染画面",
      createdAt: new Date().toISOString(),
      warnings: [],
    };
    const update = jobWriter(output, job);
    const first = update();
    job.progress = 76;
    const second = update();
    job.status = "done";
    job.progress = 100;
    await update();
    await Promise.all([first, second]);
    const saved = JSON.parse(
      await readFile(path.join(output, "job.json"), "utf8"),
    );
    assert.equal(saved.status, "done");
    assert.equal(saved.progress, 100);
    assert.ok(saved.updatedAt);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
