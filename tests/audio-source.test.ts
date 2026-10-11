import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

test("music imports retain embedded artwork and tags; legacy imports upgrade without retranscoding", async () => {
  const original = process.cwd();
  const folder = await mkdtemp(path.join(tmpdir(), "matchcut-audio-"));
  try {
    process.chdir(folder);
    const { importBgm, importBgmCover, loadBgm } =
      await import("../server/audio-source");
    const cover = await sharp({
      create: { width: 240, height: 180, channels: 3, background: "#347c99" },
    })
      .jpeg()
      .toBuffer();
    await writeFile("art.jpg", cover);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=1.2",
      "-i",
      "art.jpg",
      "-map",
      "0:a",
      "-map",
      "1:v",
      "-c:a",
      "libmp3lame",
      "-c:v",
      "copy",
      "-id3v2_version",
      "3",
      "-disposition:v",
      "attached_pic",
      "-metadata",
      "title=验证曲名",
      "-metadata",
      "artist=测试歌手",
      "music.mp3",
    ]);
    const content = await readFile("music.mp3");
    const [track, duplicate] = await Promise.all([
      importBgm(content, "original.mp3"),
      importBgm(content, "duplicate.mp3"),
    ]);
    assert.deepEqual(track, duplicate);
    assert.equal(track.title, "验证曲名");
    assert.equal(track.artist, "测试歌手");
    assert.ok(track.cover);
    const image = await sharp(
      path.join(folder, "public", track.cover),
    ).metadata();
    assert.equal(image.width, 512);
    assert.equal(image.height, 512);
    assert.equal(image.format, "jpeg");
    const metadataPath = `data/cache/bgm/${track.id}.json`;
    const audioPath = path.join(folder, "public", track.src);
    const before = await stat(audioPath);
    // Simulate the metadata of an existing pre-cover import.
    await writeFile(
      metadataPath,
      JSON.stringify({
        id: track.id,
        name: track.name,
        createdAt: track.createdAt,
        duration: track.duration,
      }),
    );
    const legacy = await loadBgm(track.id);
    assert.equal(legacy.cover, undefined);
    assert.equal(legacy.title, undefined);
    const upgraded = await importBgm(content, "new-filename.mp3");
    assert.deepEqual(upgraded, track);
    assert.equal((await stat(audioPath)).mtimeMs, before.mtimeMs);

    const custom = await sharp({
      create: { width: 80, height: 160, channels: 3, background: "#ba6543" },
    })
      .png()
      .toBuffer();
    const updated = await importBgmCover(track.id, custom);
    assert.notEqual(updated.cover, track.cover);
    assert.equal(updated.title, track.title);
    assert.equal((await importBgm(content, "again.mp3")).cover, updated.cover);
    // Old jobs keep their immutable image even after the cover is changed.
    assert.ok(await stat(path.join(folder, "public", track.cover)));
    await assert.rejects(
      importBgmCover(track.id, Buffer.from("invalid image")),
      /无法读取封面/,
    );
    await assert.rejects(importBgmCover("../../bad", custom), /编号无效/);
    assert.equal((await loadBgm(track.id)).cover, updated.cover);
    await rm(path.join(folder, "public", updated.cover!));
    assert.equal((await loadBgm(track.id)).cover, undefined);

    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=220:duration=0.5",
      "plain.wav",
    ]);
    const plain = await importBgm(await readFile("plain.wav"), "无封面.wav");
    assert.equal(plain.cover, undefined);
    assert.equal(plain.title, undefined);
  } finally {
    process.chdir(original);
    await rm(folder, { recursive: true, force: true });
  }
});
