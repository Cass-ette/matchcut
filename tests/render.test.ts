import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { renderConcurrency } from "../server/render";

test("4K defaults to one rendering tab; explicit concurrency remains bounded by available CPUs", () => {
  const previous = process.env.MATCHCUT_RENDER_CONCURRENCY;
  try {
    delete process.env.MATCHCUT_RENDER_CONCURRENCY;
    assert.equal(renderConcurrency("2160"), 1);
    assert.equal(
      renderConcurrency("1080"),
      Math.min(2, Math.max(1, os.cpus().length - 1)),
    );
    process.env.MATCHCUT_RENDER_CONCURRENCY = "invalid";
    assert.equal(renderConcurrency("2160"), 1);
    process.env.MATCHCUT_RENDER_CONCURRENCY = "2";
    assert.equal(
      renderConcurrency("2160"),
      Math.min(2, Math.max(1, os.cpus().length - 1)),
    );
    process.env.MATCHCUT_RENDER_CONCURRENCY = "999";
    assert.equal(renderConcurrency("2160"), Math.max(1, os.cpus().length - 1));
  } finally {
    if (previous === undefined) delete process.env.MATCHCUT_RENDER_CONCURRENCY;
    else process.env.MATCHCUT_RENDER_CONCURRENCY = previous;
  }
});
