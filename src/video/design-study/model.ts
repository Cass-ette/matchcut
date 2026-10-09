import fixture from "../../../data/fixtures/lol/LOLTMNT02_76144.json";
import champions from "../../../data/fixtures/lol/champions.json";
import { championFor, normalizeLol } from "../../lol";
import {
  comparisons,
  defaultSettings,
  makeCaptions,
  type VideoProps,
} from "../../domain";

export const STUDY_FRAMES = 750;
export const OPENING_FRAMES = 150;

// Pin this historical sample to bundled assets, independent of library overrides.
export const studyMatch = normalizeLol(
  fixture.rows,
  champions,
  fixture.fetchedAt,
);
studyMatch.radiantLogo = "/assets/teams/lol-gen-g.png";
studyMatch.direLogo = "/assets/teams/lol-t1.png";
const photos: Record<string, string> = {
  "oe:player:fb6e61b8acb05df17b7e5ad4ae7c800":
    "/assets/players/lol-player-0f9980732ce4089c70537491.png",
  "oe:player:e1edfc5cea461399a63cb813cf795cc":
    "/assets/players/lol-player-ab91de7435da148b8898a170.png",
};
for (const player of studyMatch.players) {
  const champion = championFor(player.hero, champions);
  if (champion) {
    player.image = `/assets/lol/${champion.id}.png`;
    player.artwork = `/assets/lol/${champion.id}.jpg`;
  }
  player.playerArtwork = photos[player.playerId || ""];
}

const settings = defaultSettings(studyMatch);
settings.playerVisual = "photo";
settings.radarPosition = "3";
settings.radarMode = "positions";
const segments = [
  { text: settings.scripts[0], frames: OPENING_FRAMES },
  { text: "", frames: 0 },
  { text: "中路对位 · Chovy vs Faker", frames: STUDY_FRAMES - OPENING_FRAMES },
  { text: "", frames: 0 },
  { text: "", frames: 0 },
];
export const studyProps: VideoProps = {
  match: studyMatch,
  settings,
  segments,
  captions: makeCaptions(segments),
};
export const studyPair = comparisons(studyMatch, settings)[0].pair!;
