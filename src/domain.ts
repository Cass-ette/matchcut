import { z } from "zod";
import { normalizeDotaInventory, type PlayerInventory } from "./items";

export const FPS = 30;
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const exportResolutions = {
  "720": { width: 1280, height: 720, scale: 2 / 3, label: "720p · 快速试片" },
  "1080": { width: 1920, height: 1080, scale: 1, label: "1080p · 正式发布" },
  "1440": {
    width: 2560,
    height: 1440,
    scale: 4 / 3,
    label: "2K · 2560 × 1440",
  },
  "2160": { width: 3840, height: 2160, scale: 2, label: "4K · 3840 × 2160" },
} as const;
export const DEFAULT_MATCH = "9035078952";
export const DEFAULT_LOL_MATCH = "lol-LOLTMNT02_76144";
export const DEFAULT_CS_MATCH = "cs2-monte-og-anubis";
export type Game = "dota2" | "lol" | "cs2";
export const reportModeSchema = z.enum(["game", "series", "full"]);
export type ReportMode = z.infer<typeof reportModeSchema>;
export const reportModeOf = (m: ReportData): ReportMode =>
  m.fullGames ? "full" : m.series ? "series" : "game";
export const csMapIcon = (map: string) =>
  [
    "ancient",
    "anubis",
    "dust2",
    "inferno",
    "mirage",
    "nuke",
    "overpass",
    "train",
    "vertigo",
    "cache",
  ].includes(map)
    ? `/assets/cs/maps/${map}.png`
    : undefined;
export const matchIdSchema = z
  .string()
  .regex(/^(?:\d{6,15}|(?:lol|cs2)-[A-Za-z0-9_-]{1,100})$/);
export const SCENES = [
  "比赛战报",
  "经济走势",
  "对位雷达",
  "伤害排行",
  "赛果回顾",
] as const;
export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const POSITIONS = [1, 2, 3, 4, 5] as const;
export type Position = (typeof POSITIONS)[number];
export const POSITION_NAMES: Record<Position, string> = {
  1: "一号位",
  2: "二号位",
  3: "三号位",
  4: "四号位",
  5: "五号位",
};
export const LOL_POSITION_NAMES: Record<Position, string> = {
  1: "上单",
  2: "打野",
  3: "中单",
  4: "下路",
  5: "辅助",
};
export const CS_POSITION_NAMES: Record<Position, string> = {
  1: "狙击手",
  2: "突破手",
  3: "自由人",
  4: "辅助",
  5: "指挥",
};
export const positionNames = (m: ReportData) =>
  m.game === "cs2"
    ? CS_POSITION_NAMES
    : m.game === "lol"
      ? LOL_POSITION_NAMES
      : POSITION_NAMES;
export const sceneSlots = (m: ReportData, settings?: Settings) => {
  if (m.game === "cs2") return [0, 2, 3, 4];
  const slots = [0, 1, 2, 3, 5];
  if (settings && mvpFor(m, settings)) slots.push(6);
  return [...slots, 4];
};
export const sceneNames = (m: ReportData, settings?: Settings) => {
  const names: Record<number, string> = {
    0: m.series ? "系列赛比分" : "比赛战报",
    1: "资源对比",
    2: "对位雷达",
    3: "伤害前五",
    4: "赛果回顾",
    5: "伤害后五",
    6: "本局 MVP",
  };
  if (m.game === "cs2")
    return sceneSlots(m, settings).map(
      (slot) =>
        ({ 0: "地图战报", 2: "选手雷达", 3: "击杀排行", 4: "赛果回顾" })[slot],
    );
  return sceneSlots(m, settings).map((slot) => names[slot]);
};
export function gameScope(m: ReportData): string {
  if (m.cs) return m.cs.map;
  if (!m.series) return m.gameNumber ? `G${m.gameNumber}` : "本场";
  const numbers = m.series.games.map((g) => g.gameNumber);
  const games = numbers.every((n): n is number => n !== undefined)
    ? !m.series.missingGames.length && numbers.length > 1
      ? `G${numbers[0]}-G${numbers.at(-1)}`
      : numbers.map((n) => `G${n}`).join(" / ")
    : `${numbers.length} 局`;
  return (
    games +
    (m.series.missingGames.length
      ? ` · 缺 G${m.series.missingGames.join(" / G")}`
      : "")
  );
}
export const gameName = (m: ReportData) =>
  m.game === "cs2"
    ? m.cs?.version === "CSGO"
      ? "CS:GO"
      : "CS2"
    : m.game === "lol"
      ? "英雄联盟"
      : "Dota 2";
export const gameTitle = (m: ReportData) =>
  m.game === "lol" ? "LEAGUE OF LEGENDS" : gameName(m).toUpperCase();
export const providerName = (m: ReportData) =>
  m.game === "cs2"
    ? "CS Demo Analyzer"
    : m.game === "lol"
      ? "Oracle’s Elixir"
      : "OpenDota";
export const sideName = (m: ReportData, side: "radiant" | "dire") =>
  m.series || m.game === "cs2"
    ? m[side]
    : m.game === "lol"
      ? side === "radiant"
        ? "蓝方"
        : "红方"
      : side === "radiant"
        ? "天辉"
        : "夜魇";
