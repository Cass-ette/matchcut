import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { defaultSettings } from "../src/domain";
import { isActiveJob } from "../src/job-status";
import type { Job } from "../server/render";

const base = "http://127.0.0.1:4317";
async function request(url: string, method = "GET", body?: unknown) {
  const response = await fetch(base + url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  return { status: response.status, data: await response.json() };
}
assert.ok(
  !(await request("/api/jobs")).data.some((job: Job) =>
    isActiveJob(job.status),
  ),
  "An actual user render is active; skipped without touching it.",
);
const { data } = await request("/api/matches/lol-LOLTMNT02_76144");
const body = {
  source: "current",
  matchId: data.match.id,
  settings: {
    ...defaultSettings(data.match),
    resolution: "720",
    pace: "snappy",
    radarPosition: "3",
  },
};
const created = await request("/api/jobs", "POST", body);
assert.equal(created.status, 202);
const id = created.data.id;
async function until(check: (job: Job) => boolean) {
  const end = Date.now() + 60_000;
  while (Date.now() < end) {
    const { data: job } = await request("/api/jobs/" + id);
    if (check(job)) return job as Job;
    assert.notEqual(job.status, "error", job.error);
    await delay(100);
  }
  throw new Error("Job API timed out");
}
async function action(name: string) {
  const result = await request(`/api/jobs/${id}/${name}`, "POST");
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data as Job;
}
try {
  await action("pause");
  await until((job) => job.status === "paused");
  assert.equal(
    (await request("/api/jobs", "POST", body)).status,
    409,
    "paused job must retain its render slot",
  );
  await action("resume");
  await until((job) => (job.renderProgress?.renderedFrames ?? 0) > 0);
  await action("pause");
  const paused = await until((job) => job.status === "paused");
  await delay(1000);
  const after = (await request("/api/jobs/" + id)).data;
  assert.deepEqual(after.renderProgress, paused.renderProgress);
  await action("cancel");
  const stopped = await until((job) => job.status === "cancelled");
  assert.ok(stopped.props, "settings must be preserved");
  assert.equal(
    stopped.files,
    undefined,
    "stopped task must not advertise an unfinished video",
  );
  assert.equal((await request(`/api/jobs/${id}/resume`, "POST")).status, 409);
  // Waiting for the atomic final snapshot also verifies persistence of cancellation.
  await delay(200);
  assert.equal(
    JSON.parse(await readFile(`output/${id}/job.json`, "utf8")).status,
    "cancelled",
  );
  console.log(
    `Job API verified: preparation pause, render pause, resume, cancel while paused, slot reservation, terminal rejection and saved settings (${id}).`,
  );
} finally {
  const { data: job } = await request("/api/jobs/" + id);
  if (isActiveJob(job.status)) await action("cancel");
}
