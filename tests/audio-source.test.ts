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
    const customMetadata = JSON.parse(await readFile(metadataPath, "utf8"));
    await writeFile(
      metadataPath,
      JSON.stringify({ ...customMetadata, metadataVersion: 1 }),
    );
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
    assert.equal((await importBgm(content, "repair.mp3")).cover, track.cover);

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

    // QQ Music can put TIFF bytes in an APIC frame labeled image/jpeg.
    // Finder displays it, but decoding it as JPEG fails. Keep the rest of
    // the real MP3 and its tags intact while reproducing that mismatch.
    const tiff = await sharp({
      create: { width: 300, height: 300, channels: 3, background: "#53a172" },
    })
      .tiff({ compression: "lzw" })
      .toBuffer();
    const picture = Buffer.concat([
      Buffer.from([0]),
      Buffer.from("image/jpeg\0"),
      Buffer.from([3, 0]),
      tiff,
    ]);
    assert.equal(content[3], 3);
    const syncsafeSize = (bytes: Buffer) =>
      bytes.reduce((size, byte) => (size << 7) | byte, 0);
    const oldTagEnd = 10 + syncsafeSize(content.subarray(6, 10));
    const frames: Buffer[] = [];
    for (let offset = 10; offset + 10 <= oldTagEnd;) {
      const header = content.subarray(offset, offset + 10);
      if (header[0] === 0) break;
      const size = header.readUInt32BE(4);
      if (header.toString("ascii", 0, 4) === "APIC") {
        const replacement = Buffer.from(header);
        replacement.writeUInt32BE(picture.length, 4);
        frames.push(replacement, picture);
      } else {
        frames.push(content.subarray(offset, offset + 10 + size));
      }
      offset += 10 + size;
    }
    const body = Buffer.concat(frames);
    const header = Buffer.from(content.subarray(0, 10));
    for (let index = 0; index < 4; index++)
      header[6 + index] = (body.length >> (7 * (3 - index))) & 0x7f;
    const mislabeled = Buffer.concat([
      header,
      body,
      content.subarray(oldTagEnd),
    ]);
    const qqTrack = await importBgm(mislabeled, "qq-music.mp3");
    assert.ok(qqTrack.cover, "TIFF labeled as JPEG still imports its artwork");
    assert.equal(qqTrack.title, track.title);
    assert.equal(qqTrack.artist, track.artist);
    const normalized = await sharp(
      path.join(folder, "public", qqTrack.cover),
    ).metadata();
    assert.equal(normalized.format, "jpeg");
    assert.equal(normalized.width, 512);
    assert.equal(normalized.height, 512);
    const qqAudio = path.join(folder, "public", qqTrack.src);
    const qqAudioBefore = await stat(qqAudio);
    const qqMetadataPath = `data/cache/bgm/${qqTrack.id}.json`;
    const qqMetadata = JSON.parse(await readFile(qqMetadataPath, "utf8"));
    const { coverFile: _oldCover, ...withoutCover } = qqMetadata;
    await writeFile(
      qqMetadataPath,
      JSON.stringify({ ...withoutCover, metadataVersion: 1 }),
    );
    assert.equal((await loadBgm(qqTrack.id)).cover, undefined);
    assert.deepEqual(await importBgm(mislabeled, "again.mp3"), qqTrack);
    assert.equal((await stat(qqAudio)).mtimeMs, qqAudioBefore.mtimeMs);
  } finally {
    process.chdir(original);
    await rm(folder, { recursive: true, force: true });
  }
});
