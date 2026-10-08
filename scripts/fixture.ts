import { readFile, writeFile } from "node:fs/promises";
import { DEFAULT_MATCH, defaultSettings, previewProps } from "../src/domain";
import { initializeData, loadMatch } from "../server/source";
await initializeData();
const { match } = await loadMatch(DEFAULT_MATCH);
await writeFile(
  "data/fixtures/preview.json",
  JSON.stringify(previewProps(match, defaultSettings(match)), null, 2),
);
