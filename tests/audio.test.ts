import test from "node:test";
import assert from "node:assert/strict";
import { bgmVolume, settingsSchema } from "../src/domain";

test("optional BGM is silent by default; references and volume are validated", () => {
  const input = { headline: "测试", scripts: ["一", "二", "三", "四", "五"] };
  assert.equal(settingsSchema.parse(input).bgm, undefined);
  assert.throws(() =>
    settingsSchema.parse({
      ...input,
      bgm: { trackId: "../../music", volume: 0.5, loop: true },
    }),
  );
  assert.throws(() =>
    settingsSchema.parse({
      ...input,
      bgm: { trackId: "a".repeat(64), volume: 2, loop: true },
    }),
  );
});
test("BGM fades at film boundaries, without restarting volume at loop boundaries", () => {
  const bgm = { trackId: "a".repeat(64), volume: 0.4, loop: true };
  assert.equal(bgmVolume(0, 1800, 10, bgm), 0);
  assert.equal(bgmVolume(900, 1800, 10, bgm), 0.4);
  assert.equal(bgmVolume(1799, 1800, 10, bgm), 0);
  assert.equal(bgmVolume(300, 1800, 10, { ...bgm, loop: false }), 0);
  assert.ok(bgmVolume(280, 1800, 10, { ...bgm, loop: false }) < 0.4);
  assert.equal(bgmVolume(100, 1800, 10, { ...bgm, volume: 0 }), 0);
});
