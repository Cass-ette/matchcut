// Refresh only the bundled real sample rosters. New identities are reviewed in the media UI.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import {
  fetchPhotoCandidate,
  limitedFetch,
  photoImageUrl,
} from "../server/player-photos";
import { normalizeCs } from "../src/cs";
import { normalizeLol } from "../src/lol";
import { playerMediaId } from "../server/media-source";

const cs = normalizeCs(
  JSON.parse(await readFile("data/fixtures/cs/monte-og-anubis.json", "utf8")),
);
const lolRaw = JSON.parse(
  await readFile("data/fixtures/lol/LOLTMNT02_76144.json", "utf8"),
);
const lol = normalizeLol(
  lolRaw.rows,
  JSON.parse(await readFile("data/fixtures/lol/champions.json", "utf8")),
  lolRaw.fetchedAt,
);
type Seed = {
  game: string;
  playerId: string;
  name: string;
  artwork: string;
  source: Awaited<ReturnType<typeof fetchPhotoCandidate>>;
};
let seeds: Seed[] = [];
try {
  seeds = JSON.parse(
    await readFile("data/fixtures/player-photos.json", "utf8"),
  );
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
await mkdir("public/assets/players", { recursive: true });
for (const match of [cs, lol]) {
  for (const p of match.players) {
    try {
      if (!/^[a-z0-9-]+$/i.test(p.name)) continue;
      const source = await fetchPhotoCandidate(
        `https://prosettings.net/players/${p.name.toLowerCase()}/`,
      );
      if (source.name.toLowerCase() !== p.name.toLowerCase())
        throw new Error("选手昵称不匹配，需要人工核对");
      const raw = await limitedFetch(
        photoImageUrl(source.imageUrl),
        12 * 1024 * 1024,
      );
      const png = await sharp(raw)
        .rotate()
        .resize({
          width: 1000,
          height: 1000,
          fit: "inside",
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();
      const artwork = `/assets/players/${playerMediaId(match.game!, p)}.png`;
      await writeFile("public" + artwork, png);
      const entry: Seed = {
        game: match.game!,
        playerId: p.playerId!,
        name: p.name,
        artwork,
        source,
      };
      const index = seeds.findIndex(
        (seed) => seed.game === entry.game && seed.playerId === entry.playerId,
      );
      if (index < 0) seeds.push(entry);
      else seeds[index] = entry;
      console.log("Saved", match.game, p.name);
    } catch (error) {
      console.log("Unavailable", match.game, p.name, (error as Error).message);
    }
  }
}
await writeFile(
  "data/fixtures/player-photos.json",
  JSON.stringify(seeds, null, 2) + "\n",
);
console.log("Bundled", seeds.length, "real player photos");