export const isSupport = (m: ReportData, position?: Position) =>
  Boolean(
    m.game !== "cs2" &&
    position &&
    (m.game === "lol" ? position === 5 : position >= 4),
  );
const positionOverridesSchema = z.object({
  matchId: matchIdSchema,
  roles: z.record(
    z.string().regex(/^(?:[0-4]|12[89]|13[0-2])$/),
    z.number().int().min(0).max(5),
  ),
});
export const settingsSchema = z.object({
  theme: z.enum(["ember", "glacier", "paper", "obsidian"]).default("ember"),
  effects: z.enum(["restrained", "arena"]).default("arena"),
  playerVisual: z.enum(["hero", "photo"]).default("hero"),
  accent: colorSchema.default("#ff6138"),
  secondary: colorSchema.default("#50d9ed"),
  brand: z.string().trim().min(1).max(24).default("赛后雷达"),
  headline: z.string().trim().min(1).max(44),
  outro: z.string().trim().max(56).default("下一场，继续见。"),
  pace: z.enum(["snappy", "standard", "relaxed"]).default("standard"),
  captions: z.boolean().default(true),
  mvp: z
    .object({
      enabled: z.boolean().default(false),
      mode: z.enum(["auto", "manual"]).default("auto"),
      manual: z
        .record(matchIdSchema, z.number().int().min(0).max(255))
        .default({}),
    })
    .default({ enabled: false, mode: "auto", manual: {} }),
  scripts: z.array(z.string().trim().max(240)).length(5),
  gameScripts: z
    .record(matchIdSchema, z.array(z.string().trim().max(240)).length(5))
    .optional(),
  resolution: z.enum(["1080", "720", "1440", "2160"]).default("1080"),
  radarMode: z.enum(["positions", "damage", "ranked"]).default("positions"),
  radarPosition: z.enum(["all", "1", "2", "3", "4", "5"]).default("all"),
  positionOverrides: positionOverridesSchema.optional(),
  bgm: z
    .object({
      trackId: z.string().regex(/^[a-f0-9]{64}$/),
      volume: z.number().min(0).max(1).default(0.35),
      loop: z.boolean().default(true),
    })
    .optional(),
});
export type Settings = z.infer<typeof settingsSchema>;
export type BgmTrack = {
  id: string;
  name: string;
  duration: number;
  src: string;
  createdAt: string;
};
export type PlayerData = {
  slot: number;
  name: string;
  hero: string;
  heroId: number;
  image: string;
  artwork?: string;
  playerId?: string;
  playerImage?: string;
  playerArtwork?: string;
  inventory?: PlayerInventory;
  lolLoadout?: {
    spells?: [LolLoadoutIcon | null, LolLoadoutIcon | null];
    runes?: {
      primary: LolLoadoutIcon;
      secondary: LolLoadoutIcon;
      perks: LolLoadoutIcon[];
    };
  };
  side: "radiant" | "dire";
  kills: number;
  deaths: number;
  assists: number;
  gpm?: number;
  xpm?: number;
  damage: number;
  damageTaken?: number;
  totalGold?: number;
  // Denominators from the games this player appeared in, also used for substitutes.
  teamTotals?: { damage: number; damageTaken?: number; totalGold?: number };
  tower?: number;
  lastHits?: number;
  steamId?: string;
  cs?: {
    adr: number;
    kast?: number;
    headshotPercent?: number;
    openingKills?: number;
    utilityDamage?: number;
  };
  positionEstimate?: Position;
  declaredPosition?: Position;
  wardsKilled?: number;
  vision?: number;
  controlWards?: number;
  obs?: number;
  sentries?: number;
  stuns?: number;
  healing?: number;
  // Present only on a series aggregate. Rates use played time and team kills.
  playedGames?: number;
  playedDuration?: number;
  teamKills?: number;
  champions?: { hero: string; image: string; games: number }[];
};
export type LolLoadoutIcon = { id: number; name: string; image?: string };
export type OfficialMvp = {
  // The provider identity must resolve to this exact player's game-local slot.
  playerSlot: number;
  sourceName: string;
  sourceUrl: string;
};
export type MatchData = {
  game?: Game;
  id: string;
  league: string;
  date: string;
  duration: number;
  radiant: string;
  dire: string;
  radiantId?: number;
  direId?: number;
  radiantLogo?: string;
  direLogo?: string;
  logoReview?: { side: "radiant" | "dire"; reason: "ambiguous" | "missing" }[];
  radiantScore: number;
  direScore: number;
  winner: "radiant" | "dire";
  players: PlayerData[];
  gold: { minute: number; value: number }[];
  source: string;
  fetchedAt: string;
  objectives?: { label: string; radiant?: number; dire?: number }[];
  gameNumber?: number;
  patch?: string;
  inventorySource?: {
    url: string;
    fetchedAt: string;
    timestamp?: string;
    scope?: "final";
    quantityMode?: "occupied-slots";
  };
  runeSource?: { url: string; fetchedAt: string; timestamp: string };
  // Only write this after independently matching the official award to the game.
  officialMvp?: OfficialMvp;
  cs?: {
    version: "CS2" | "CSGO";
    map: string;
    filename: string;
    maxRounds: number;
    rounds: {
      number: number;
      radiantScore: number;
      direScore: number;
      winner: "radiant" | "dire";
      radiantSide: "CT" | "T";
      overtime: number;
    }[];
  };
};
export type SeriesDetails = {
  games: Pick<
    MatchData,
    | "id"
    | "date"
    | "gameNumber"
    | "radiant"
    | "dire"
    | "winner"
    | "radiantScore"
    | "direScore"
    | "duration"
    | "source"
    | "fetchedAt"
  >[];
  wins: { radiant: number; dire: number };
  missingGames: number[];
  // Individual totals for damage ranking; report.players contains role totals.
  players: PlayerData[];
};
export type ReportData = Omit<MatchData, "winner"> & {
  // Series winners are determined by game-win totals; equal totals are a draw.
  winner: MatchData["winner"] | null;
  series?: SeriesDetails;
  // Exact source snapshots for a continuous film; never substitute aggregate players.
  fullGames?: MatchData[];
};
export type Segment = {
  text: string;
  frames: number;
  chapterIndex?: number;
  sceneIndex?: number;
};
export type Caption = { text: string; start: number; end: number };
export type VideoProps = {
  match: ReportData;
  settings: Settings;
  segments: Segment[];
  captions: Caption[];
  bgmTrack?: BgmTrack;
  chapters?: VideoChapter[];
};
export type VideoChapter = Omit<VideoProps, "chapters" | "bgmTrack"> & {
  key: string;
  label: string;
  slots: number[];
};

