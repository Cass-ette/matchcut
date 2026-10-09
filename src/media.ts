import type { Game } from "./domain";

export type MediaSlot = "logo" | "portrait" | "artwork";
export type MediaItem = {
  id: string;
  kind: "team" | "hero";
  game: Game;
  name: string;
  aliases: string[];
  heroId?: number;
  images: Partial<Record<MediaSlot, string>>;
  defaults: Partial<Record<MediaSlot, string>>;
  overrides: MediaSlot[];
};
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
