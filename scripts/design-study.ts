import assert from "node:assert/strict";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import { browserPath } from "../server/render";
import { radar, totalFrames } from "../src/domain";
import {
  STUDY_FRAMES,
  studyMatch,
  studyPair,
  studyProps,
} from "../src/video/design-study/model";
import { designStudyPage } from "./design-study-page";

const root = process.cwd();
const output = path.join(root, "output/design-study");
const stillsOnly = process.argv.includes("--stills-only");
const skipStills = process.argv.includes("--skip-stills");
assert.deepEqual(
  studyPair.map((p) => p.name),
  ["Chovy", "Faker"],
);
assert.equal(totalFrames(studyProps.segments), STUDY_FRAMES);
const axes = radar(studyMatch, studyPair, 3);
assert.ok(
  axes.every((axis) => Number.isFinite(axis.a) && Number.isFinite(axis.b)),
);
for (const player of studyPair) {
  for (const src of [player.image, player.playerArtwork]) {
    assert.ok(src && src.startsWith("/assets/"));
    await access(path.join(root, "public", src));
  }
}
await mkdir(output, { recursive: true });
await writeFile(path.join(output, "index.html"), designStudyPage);
if (process.argv.includes("--page-only")) process.exit(0);
console.log("Bundling the independent design study...");
const serveUrl = await bundle({
  entryPoint: path.join(root, "src/video/design-study/index.tsx"),
  outDir: path.join(root, ".cache/design-study-bundle"),
  publicDir: path.join(root, "public"),
});
const browserExecutable = await browserPath();
for (const [id, filename] of [
  ["DesignStudy", "new"],
  ["CurrentStudy", "current"],
] as const) {
  const composition = await selectComposition({
    serveUrl,
    id,
    browserExecutable,
  });
  if (!skipStills) {
    const frames =
      id === "DesignStudy"
        ? {
            opening: 90,
            transition: 155,
            compare: 285,
            damage: 405,
            participation: 570,
            final: 710,
          }
        : { opening: 90, compare: 710 };
    for (const [name, frame] of Object.entries(frames)) {
      console.log(`Rendering ${filename}-${name} at frame ${frame}`);
      await renderStill({
        composition,
        serveUrl,
        browserExecutable,
        frame,
        imageFormat: "png",
        output: path.join(output, `${filename}-${name}.png`),
      });
    }
  }
  if (!stillsOnly) {
    let lastProgress = -1;
    await renderMedia({
      composition,
      serveUrl,
      browserExecutable,
      codec: "h264",
      crf: 19,
      pixelFormat: "yuv420p",
      muted: true,
      concurrency: 3,
      timeoutInMilliseconds: 120000,
      outputLocation: path.join(output, `${filename}.mp4`),
      onProgress: ({ progress }) => {
        const percent = Math.floor(progress * 10) * 10;
        if (percent !== lastProgress) {
          console.log(`${filename}: ${percent}%`);
          lastProgress = percent;
        }
      },
    });
  }
}
await writeFile(
  path.join(output, "facts.json"),
  JSON.stringify(
    {
      matchId: studyMatch.id,
      source: studyMatch.source,
      fps: 30,
      frames: STUDY_FRAMES,
      width: 1920,
      height: 1080,
      players: studyPair,
      axes,
      normalization:
        "Each axis uses the greater value of the two players as its maximum.",
      portraitNote:
        "Current library portraits, not historical match-day photographs.",
    },
    null,
    2,
  ),
);
console.log(
  stillsOnly
    ? `Stills ready: ${output}`
    : "Ready: http://127.0.0.1:4317/output/design-study/",
);