const finite = (value: unknown, field: string, nonnegative = true): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (nonnegative && value < 0)
  ) {
    throw new Error("比赛数据不完整：" + field + " 缺失或无效，请稍后重试。");
  }
  return value;
};
const safeText = (v: unknown, fallback: string) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : fallback;
const optionalStat = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
export function normalizeMatch(
  raw: any,
  heroes: Record<string, any>,
  fetchedAt = new Date().toISOString(),
): MatchData {
  if (!raw || raw.error)
    throw new Error("找不到这场比赛，或 OpenDota 尚未收录。");
  if (!Number.isSafeInteger(raw.match_id) || raw.match_id <= 0)
    throw new Error("比赛编号无效。");
  if (!raw.league?.name || !raw.radiant_team?.name || !raw.dire_team?.name)
    throw new Error("请使用有战队名称的职业比赛编号。");
  if (typeof raw.radiant_win !== "boolean")
    throw new Error("比赛尚未结束，暂不能生成赛后视频。");
  const duration = finite(raw.duration, "比赛时长");
  if (duration < 60 || duration > 21600) throw new Error("比赛时长异常。");
  if (!Array.isArray(raw.players) || raw.players.length !== 10)
    throw new Error("需要完整的十名选手数据。");
  const slots = new Set<number>();
  const players: PlayerData[] = raw.players.map((p: any) => {
    const slot = finite(p.player_slot, "选手位置");
    if (
      ![0, 1, 2, 3, 4, 128, 129, 130, 131, 132].includes(slot) ||
      slots.has(slot)
    )
      throw new Error("选手位置重复或无效。");
    slots.add(slot);
    const heroId = finite(p.hero_id, "英雄");
    const hero = heroes[String(heroId)];
    return {
      slot,
      playerId:
        Number.isSafeInteger(p.account_id) && p.account_id > 0
          ? String(p.account_id)
          : `match:${raw.match_id}:${slot}`,
      name: safeText(
        p.name,
        safeText(p.personaname, "选手 " + ((slot % 128) + 1)),
      ),
      hero: hero?.localized_name || "Hero " + heroId,
      heroId,
      image: "/assets/heroes/" + heroId + ".png",
      side: slot < 128 ? "radiant" : "dire",
      kills: finite(p.kills, "击杀"),
      deaths: finite(p.deaths, "死亡"),
      assists: finite(p.assists, "助攻"),
      gpm: finite(p.gold_per_min, "每分钟经济"),
      xpm: finite(p.xp_per_min, "每分钟经验"),
      damage: finite(p.hero_damage, "英雄伤害"),
      tower: finite(p.tower_damage, "建筑伤害"),
      lastHits: finite(p.last_hits, "补刀"),
      inventory: normalizeDotaInventory(p),
      positionEstimate: POSITIONS.includes(p.position_est)
        ? p.position_est
        : undefined,
      obs: optionalStat(p.obs_placed),
      sentries: optionalStat(p.sen_placed),
      stuns: optionalStat(p.stuns),
      healing: optionalStat(p.hero_healing),
    };
  });
  const adv = raw.radiant_gold_adv;
  if (!Array.isArray(adv) || adv.length < 2)
    throw new Error("这场比赛还没有解析出经济曲线，请等解析完成或换一场比赛。");
  const times = raw.players[0].times;
  if (!Array.isArray(times) || times.length !== adv.length)
    throw new Error("经济曲线与时间轴不匹配，请稍后重试。");
  const gold = adv.map((v: unknown, i: number) => ({
    minute: finite(times[i], "采样时间") / 60,
    value: finite(v, "经济差", false),
  }));
  if (
    gold.some(
      (p, i) =>
        p.minute * 60 > duration + 60 ||
        (i > 0 && p.minute <= gold[i - 1].minute),
    )
  )
    throw new Error("经济曲线时间轴无效。");
  const date = new Date(finite(raw.start_time, "比赛日期") * 1000);
  if (!Number.isFinite(date.getTime())) throw new Error("比赛日期无效。");
  return {
    id: String(raw.match_id),
    league: safeText(raw.league.name, "Dota 2"),
    date: date.toISOString(),
    duration,
    radiant: safeText(raw.radiant_team.name, "天辉"),
    dire: safeText(raw.dire_team.name, "夜魇"),
    radiantId: Number.isSafeInteger(raw.radiant_team.team_id)
      ? raw.radiant_team.team_id
      : undefined,
    direId: Number.isSafeInteger(raw.dire_team.team_id)
      ? raw.dire_team.team_id
      : undefined,
    radiantScore: finite(raw.radiant_score, "天辉人头"),
    direScore: finite(raw.dire_score, "夜魇人头"),
    winner: raw.radiant_win ? "radiant" : "dire",
    players,
    gold,
    source: "https://www.opendota.com/matches/" + raw.match_id,
    fetchedAt,
  };
}
export const matchDuration = (s: number) =>
  Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
