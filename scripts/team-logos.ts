import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Run explicitly to refresh the bundled defaults; generating videos never depends on this host.
const teams = JSON.parse(
  await readFile("data/fixtures/team-logos.json", "utf8"),
);
await mkdir("public/assets/teams", { recursive: true });
for (const team of teams) {
  const response = await fetch(
    team.source.startsWith("https://")
      ? team.source
      : `https://raw.githubusercontent.com/lootmarket/esport-team-logos/master/${team.source}`,
    { signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok) throw new Error(`${team.name}: HTTP ${response.status}`);
  const image = await sharp(Buffer.from(await response.arrayBuffer()))
    .trim()
    .resize({
      width: 600,
      height: 600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  await writeFile(path.join("public", team.logo), image);
  console.log(`${team.game} ${team.name}: ${image.length} bytes`);
}
