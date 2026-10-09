import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { Thumbnails } from "../server/thumbnails";
import type { MediaItem } from "../src/media";

const item = (src: string): MediaItem => ({
  id: "photo",
  game: "lol",
  kind: "player",
  name: "Player",
  aliases: [],
  images: { artwork: src },
  defaults: {},
  overrides: [],
});
test("thumbnails preserve alpha/aspect, reuse disk cache across restarts and invalidate edited originals", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "matchcut-thumbnails-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "public/assets"), { recursive: true });
  const file = path.join(root, "public/assets/photo.png");
  const original = await sharp({
    create: {
      width: 800,
      height: 1200,
      channels: 4,
      background: { r: 180, g: 10, b: 60, alpha: 0.4 },
    },
  })
    .png()
    .toBuffer();
  await writeFile(file, original);
  const thumbnails = new Thumbnails(root, async () => {
    throw new Error("unexpected network");
  });
  const photo = item("/assets/photo.png");
  const results = await Promise.all(
    Array.from({ length: 12 }, () => thumbnails.image(photo)),
  );
  const first = results[0]!;
  for (const result of results) assert.deepEqual(result, first);
  const meta = await sharp(first).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.height, 320);
  assert.equal(meta.width, 213);
  assert.equal(meta.hasAlpha, true);
  assert.deepEqual(await readFile(file), original);
  assert.equal(
    (await readdir(path.join(root, "data/cache/thumbnails"))).length,
    1,
  );
  assert.deepEqual(
    await new Thumbnails(root, async () => Buffer.alloc(0)).image(photo),
    first,
  );
  await writeFile(
    file,
    await sharp({
      create: { width: 40, height: 30, channels: 4, background: "blue" },
    })
      .png()
      .toBuffer(),
  );
  const changed = await thumbnails.image(photo);
  assert.notDeepEqual(changed, first);
  assert.equal((await sharp(changed).metadata()).width, 40);
  assert.equal(
    (await readdir(path.join(root, "data/cache/thumbnails"))).length,
    2,
  );
  assert.equal(await thumbnails.image(item("/assets/missing.png")), undefined);
  await writeFile(path.join(root, "private.png"), original);
  await symlink(
    path.join(root, "private.png"),
    path.join(root, "public/assets/escape.png"),
  );
  await assert.rejects(thumbnails.image(item("/assets/escape.png")), /路径/);
  await assert.rejects(
    thumbnails.image(item("/assets/../../private.png")),
    /路径/,
  );
  await assert.rejects(
    thumbnails.image(item("https://example.com/private.png")),
    /路径/,
  );
});

test("catalog thumbnails share downloads and honor concurrency limits", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "matchcut-catalog-thumbs-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const png = await sharp({
    create: { width: 512, height: 512, channels: 4, background: "red" },
  })
    .png()
    .toBuffer();
  let active = 0,
    peak = 0,
    calls = 0;
  const thumbnails = new Thumbnails(root, async () => {
    calls++;
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, 15));
    active--;
    return png;
  });
  const images = Array.from({ length: 8 }, (_, i) =>
    item(`/api/logo-catalog/image/${String(i).repeat(40)}`),
  );
  await Promise.all(
    [...images, ...images].map((image) => thumbnails.image(image)),
  );
  assert.equal(calls, 8);
  assert.ok(peak <= 4);
  await new Thumbnails(root, async () => {
    throw new Error("cache miss");
  }).image(images[0]);
});