export const num = (v: number) => Math.round(v).toLocaleString("en-US");
export const compact = (v: number) =>
  Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : String(Math.round(v));
export const getFocus = (m: ReportData): [PlayerData, PlayerData] => [
  [...(m.series?.players ?? m.players)]
    .filter((p) => p.side === "radiant")
    .sort((a, b) => b.damage - a.damage)[0],
  [...(m.series?.players ?? m.players)]
    .filter((p) => p.side === "dire")
    .sort((a, b) => b.damage - a.damage)[0],
];
export type AssignedPlayer = {
  player: PlayerData;
  position?: Position;
  source: "manual" | "estimate" | "declared" | "unknown";
};
export function assignedPositions(
  m: ReportData,
  s?: Settings,
): AssignedPlayer[] {
  const overrides =
    !m.series && s?.positionOverrides?.matchId === m.id
      ? s.positionOverrides.roles
      : {};
  const assigned = m.players.map((player) => {
    const manual = Object.prototype.hasOwnProperty.call(
      overrides,
      String(player.slot),
    );
    const position = manual
      ? overrides[player.slot] || undefined
      : (player.declaredPosition ?? player.positionEstimate);
    return {
      player,
      position: position as Position | undefined,
      source: position
        ? manual
          ? "manual"
          : player.declaredPosition
            ? "declared"
            : "estimate"
        : "unknown",
    } as AssignedPlayer;
  });
  // An estimate is not a roster declaration. Ambiguous positions stay unresolved.
  return assigned.map((entry) =>
    entry.position &&
    assigned.some(
      (other) =>
        other !== entry &&
        other.player.side === entry.player.side &&
        other.position === entry.position,
    )
      ? { ...entry, position: undefined, source: "unknown" }
      : entry,
  );
}
export type Comparison = {
  key: string;
  label: string;
  position?: Position;
  rank?: number;
  pair?: [PlayerData, PlayerData];
  provenance: string;
};
export function comparisons(m: ReportData, s: Settings): Comparison[] {
  if (s.radarMode === "damage")
    return [
      {
        key: "damage",
        label: "双方伤害最高",
        pair: getFocus(m),
        provenance:
          m.game === "cs2"
            ? "按对敌生命伤害选取"
            : "按英雄总伤害选取 · 不要求同位置",
      },
    ];
  if (m.game === "cs2" && s.radarMode === "ranked") {
    const sides = ["radiant", "dire"].map((side) =>
      m.players.filter((p) => p.side === side).sort(csPlayerOrder),
    );
    return (
      s.radarPosition === "all" ? POSITIONS : [Number(s.radarPosition)]
    ).map((rank) => ({
      key: "rank-" + rank,
      label: "K / D / A 第 " + rank + " 名",
      rank,
      pair: [sides[0][rank - 1], sides[1][rank - 1]] as [
        PlayerData,
        PlayerData,
      ],
      provenance: "击杀多优先，其次死亡少，最后助攻多",
    }));
  }
  const assigned = assignedPositions(m, s);
  const positions =
    s.radarPosition === "all"
      ? POSITIONS
      : [Number(s.radarPosition) as Position];
  return positions.map((position) => {
    const a = assigned.find(
      (x) => x.player.side === "radiant" && x.position === position,
    );
    const b = assigned.find(
      (x) => x.player.side === "dire" && x.position === position,
    );
    return {
      key: String(position),
      label: positionNames(m)[position],
      position,
      pair:
        a && b ? ([a.player, b.player] as [PlayerData, PlayerData]) : undefined,
      provenance:
        !a || !b
          ? "位置未确定 · 请修正对位"
          : a.source === "manual" && b.source === "manual"
            ? "位置：手动指定"
            : m.game === "cs2"
              ? "位置：手动指定"
              : m.game === "lol"
                ? a.source === "declared" && b.source === "declared"
                  ? "位置：Oracle’s Elixir 记录"
                  : "位置：手动指定 / CSV 记录"
                : a.source === "estimate" && b.source === "estimate"
                  ? "位置：OpenDota 估计"
                  : "位置：手动指定 / OpenDota 估计",
    };
  });
}
export function assertComparisons(m: ReportData, s: Settings) {
  const missing = comparisons(m, s).filter((c) => !c.pair);
  if (missing.length)
    throw new Error(
      missing.map((c) => c.label).join("、") +
        "对位不完整。请在位置设置中修正，或选择已确定的位置。",
    );
}
export const participation = (
  m: ReportData,
  player: PlayerData,
): number | undefined => {
  const kills =
    player.teamKills ??
    (player.side === "radiant" ? m.radiantScore : m.direScore);
  return kills > 0
    ? ((player.kills + player.assists) / kills) * 100
    : undefined;
};
export function comparisonScript(m: ReportData, s: Settings) {
  if (m.fullGames?.length === 1) m = m.fullGames[0];
  if (s.radarMode === "damage") {
    const [a, b] = getFocus(m);
    return `双方伤害最高 · ${a.name} vs ${b.name}`;
  }
  if (m.game === "cs2" && s.radarMode === "ranked")
    return s.radarPosition === "all"
      ? "全员选手雷达"
      : comparisons(m, s)[0].label +
          " · " +
          comparisons(m, s)[0]
            .pair?.map((p) => p.name)
            .join(" vs ");
  if (s.radarPosition === "all")
    return m.series ? "系列赛对位雷达" : "全场对位雷达";
  const comparison = comparisons(m, s)[0];
  return (
    comparison.label +
    "对位 · " +
    (comparison.pair?.map((p) => p.name).join(" vs ") || "对位待修正")
  );
}
export function refreshSettings(
  m: ReportData,
  previous: Settings,
  keepOverrides = false,
): Settings {
  const defaults = defaultSettings(m);
  const settings = {
    ...previous,
    playerVisual: m.game === "cs2" ? ("photo" as const) : previous.playerVisual,
    headline: defaults.headline,
    gameScripts: keepOverrides ? previous.gameScripts : undefined,
    scripts: defaults.scripts.map((text, i) =>
      previous.scripts[i].trim() ? text : "",
    ),
    positionOverrides:
      keepOverrides && previous.positionOverrides?.matchId === m.id
        ? previous.positionOverrides
        : undefined,
  };
  if (previous.scripts[2].trim())
    settings.scripts[2] = comparisonScript(m, settings);
  return settings;
}
export const sortedDamage = (m: ReportData) =>
  [...(m.series?.players ?? m.players)].sort((a, b) => b.damage - a.damage);
