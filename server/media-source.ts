import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import type { Game, MatchData } from "../src/domain";
import {
  mediaKey,
  exactLogo,
  type MediaItem,
  type MediaSlot,
  type LogoSource,
} from "../src/media";
import { LogoCatalog, logoCatalog } from "./logo-catalog";

export const mediaGameSchema = z.enum(["dota2", "lol", "cs2"]);
export const mediaSlotSchema = z.enum(["logo", "portrait", "artwork"]);
const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((v) => !!mediaKey(v), "请输入队名");
export const teamInputSchema = z.object({
  name: nameSchema,
  aliases: z.array(nameSchema).max(30).default([]),
});
const imagePath = z.string().regex(/^\/assets\/library\/[a-f0-9]{64}\.png$/);
const imagesSchema = z.object({
  logo: imagePath.optional(),
  portrait: imagePath.optional(),
  artwork: imagePath.optional(),
});
const registrySchema = z.object({
  version: z.literal(1),
  heroes: z.record(imagesSchema),
  players: z
    .record(
      z.object({
        game: mediaGameSchema,
        name: z.string(),
        aliases: z.array(z.string()),
        images: imagesSchema,
        photoSource: z
          .object({
            name: z.string(),
            provider: z.string(),
            pageUrl: z.string(),
            imageUrl: z.string(),
          })
          .optional(),
      }),
    )
    .default({}),
  teams: z.record(
    z.object({
      game: mediaGameSchema,
      name: nameSchema,
      aliases: z.array(nameSchema),
      images: imagesSchema,
      logoSource: z
        .object({ name: z.string(), path: z.string(), url: z.string().url() })
        .optional(),
    }),
  ),
});
type Registry = z.infer<typeof registrySchema>;
type TeamSeed = { game: Game; name: string; aliases: string[]; logo?: string };
type PlayerSeed = {
  game: Game;
  playerId: string;
  name: string;
  artwork: string;
  source: NonNullable<MediaItem["photoSource"]>;
};
type PlayerProfile = {
  playerId: string;
  name: string;
  aliases: string[];
};
export type TeamSummary = {
  radiant: string;
  dire: string;
  players?: {
    playerId?: string;
    steamId?: string;
    name: string;
    team?: string;
  }[];
};
const emptyRegistry = (): Registry => ({
  version: 1,
  heroes: {},
  players: {},
  teams: {},
});
export const playerMediaId = (
  game: Game,
  player: { playerId?: string; steamId?: string },
) => {
  const identity = player.playerId || player.steamId;
  if (!identity) return undefined;
  return `${game}-player-${/^\d+$/.test(identity) ? identity : createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;
};
const teamId = (game: Game, name: string) =>
  `${game}-team-${createHash("sha256").update(mediaKey(name)).digest("hex").slice(0, 24)}`;
const exists = async (file: string) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};

export class MediaLibrary {
  private queue: Promise<unknown> = Promise.resolve();
  private file: string;
  constructor(
    private root: string,
    private catalog = new LogoCatalog(root),
  ) {
    this.file = path.join(root, "data/media-library.json");
  }

  private async read(): Promise<Registry> {
    try {
      return registrySchema.parse(
        JSON.parse(await readFile(this.file, "utf8")),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        return emptyRegistry();
      throw new Error("素材库读取失败，请检查 data/media-library.json。");
    }
  }
  private mutate<T>(fn: (registry: Registry) => Promise<T>) {
    const task = this.queue.then(async () => {
      const registry = await this.read();
      const result = await fn(registry);
      await mkdir(path.dirname(this.file), { recursive: true });
      const temporary = this.file + "." + randomUUID() + ".tmp";
      await writeFile(temporary, JSON.stringify(registry, null, 2));
      await rename(temporary, this.file);
      return result;
    });
    this.queue = task.catch(() => {});
    return task;
  }
  private async seeds(): Promise<TeamSeed[]> {
    try {
      return JSON.parse(
        await readFile(
          path.join(this.root, "data/fixtures/team-logos.json"),
          "utf8",
        ),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
  }
  private async playerSeeds(): Promise<PlayerSeed[]> {
    try {
      return JSON.parse(
        await readFile(
          path.join(this.root, "data/fixtures/player-photos.json"),
          "utf8",
        ),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
  }
  private async playerProfiles(game: Game): Promise<PlayerProfile[]> {
    if (game !== "lol") return [];
    try {
      const catalog = JSON.parse(
        await readFile(
          path.join(this.root, "data/fixtures/lol/players.json"),
          "utf8",
        ),
      );
      return catalog.players;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
  }
  private async teams(
    game: Game,
    registry: Registry,
    summaries: TeamSummary[] = [],
  ): Promise<MediaItem[]> {
    const items = new Map<string, MediaItem>();
    for (const seed of (await this.seeds()).filter((s) => s.game === game)) {
      const id = teamId(game, seed.name);
      items.set(id, {
        id,
        kind: "team",
        game,
        name: seed.name,
        aliases: seed.aliases,
        images: {},
        defaults: seed.logo ? { logo: seed.logo } : {},
        overrides: [],
      });
    }
    for (const [id, entry] of Object.entries(registry.teams).filter(
      ([, t]) => t.game === game,
    )) {
      const defaults = items.get(id)?.defaults || {};
      items.set(id, {
        ...entry,
        id,
        kind: "team",
        defaults,
        overrides: entry.images.logo ? ["logo"] : [],
      });
    }
    const known = new Set(
      [...items.values()].flatMap((t) => [t.name, ...t.aliases].map(mediaKey)),
    );
    for (const summary of summaries)
      for (const name of [summary.radiant, summary.dire]) {
        if (!name || known.has(mediaKey(name))) continue;
        known.add(mediaKey(name));
        const id = teamId(game, name);
        items.set(id, {
          id,
          kind: "team",
          game,
          name,
          aliases: [],
          images: {},
          defaults: {},
          overrides: [],
        });
      }
    const catalog = await this.catalog.local();
    return [...items.values()].map((t) => {
      const automaticLogo = !t.defaults.logo
        ? exactLogo(catalog?.logos || [], game, [t.name, ...t.aliases])
        : undefined;
      const defaults = automaticLogo
        ? { logo: `/api/logo-catalog/image/${automaticLogo.sha}` }
        : t.defaults;
      const images = { ...defaults, ...t.images };
      const hasCandidates = catalog?.logos.some(
        (logo) =>
          logo.game === game &&
          [t.name, ...t.aliases].some(
            (name) =>
              name.trim().toLowerCase() === logo.name.trim().toLowerCase(),
          ),
      );
      return {
        ...t,
        defaults,
        automaticLogo,
        images,
        logoReview: images.logo
          ? undefined
          : hasCandidates
            ? ("ambiguous" as const)
            : ("missing" as const),
      };
    });
  }
  async list(game: Game, summaries: TeamSummary[] = []): Promise<MediaItem[]> {
    await this.queue;
    const registry = await this.read();
    const heroes: MediaItem[] = [];
    const players = new Map<string, MediaItem>();
    for (const person of await this.playerProfiles(game)) {
      const id = playerMediaId(game, person)!;
      players.set(id, {
        id,
        game,
        kind: "player",
        name: person.name,
        aliases: [...new Set([person.playerId, ...person.aliases])],
        images: {},
        defaults: {},
        overrides: [],
      });
    }
    for (const seed of await this.playerSeeds()) {
      if (seed.game !== game) continue;
      const id = playerMediaId(game, seed)!;
      players.set(id, {
        id,
        game,
        kind: "player",
        name: seed.name,
        aliases: [
          ...new Set([...(players.get(id)?.aliases || []), seed.playerId]),
        ],
        images: { artwork: seed.artwork },
        defaults: { artwork: seed.artwork },
        overrides: [],
        photoSource: seed.source,
      });
    }
    for (const [id, entry] of Object.entries(registry.players)) {
      if (entry.game !== game) continue;
      players.set(id, {
        ...entry,
        id,
        kind: "player",
        images: { ...players.get(id)?.defaults, ...entry.images },
        defaults: players.get(id)?.defaults || {},
        photoSource:
          entry.photoSource ||
          (!entry.images.artwork ? players.get(id)?.photoSource : undefined),
        overrides: Object.keys(entry.images) as MediaSlot[],
      });
    }
    for (const player of summaries.flatMap((m) => m.players || [])) {
      const id = playerMediaId(game, player);
      if (!id) continue;
      const previous = players.get(id);
      const images =
        registry.players[id]?.images ||
        (game === "cs2" ? registry.heroes[id] : undefined) ||
        {};
      players.set(id, {
        id,
        kind: "player",
        game,
        name: player.name,
        aliases: [
          ...new Set(
            [
              ...(previous?.aliases || []),
              player.playerId || player.steamId || "",
              player.team || "",
              previous?.name || "",
            ].filter(Boolean),
          ),
        ],
        images: { ...previous?.defaults, ...images },
        defaults: previous?.defaults || {},
        photoSource: registry.players[id]?.photoSource || previous?.photoSource,
        overrides: Object.keys(images) as MediaSlot[],
      });
    }
    if (game !== "cs2") {
      const file = game === "lol" ? "lol/champions.json" : "heroes.json";
      const catalog = JSON.parse(
        await readFile(path.join(this.root, "data/fixtures", file), "utf8"),
      );
      for (const hero of Object.values(
        game === "lol" ? catalog.data : catalog,
      ) as any[]) {
        const heroId = Number(game === "lol" ? hero.key : hero.id);
        const id = `${game}-hero-${heroId}`;
        const portrait =
          game === "lol"
            ? `/assets/lol/${hero.id}.png`
            : `/assets/heroes/${heroId}.png`;
        const artwork =
          game === "lol"
            ? `/assets/lol/${hero.id}.jpg`
            : `/assets/renders/${heroId}.png`;
        const defaults: MediaItem["defaults"] = {};
        if (await exists(path.join(this.root, "public", portrait)))
          defaults.portrait = portrait;
        if (await exists(path.join(this.root, "public", artwork)))
          defaults.artwork = artwork;
        const overrides = registry.heroes[id] || {};
        heroes.push({
          id,
          kind: "hero",
          game,
          heroId,
          name: game === "lol" ? hero.name : hero.localized_name,
          aliases: [hero.name, hero.id?.toString()].filter(Boolean),
          defaults,
          images: { ...defaults, ...overrides },
          overrides: Object.keys(overrides) as MediaSlot[],
        });
      }
    }
    return [
      ...(await this.teams(game, registry, summaries)),
      ...heroes,
      ...players.values(),
    ].sort((a, b) => a.name.localeCompare(b.name));
  }
  async saveTeam(
    game: Game,
    input: unknown,
    id: string | undefined,
    summaries: TeamSummary[],
  ) {
    const data = teamInputSchema.parse(input);
    return this.mutate(async (registry) => {
      const teams = await this.teams(game, registry, summaries);
      const previous = id ? teams.find((t) => t.id === id) : undefined;
      if (id && !previous) throw new Error("未找到这支战队。");
      const aliases = [
        ...new Set(
          [
            ...data.aliases,
            ...(previous && previous.name !== data.name ? [previous.name] : []),
          ].map((v) => v.trim()),
        ),
      ].filter((v) => mediaKey(v) !== mediaKey(data.name));
      const names = new Set([data.name, ...aliases].map(mediaKey));
      const conflict = teams.find(
        (t) =>
          t.id !== id &&
          [t.name, ...t.aliases].some((n) => names.has(mediaKey(n))) &&
          (registry.teams[t.id] ||
            (Object.keys(t.defaults).length && !t.automaticLogo)),
      );
      if (conflict) throw new Error(`队名或别名已被 ${conflict.name} 使用。`);
      // Discovered names may be absorbed as aliases; configured teams cannot be silently merged.
      const key = id || teamId(game, data.name);
      if (!id && teams.some((t) => t.id === key))
        throw new Error("这支战队已在素材库中，请直接选择它。");
      registry.teams[key] = {
        game,
        name: data.name,
        aliases,
        images: registry.teams[key]?.images || {},
        logoSource: registry.teams[key]?.logoSource,
      };
      return { id: key };
    });
  }
  async setImage(
    game: Game,
    id: string,
    slot: MediaSlot,
    content: Buffer | null,
    summaries: TeamSummary[] = [],
    logoSource?: LogoSource,
    photoSource?: MediaItem["photoSource"],
  ) {
    const items = await this.list(game, summaries);
    const item = items.find((entry) => entry.id === id);
    if (!item || (item.kind === "team" ? slot !== "logo" : slot === "logo"))
      throw new Error("素材位置不正确。");
    let src: string | undefined;
    if (content !== null) {
      if (!content.length || content.length > 12 * 1024 * 1024)
        throw new Error("图片不能超过 12 MB。");
      let png: Buffer;
      try {
        const image = sharp(content, {
          limitInputPixels: 40_000_000,
          failOn: "warning",
        });
        const metadata = await image.metadata();
        if (
          !["png", "jpeg", "webp"].includes(metadata.format || "") ||
          (metadata.pages || 1) > 1
        )
          throw new Error();
        png = await image
          .rotate()
          .resize({
            width: slot === "portrait" ? 512 : 1600,
            height: 1600,
            fit: "inside",
            withoutEnlargement: true,
          })
          .png()
          .toBuffer();
      } catch {
        throw new Error("无法读取图片，请使用静态 PNG、JPG 或 WebP。");
      }
      src = await this.storePng(png);
    }
    return this.mutate(async (registry) => {
      const entry =
        item.kind === "player"
          ? (registry.players[id] ||= {
              game,
              name: item.name,
              aliases: item.aliases,
              images: { ...(game === "cs2" ? registry.heroes[id] : {}) },
            }).images
          : item.kind === "hero"
            ? (registry.heroes[id] ||= {})
            : (registry.teams[id] ||= {
                game,
                name: item.name,
                aliases: item.aliases,
                images: {},
              }).images;
      if (src) entry[slot] = src;
      else delete entry[slot];
      if (item.kind === "team") {
        if (src && logoSource) registry.teams[id].logoSource = logoSource;
        else delete registry.teams[id].logoSource;
      }
      if (item.kind === "player" && slot === "artwork") {
        if (src && photoSource) registry.players[id].photoSource = photoSource;
        else delete registry.players[id].photoSource;
      }
      return { src: src || item.defaults[slot] || null };
    });
  }
  private async storePng(png: Buffer) {
    const src = `/assets/library/${createHash("sha256").update(png).digest("hex")}.png`;
    const dest = path.join(this.root, "public", src);
    if (!(await exists(dest))) {
      await mkdir(path.dirname(dest), { recursive: true });
      const temporary = `${dest}.${randomUUID()}.tmp`;
      await writeFile(temporary, png);
      await rename(temporary, dest);
    }
    return src;
  }
  async apply(match: MatchData) {
    await this.queue;
    const registry = await this.read();
    const game = match.game || "dota2";
    const teams = await this.teams(game, registry, [
      { radiant: match.radiant, dire: match.dire },
    ]);
    match.logoReview = [];
    for (const side of ["radiant", "dire"] as const) {
      const team = teams.find((t) =>
        [t.name, ...t.aliases].some(
          (n) => mediaKey(n) === mediaKey(match[side]),
        ),
      );
      match[`${side}Logo`] = team?.images.logo;
      if (team?.logoReview)
        match.logoReview.push({ side, reason: team.logoReview });
      if (team?.automaticLogo && !team.overrides.includes("logo")) {
        try {
          match[`${side}Logo`] = await this.storePng(
            await this.catalog.image(team.automaticLogo.sha),
          );
        } catch {
          match[`${side}Logo`] = undefined;
        }
      }
    }
    const playerSeeds = await this.playerSeeds();
    for (const player of match.players) {
      const id = playerMediaId(game, player);
      const photos = id
        ? registry.players[id]?.images ||
          (game === "cs2" ? registry.heroes[id] : undefined)
        : undefined;
      player.playerImage = photos?.portrait;
      player.playerArtwork =
        photos?.artwork ||
        playerSeeds.find(
          (seed) => seed.game === game && seed.playerId === player.playerId,
        )?.artwork;
      const images =
        game === "cs2"
          ? undefined
          : registry.heroes[`${game}-hero-${player.heroId}`];
      if (images?.portrait) player.image = images.portrait;
      if (images?.artwork) player.artwork = images.artwork;
    }
    return match;
  }
}

export const mediaLibrary = new MediaLibrary(process.cwd(), logoCatalog);
export async function listDotaTeams(): Promise<TeamSummary[]> {
  const summaries: TeamSummary[] = [];
  for (const dir of ["data/fixtures", "data/cache"]) {
    for (const file of await readdir(path.join(process.cwd(), dir))) {
      if (!/^\d+\.json$/.test(file)) continue;
      const { raw } = JSON.parse(
        await readFile(path.join(process.cwd(), dir, file), "utf8"),
      );
      if (raw?.radiant_team?.name && raw?.dire_team?.name)
        summaries.push({
          radiant: raw.radiant_team.name,
          dire: raw.dire_team.name,
          players: (raw.players || []).map((p: any) => ({
            playerId:
              Number.isSafeInteger(p.account_id) && p.account_id > 0
                ? String(p.account_id)
                : `match:${raw.match_id}:${p.player_slot}`,
            name:
              p.name || p.personaname || `选手 ${(p.player_slot % 128) + 1}`,
            team:
              p.player_slot < 128 ? raw.radiant_team.name : raw.dire_team.name,
          })),
        });
    }
  }
  return summaries;
}
