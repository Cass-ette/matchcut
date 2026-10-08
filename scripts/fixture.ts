import { readFile, writeFile } from "node:fs/promises";
import { normalizeMatch, defaultSettings, previewProps } from "../src/domain";
const fixture = JSON.parse(
  await readFile("data/fixtures/9035078952.json", "utf8"),
);
const heroes = JSON.parse(await readFile("data/fixtures/heroes.json", "utf8"));
const match = normalizeMatch(fixture.raw, heroes, fixture.fetchedAt);
await writeFile(
  "data/fixtures/preview.json",
  JSON.stringify(previewProps(match, defaultSettings(match)), null, 2),
);