export type MvpSelection = {
  player: PlayerData;
  kind: "official" | "damage" | "manual";
  sourceName?: string;
  sourceUrl?: string;
};
export function mvpFor(
  match: ReportData,
  settings: Settings,
): MvpSelection | undefined {
  // A series aggregate is not an individual game award, and CS MVP is out of scope.
  if (match.game === "cs2" || match.series || !settings.mvp?.enabled)
    return undefined;
  const manual = settings.mvp.manual[match.id];
  if (settings.mvp.mode === "manual" && manual !== undefined) {
    const player = match.players.find((item) => item.slot === manual);
    if (player) return { player, kind: "manual" };
  }
  if (match.officialMvp) {
    const player = match.players.find(
      (item) => item.slot === match.officialMvp!.playerSlot,
    );
    if (player)
      return {
        player,
        kind: "official",
        sourceName: match.officialMvp.sourceName,
        sourceUrl: match.officialMvp.sourceUrl,
      };
  }
  const player = sortedDamage(match)[0];
  return player ? { player, kind: "damage" } : undefined;
}
export const csPlayerOrder = (a: PlayerData, b: PlayerData) =>
  b.kills - a.kills ||
  a.deaths - b.deaths ||
  b.assists - a.assists ||
  (a.steamId || "").localeCompare(b.steamId || "");
export const rankedPlayers = (m: ReportData) =>
  m.game === "cs2" ? [...m.players].sort(csPlayerOrder) : sortedDamage(m);
