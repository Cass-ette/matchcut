import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
const base = "http://127.0.0.1:4317";
async function api(url: string, options?: RequestInit) {
  const r = await fetch(base + url, {
    ...options,
    headers: { "Content-Type": "application/json" },
  });
  const body = await r.json();
  assert.ok(r.ok, body.error || String(r.status));
  return body;
}
const defaults = await api("/api/bootstrap");
const followed = await api("/api/latest?team=9467224");
assert.ok(
  followed.match.radiantId === 9467224 || followed.match.direId === 9467224,
  "team filter is not respected",
);
const missing = await fetch(base + "/api/latest?team=999999999999");
assert.equal(missing.status, 422);
const settings = {
  ...defaults.settings,
  resolution: "720",
  theme: "glacier",
  accent: "#6dc9ff",
  secondary: "#e2bd72",
  headline: "旧比赛标题不应混入",
  scripts: Array(5).fill("旧比赛文案不应混入"),
};
let job = await api("/api/jobs", {
  method: "POST",
  body: JSON.stringify({
    matchId: defaults.match.id,
    settings,
    source: "latest",
  }),
});
console.log("Latest-match job:", job.id);
const started = Date.now();
let bucket = -1;
while (!["done", "error"].includes(job.status)) {
  if (Date.now() - started > 900000) throw new Error("Timed out");
  await new Promise((r) => setTimeout(r, 2000));
  job = await api("/api/jobs/" + job.id);
  const next = Math.floor(job.progress / 20);
  if (next !== bucket) {
    bucket = next;
    console.log(job.progress + "% " + job.message);
  }
}
assert.equal(job.status, "done", job.error);
assert.notEqual(job.props.settings.headline, settings.headline);
assert.ok(
  job.props.settings.scripts.every((s: string) => !s.includes("旧比赛文案")),
);
assert.equal(job.props.settings.theme, "glacier");
assert.equal(job.props.match.players.length, 10);
const metadata = JSON.parse(
  execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_streams",
      "-of",
      "json",
      path.join(process.cwd(), job.files["matchcut.mp4"]),
    ],
    { encoding: "utf8" },
  ),
);
assert.equal(metadata.streams.length, 1);
assert.equal(metadata.streams[0].codec_type, "video");
assert.equal(metadata.streams[0].width, 1280);
assert.equal(metadata.streams[0].height, 720);
await mkdir("output/verification", { recursive: true });
await writeFile(
  "output/verification/live-job.json",
  JSON.stringify(job, null, 2),
);
console.log(
  "Live source, team filter, missing-data handling, refreshed copy and 720p export passed:",
  job.files["matchcut.mp4"],
);
