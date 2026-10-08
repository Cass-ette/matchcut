import { z } from "zod";

export const FPS = 30;
export const DEFAULT_MATCH = "9035078952";
export const SCENES = [
  "赛果开场",
  "经济走势",
  "选手雷达",
  "伤害排行",
  "赛后定格",
] as const;
export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const settingsSchema = z.object({
  theme: z.enum(["ember", "glacier", "paper"]).default("ember"),
  accent: colorSchema.default("#ff8652"),
  secondary: colorSchema.default("#76d6c7"),
  brand: z.string().trim().min(1).max(24).default("赛后一分钟"),
  headline: z.string().trim().min(1).max(44),
  outro: z.string().trim().max(56).default("数据看比赛，下一场见。"),
  pace: z.enum(["snappy", "standard", "relaxed"]).default("standard"),
  captions: z.boolean().default(true),
  scripts: z.array(z.string().trim().min(1).max(240)).length(5),
  resolution: z.enum(["1080", "720"]).default("1080"),
});
export type Settings = z.infer<typeof settingsSchema>;
export type PlayerData = {
  slot: number;
  name: string;
  hero: string;
  heroId: number;
  image: string;
  side: "radiant" | "dire";
  kills: number;
  deaths: number;
  assists: number;
  gpm: number;
  xpm: number;
  damage: number;
  tower: number;
  lastHits: number;
};
export type MatchData = {
  id: string;
  league: string;
  date: string;
  duration: number;
  radiant: string;
  dire: string;
  radiantId?: number;
  direId?: number;
  radiantScore: number;
  direScore: number;
  winner: "radiant" | "dire";
  players: PlayerData[];
  gold: { minute: number; value: number }[];
  source: string;
  fetchedAt: string;
};
export type Segment = { text: string; frames: number };
export type Caption = { text: string; start: number; end: number };
export type VideoProps = {
  match: MatchData;
  settings: Settings;
  segments: Segment[];
  captions: Caption[];
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
export const getFocus = (m: MatchData): [PlayerData, PlayerData] => [
  [...m.players]
    .filter((p) => p.side === "radiant")
    .sort((a, b) => b.damage - a.damage)[0],
  [...m.players]
    .filter((p) => p.side === "dire")
    .sort((a, b) => b.damage - a.damage)[0],
];
export const sortedDamage = (m: MatchData) =>
  [...m.players].sort((a, b) => b.damage - a.damage);
export function facts(m: MatchData) {
  const max = m.gold.reduce((a, b) => (b.value > a.value ? b : a));
  const min = m.gold.reduce((a, b) => (b.value < a.value ? b : a));
  const winner = m[m.winner];
  const deficit =
    m.winner === "radiant" ? Math.max(0, -min.value) : Math.max(0, max.value);
  return {
    max,
    min,
    winner,
    deficit,
    top: sortedDamage(m)[0],
    final: m.gold[m.gold.length - 1],
  };
}
export function defaultSettings(m: MatchData): Settings {
  const f = facts(m);
  const [a, b] = getFocus(m);
  const winKills = m.winner === "radiant" ? m.radiantScore : m.direScore;
  const loseKills = m.winner === "radiant" ? m.direScore : m.radiantScore;
  const economic =
    f.max.value > 0 && f.min.value < 0
      ? "经济优势曾易手。天辉最大领先 " +
        num(f.max.value) +
        "，夜魇最大领先 " +
        num(-f.min.value) +
        "。"
      : (f.max.value <= 0 ? m.dire : m.radiant) +
        "在经济采样中保持优势。最大的经济差达到" +
        num(Math.max(Math.abs(f.max.value), Math.abs(f.min.value))) +
        "。";
  return settingsSchema.parse({
    headline:
      f.deficit >= 2000
        ? "落后 " + compact(f.deficit) + "，依然拿下"
        : f.winner + " 拿下胜利",
    scripts: [
      matchDuration(m.duration) +
        "，" +
        f.winner +
        " 拿下胜利。人头比 " +
        winKills +
        " : " +
        loseKills +
        "。",
      economic,
      a.name +
        " 与 " +
        b.name +
        "：双方伤害最高选手的本场对比。各轴为相对数值，非能力评分。",
      f.top.name +
        " 打出 " +
        num(f.top.damage) +
        " 点英雄伤害，全场第一。输出量不等于全部贡献。",
      "本局胜者：" + f.winner + "。数据看比赛，下一场见。",
    ],
  });
}
export function radar(m: MatchData) {
  const [a, b] = getFocus(m);
  const axes = [
    { label: "击杀", a: a.kills, b: b.kills },
    { label: "助攻", a: a.assists, b: b.assists },
    { label: "经济 / 分", a: a.gpm, b: b.gpm },
    { label: "经验 / 分", a: a.xpm, b: b.xpm },
    {
      label: "伤害 / 分",
      a: a.damage / (m.duration / 60),
      b: b.damage / (m.duration / 60),
    },
    { label: "建筑伤害", a: a.tower, b: b.tower },
  ];
  return axes.map((x) => ({
    ...x,
    ar: Math.max(x.a, x.b) ? x.a / Math.max(x.a, x.b) : 0,
    br: Math.max(x.a, x.b) ? x.b / Math.max(x.a, x.b) : 0,
  }));
}
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
      if (width + w > 21 && line.trim() && !/^[，。！？；、!?;]$/.test(token)) {
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
export function previewProps(match: MatchData, settings: Settings): VideoProps {
  const base = [6, 9, 11, 9, 6];
  const speed = { snappy: 0.82, standard: 1, relaxed: 1.2 }[settings.pace];
  const segments = settings.scripts.map((text, i) => ({
    text,
    frames: Math.ceil(Math.max(base[i], text.length / 5.5 + 1) * speed * FPS),
  }));
  return { match, settings, segments, captions: makeCaptions(segments) };
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