export function facts(m: ReportData) {
  const max = m.gold.reduce(
    (a, b) => (b.value > a.value ? b : a),
    m.gold[0] ?? { minute: 0, value: 0 },
  );
  const min = m.gold.reduce(
    (a, b) => (b.value < a.value ? b : a),
    m.gold[0] ?? { minute: 0, value: 0 },
  );
  const winner = m.winner ? m[m.winner] : "双方战平";
  const deficit =
    m.winner === "radiant" ? Math.max(0, -min.value) : Math.max(0, max.value);
  return {
    max,
    min,
    winner,
    deficit,
    top: rankedPlayers(m)[0],
    final: m.gold[m.gold.length - 1],
  };
}
export function defaultSettings(m: ReportData): Settings {
  if (m.fullGames?.length === 1) return defaultSettings(m.fullGames[0]);
  const f = facts(m);
  if (m.cs) {
    const headline = `${f.winner} ${Math.max(m.radiantScore, m.direScore)} : ${Math.min(m.radiantScore, m.direScore)} 拿下 ${m.cs.map}`;
    return settingsSchema.parse({
      theme: "obsidian",
      accent: "#f6c453",
      secondary: "#c4d0e4",
      radarMode: "ranked",
      playerVisual: "photo",
      headline: headline.length <= 44 ? headline : `${m.cs.map} · 地图战报`,
      scripts: [
        `${m.radiant} ${m.radiantScore} : ${m.direScore} ${m.dire}`,
        "",
        "全员选手雷达",
        `击杀第一 · ${f.top.name} · ${f.top.kills} 杀`,
        "",
      ],
    });
  }
  if (m.series) {
    const { wins, missingGames } = m.series;
    const score = `${m.radiant} ${wins.radiant} : ${wins.dire} ${m.dire}`;
    const result = settingsSchema.parse({
      theme: "obsidian",
      accent: "#f6c453",
      secondary: "#c4d0e4",
      headline: score.length <= 44 ? score : "系列赛战报",
      scripts: [
        `${m.winner ? f.winner + " 赢得系列赛" : "系列赛战平"} · ${score}${missingGames.length ? ` · ${gameScope(m)}` : ""}`,
        "",
        "系列赛对位雷达",
        `伤害第一 · ${f.top.name} · ${num(f.top.damage)}`,
        "",
      ],
    });
    result.scripts[2] = comparisonScript(m, result);
    return result;
  }
  const winKills = m.winner === "radiant" ? m.radiantScore : m.direScore;
  const loseKills = m.winner === "radiant" ? m.direScore : m.radiantScore;
  const economic =
    m.game === "lol"
      ? ""
      : f.max.value > 0 && f.min.value < 0
        ? m.radiant +
          " 最大领先 " +
          num(f.max.value) +
          " · " +
          m.dire +
          " 最大领先 " +
          num(-f.min.value)
        : (f.max.value <= 0 ? m.dire : m.radiant) +
          " 最大经济领先 " +
          num(Math.max(Math.abs(f.max.value), Math.abs(f.min.value)));
  const result = settingsSchema.parse({
    ...(m.game === "lol"
      ? { theme: "obsidian", accent: "#f6c453", secondary: "#c4d0e4" }
      : {}),
    headline:
      m.game !== "lol" && f.deficit >= 2000
        ? "落后 " + compact(f.deficit) + "，依然拿下"
        : f.winner + " 拿下胜利",
    scripts: [
      `${f.winner} 获胜 · ${winKills} : ${loseKills} · ${matchDuration(m.duration)}`,
      economic,
      "全场对位雷达",
      `伤害第一 · ${f.top.name} · ${num(f.top.damage)}`,
      "",
    ],
  });
  result.scripts[2] = comparisonScript(m, result);
  return result;
}
export function radar(
  m: ReportData,
  pair: [PlayerData, PlayerData] = getFocus(m),
  position?: Position,
) {
  const [a, b] = pair;
  const axes: {
    label: string;
    a: number | undefined;
    b: number | undefined;
    unit?: string;
  }[] =
    m.game === "cs2"
      ? [
          { label: "击杀", a: a.kills, b: b.kills },
          { label: "ADR", a: a.cs?.adr, b: b.cs?.adr },
          { label: "KAST", a: a.cs?.kast, b: b.cs?.kast, unit: "%" },
          {
            label: "爆头率",
            a: a.cs?.headshotPercent,
            b: b.cs?.headshotPercent,
            unit: "%",
          },
          { label: "首杀", a: a.cs?.openingKills, b: b.cs?.openingKills },
          { label: "道具伤害", a: a.cs?.utilityDamage, b: b.cs?.utilityDamage },
        ]
      : m.game === "lol"
        ? isSupport(m, position)
          ? [
              { label: "助攻", a: a.assists, b: b.assists },
              {
                label: "参团率",
                a: participation(m, a),
                b: participation(m, b),
                unit: "%",
              },
              { label: "视野得分", a: a.vision, b: b.vision },
              { label: "插眼", a: a.obs, b: b.obs },
              { label: "排眼", a: a.wardsKilled, b: b.wardsKilled },
              { label: "真眼购买", a: a.controlWards, b: b.controlWards },
            ]
          : [
              { label: "击杀", a: a.kills, b: b.kills },
              { label: "助攻", a: a.assists, b: b.assists },
              { label: "分均经济", a: a.gpm, b: b.gpm },
              {
                label: "分均补刀",
                a:
                  a.lastHits === undefined
                    ? undefined
                    : a.lastHits / ((a.playedDuration ?? m.duration) / 60),
                b:
                  b.lastHits === undefined
                    ? undefined
                    : b.lastHits / ((b.playedDuration ?? m.duration) / 60),
                unit: " CS",
              },
              {
                label: "分均伤害",
                a: a.damage / ((a.playedDuration ?? m.duration) / 60),
                b: b.damage / ((b.playedDuration ?? m.duration) / 60),
              },
              {
                label: "参团率",
                a: participation(m, a),
                b: participation(m, b),
                unit: "%",
              },
            ]
        : isSupport(m, position)
          ? [
              { label: "助攻", a: a.assists, b: b.assists },
              {
                label: "参战率",
                a: participation(m, a),
                b: participation(m, b),
                unit: "%",
              },
              { label: "观察守卫", a: a.obs, b: b.obs },
              { label: "岗哨守卫", a: a.sentries, b: b.sentries },
              { label: "眩晕时长", a: a.stuns, b: b.stuns, unit: "s" },
              { label: "英雄治疗", a: a.healing, b: b.healing },
            ]
          : [
              { label: "击杀", a: a.kills, b: b.kills },
              { label: "助攻", a: a.assists, b: b.assists },
              { label: "分均经济", a: a.gpm, b: b.gpm },
              { label: "分均经验", a: a.xpm, b: b.xpm },
              {
                label: "分均伤害",
                a: a.damage / ((a.playedDuration ?? m.duration) / 60),
                b: b.damage / ((b.playedDuration ?? m.duration) / 60),
              },
              { label: "建筑伤害", a: a.tower, b: b.tower },
            ];
  return axes.map((x) => ({
    ...x,
    ar:
      x.a === undefined || x.b === undefined
        ? undefined
        : Math.max(x.a, x.b)
          ? x.a / Math.max(x.a, x.b)
          : 0,
    br:
      x.a === undefined || x.b === undefined
        ? undefined
        : Math.max(x.a, x.b)
          ? x.b / Math.max(x.a, x.b)
          : 0,
  }));
}
export const axisValue = (value: number | undefined, unit?: string) =>
  value === undefined ? "—" : unit ? value.toFixed(1) + unit : num(value);
