import type { Game } from "./domain";

export type MediaSlot = "logo" | "portrait" | "artwork";
export type LogoSource = { name: string; path: string; url: string };
export type CatalogLogo = {
  game: Game;
  name: string;
  path: string;
  sha: string;
};
export type LogoCatalogData = {
  fetchedAt: string;
  logos: CatalogLogo[];
  warning?: string;
};
export type MediaItem = {
  id: string;
  kind: "team" | "hero" | "player";
  game: Game;
  name: string;
  aliases: string[];
  heroId?: number;
  thumbnail?: string;
  images: Partial<Record<MediaSlot, string>>;
  defaults: Partial<Record<MediaSlot, string>>;
  overrides: MediaSlot[];
  logoSource?: LogoSource;
  automaticLogo?: CatalogLogo;
  logoReview?: "ambiguous" | "missing";
  photoSource?: {
    name: string;
    provider: string;
    pageUrl: string;
    imageUrl: string;
  };
};
export type MediaQuery = {
  kind: MediaItem["kind"];
  query: string;
  filter: "all" | "custom" | "missing" | "review";
  offset: number;
  limit: number;
};
export type MediaPage = {
  items: MediaItem[];
  total: number;
  counts: Record<MediaItem["kind"], number>;
  offset: number;
  limit: number;
};
export const logoReviewText = (reason: MediaItem["logoReview"]) =>
  reason === "ambiguous" ? "同名待确认" : "缺少队标";
export function exactLogo(
  logos: CatalogLogo[],
  game: Game,
  names: string[],
): CatalogLogo | undefined {
  const normalize = (name: string) => name.trim().toLowerCase();
  for (const name of names) {
    const matches = logos.filter(
      (logo) => logo.game === game && normalize(logo.name) === normalize(name),
    );
    if (matches.length) {
      const primary = matches.filter((logo) => {
        const pieces = logo.path.split("/");
        return (
          pieces.at(-1)?.toLowerCase() === `${pieces[1]}-logo.png`.toLowerCase()
        );
      });
      const candidates = primary.length ? primary : matches;
      return new Set(candidates.map((logo) => logo.sha)).size === 1
        ? candidates[0]
        : undefined;
    }
  }
  return undefined;
}
export const catalogLogoUrl = (logo: CatalogLogo) =>
  `https://github.com/lootmarket/esport-team-logos/blob/master/${logo.path.split("/").map(encodeURIComponent).join("/")}`;
export const mediaKey = (name: string) =>
  name
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, "");
export const teamInitials = (name: string) => {
  const words = name.trim().split(/\s+/);
  return (
    words.length > 1
      ? words.map((word) => Array.from(word)[0]).join("")
      : name.replace(/[.\s]/g, "")
  )
    .slice(0, 3)
    .toUpperCase();
};

const logoWords = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/);
const shortName = (value: string) =>
  logoWords(value)
    .filter((word) => !["team", "gaming", "esports", "esport"].includes(word))
    .join("");
export function searchLogos(
  logos: CatalogLogo[],
  query: string,
  aliases: string[] = [],
) {
  if (!query.trim()) return logos;
  const names = [query, ...aliases].filter((name) => name.trim());
  const score = (logo: CatalogLogo) =>
    Math.max(
      ...names.map((name) => {
        const key = mediaKey(name),
          candidate = mediaKey(logo.name);
        if (key === candidate) return 100;
        if (shortName(name) && shortName(name) === shortName(logo.name))
          return 90;
        if (candidate.includes(key)) return 80;
        if (
          logoWords(logo.name)
            .map((word) => word[0])
            .join("") === key
        )
          return 70;
        const words = logoWords(name).filter(
          (word) =>
            word.length > 1 &&
            !["team", "gaming", "esports", "esport"].includes(word),
        );
        const common = words.filter((word) =>
          logoWords(logo.name).includes(word),
        ).length;
        return common ? 40 + (20 * common) / words.length : 0;
      }),
    );
  return logos
    .map((logo) => ({ logo, score: score(logo) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.logo.name.localeCompare(b.logo.name))
    .map((item) => item.logo);
}
