import { writeFile } from "node:fs/promises";
import { logoCatalog } from "../server/logo-catalog";

const data = await logoCatalog.list(true);
if (data.warning) throw new Error(data.warning);
await writeFile(
  "data/fixtures/logo-catalog.json",
  JSON.stringify(data, null, 2) + "\n",
);
console.log(
  `${data.logos.length} team logo entries saved (${data.fetchedAt}).`,
);