export const totalFrames = (segments: Segment[]) =>
  segments.reduce((s, x) => s + x.frames, 0);
export function captionLines(text: string): string[] {
  const lines: string[] = [];
  // Keep Latin words, decimal values, thousands separators and match times intact.
  const clauses = text.split(/(?<=[，。！？；、!?;])/u);
  for (const clause of clauses) {
    const tokens =
      clause.match(/[A-Za-z][A-Za-z0-9_'`-]*|\d+(?:[,.\d:]*\d)?|\s+|./gu) || [];
    let line = "";
    let width = 0;
    for (const token of tokens) {
      const w = [...token].reduce(
        (n, c) => n + (/[\x00-\x7F]/.test(c) ? 0.55 : 1),
        0,
      );
      if (width + w > 44 && line.trim() && !/^[，。！？；、!?;]$/.test(token)) {
        lines.push(line.trim());
        line = "";
        width = 0;
      }
      line += token;
      width += w;
    }
    if (line.trim()) lines.push(line.trim());
  }
  return lines.length ? lines : [text];
}
export function makeCaptions(segments: Segment[]): Caption[] {
  const result: Caption[] = [];
  let offset = 0;
  segments.forEach((seg) => {
    if (!seg.text.trim()) {
      offset += seg.frames;
      return;
    }
    const pieces = captionLines(seg.text);
    const count = pieces.reduce((s, x) => s + x.length, 0);
    let cursor = offset + 8;
    const available = seg.frames - 20;
    pieces.forEach((text, i) => {
      const end =
        i === pieces.length - 1
          ? offset + seg.frames - 12
          : cursor + Math.round((available * text.length) / count);
      result.push({ text, start: cursor, end });
      cursor = end;
    });
    offset += seg.frames;
  });
  return result;
}
export function previewProps(
  match: ReportData,
  settings: Settings,
  bgmTrack?: BgmTrack,
): VideoProps {
  // Settings can come from older saved projects or a still-running older server.
  settings = settingsSchema.parse(settings);
  if (match.fullGames) return fullVideoProps(match, settings, bgmTrack);
  const groups = comparisons(match, settings);
  const base = [7, 10, groups.length > 1 ? groups.length * 18 : 24, 10, 7];
  const speed = { snappy: 0.82, standard: 1, relaxed: 1.2 }[settings.pace];
  // Keep script slots stable for existing projects; CS has no resource scene.
  const scriptSegments = settings.scripts.map((text, i) =>
    match.game === "cs2" && i === 1
      ? { text: "", frames: 0 }
      : {
          text,
          frames: Math.ceil(
            Math.max(base[i], text.length / 5.5 + 1) * speed * FPS,
          ),
        },
  );
  const captionSegments = scriptSegments.flatMap((segment, i) => {
    if (
      i !== 2 ||
      groups.length === 1 ||
      segment.text !== comparisonScript(match, settings)
    )
      return [segment];
    return groups.map((group, index) => ({
      frames:
        Math.floor((segment.frames * (index + 1)) / groups.length) -
        Math.floor((segment.frames * index) / groups.length),
      text:
        group.label +
        "对位 · " +
        (group.pair?.map((p) => p.name).join(" vs ") || "对位待修正"),
    }));
  });
  if (match.game === "cs2")
    return {
      match,
      settings,
      segments: scriptSegments,
      captions: makeCaptions(captionSegments),
      ...(bgmTrack && settings.bgm?.trackId === bgmTrack.id
        ? { bgmTrack }
        : {}),
    };
  const extra = {
    text: "",
    frames: Math.ceil(10 * speed * FPS),
    sceneIndex: 5,
  };
  const mvp = mvpFor(match, settings)
    ? [{ text: "", frames: Math.ceil(7 * speed * FPS), sceneIndex: 6 }]
    : [];
  // Scripts remain five fixed fields. Extra scenes carry no editable copy.
  const segments = [
    { ...scriptSegments[0], sceneIndex: 0 },
    { ...scriptSegments[1], sceneIndex: 1 },
    { ...scriptSegments[2], sceneIndex: 2 },
    { ...scriptSegments[3], sceneIndex: 3 },
    extra,
    ...mvp,
    { ...scriptSegments[4], sceneIndex: 4 },
  ];
  return {
    match,
    settings,
    segments,
    captions: makeCaptions([
      scriptSegments[0],
      scriptSegments[1],
      ...captionSegments.slice(2, -2),
      scriptSegments[3],
      extra,
      ...mvp,
      scriptSegments[4],
    ]),
    ...(bgmTrack && settings.bgm?.trackId === bgmTrack.id ? { bgmTrack } : {}),
  };
}

function fullVideoProps(
  match: ReportData,
  settings: Settings,
  bgmTrack?: BgmTrack,
): VideoProps {
  const { fullGames, ...summary } = match;
  if (
    !summary.series ||
    !fullGames?.length ||
    fullGames.length !== summary.series.games.length ||
    new Set(fullGames.map((g) => g.id)).size !== fullGames.length
  )
    throw new Error("完整视频缺少逐局数据，请重新载入系列赛。");
  const games = summary.series.games.map((g) => {
    const source = fullGames.find((item) => item.id === g.id);
    if (!source) throw new Error("完整视频的逐局数据与汇总不一致。");
    return source;
  });
  const chapters: VideoChapter[] = [];
  const add = (
    key: string,
    label: string,
    data: ReportData,
    s: Settings,
    slots: number[],
  ) => {
    const { bgmTrack: _music, ...props } = previewProps(data, s);
    chapters.push({ ...props, key, label, slots });
  };
  if (games.length === 1) {
    // The aggregate of one game would repeat the same statistics.
    add(
      games[0].id,
      gameScope(games[0]),
      games[0],
      settings,
      sceneSlots(games[0], settings),
    );
  } else {
    add("opening", "开场", summary, settings, [0]);
    for (const game of games) {
      const local = refreshSettings(game, settings);
      local.scripts = settings.gameScripts?.[game.id] ?? local.scripts;
      // Retain actual blue/red sides and pin each team's color across side swaps.
      if (game.radiant !== summary.radiant) {
        local.accent = settings.secondary;
        local.secondary = settings.accent;
      }
      add(game.id, gameScope(game), game, local, [
        1,
        2,
        3,
        5,
        ...(mvpFor(game, local) ? [6] : []),
      ]);
    }
    add("summary", "系列赛汇总", summary, settings, [1, 2, 3, 5, 4]);
  }
  const segments: Segment[] = [];
  const captions: Caption[] = [];
  let offset = 0;
  chapters.forEach((chapter, chapterIndex) => {
    chapter.slots.forEach((sceneIndex) => {
      const segmentIndex = chapter.segments.findIndex(
        (segment, index) => (segment.sceneIndex ?? index) === sceneIndex,
      );
      const segment = chapter.segments[segmentIndex];
      if (!segment) throw new Error("完整视频缺少场景数据，请重新载入比赛。");
      const localStart = totalFrames(chapter.segments.slice(0, segmentIndex));
      for (const caption of chapter.captions) {
        if (
          caption.start >= localStart &&
          caption.end <= localStart + segment.frames
        )
          captions.push({
            ...caption,
            start: caption.start - localStart + offset,
            end: caption.end - localStart + offset,
          });
      }
      segments.push({ ...segment, chapterIndex, sceneIndex });
      offset += segment.frames;
    });
  });
  return {
    match,
    settings,
    chapters,
    segments,
    captions,
    ...(bgmTrack && settings.bgm?.trackId === bgmTrack.id ? { bgmTrack } : {}),
  };
}

// Used by preview navigation and export metadata; legacy five-slot projects stay valid.
export function videoScenes(props: VideoProps) {
  let start = 0;
  return props.segments.flatMap((segment, index) => {
    const from = start;
    start += segment.frames;
    if (!segment.frames) return [];
    const chapter = props.chapters?.[segment.chapterIndex ?? 0];
    const local = chapter ?? props;
    const slot = segment.sceneIndex ?? index;
    return [
      {
        index,
        slot,
        from,
        frames: segment.frames,
        chapterIndex: segment.chapterIndex,
        chapter,
        match: local.match,
        settings: local.settings,
        name: sceneNames(local.match, local.settings)[
          sceneSlots(local.match, local.settings).indexOf(slot)
        ],
      },
    ];
  });
}
export function bgmVolume(
  frame: number,
  total: number,
  duration: number,
  bgm: NonNullable<Settings["bgm"]>,
) {
  const end = bgm.loop ? total : Math.min(total, Math.ceil(duration * FPS));
  const fade = Math.min(FPS * 1.5, end / 2);
  return (
    bgm.volume *
    Math.max(0, Math.min(1, frame / fade, (end - 1 - frame) / fade))
  );
}
export function srt(captions: Caption[]) {
  const time = (frames: number) => {
    const ms = Math.round((frames / FPS) * 1000);
    return (
      [
        Math.floor(ms / 3600000),
        Math.floor(ms / 60000) % 60,
        Math.floor(ms / 1000) % 60,
      ]
        .map((x) => String(x).padStart(2, "0"))
        .join(":") +
      "," +
      String(ms % 1000).padStart(3, "0")
    );
  };
  return captions
    .map(
      (c, i) =>
        String(i + 1) +
        "\n" +
        time(c.start) +
        " --> " +
        time(c.end) +
        "\n" +
        c.text +
        "\n",
    )
    .join("\n");
}
