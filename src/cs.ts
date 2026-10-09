import { z } from "zod";
import { type MatchData, type PlayerData, matchIdSchema } from "./domain";

const count = z.number().int().nonnegative().max(1_000_000);
const name = z.string().trim().min(1).max(100);
const team = z.object({ name, letter: z.enum(["A", "B"]), score: count });
// Select only the statistics used by the report. The full analyzer output is
// archived separately, including its version and the original demo hash.
export const csRawSchema = z.object({
  game: z.enum(["CS2", "CSGO"]),
  mapName: z.string().regex(/^[A-Za-z0-9_/-]{1,80}$/),
  duration: z.number().finite().positive(), // Go time.Duration: nanoseconds.
  maxRounds: z
    .number()
    .int()
    .min(2)
    .max(60)
    .refine((n) => n % 2 === 0),
  teamA: team,
  teamB: team,
  winner: team,
  players: z.record(
    z.string().regex(/^\d{17}$/),
    z.object({
      name,
      team,
      killCount: count,
      deathCount: count,
      assistCount: count,
      healthDamage: count,
      headshotCount: count.optional(),
      kast: z.number().finite().min(0).max(100).optional(),
      firstKillCount: count.optional(),
      utilityDamage: count.optional(),
    }),
  ),
  rounds: z
    .array(
      z.object({
        number: count,
        teamAName: name,
        teamBName: name,
        teamAScore: count,
        teamBScore: count,
        teamASide: z.union([z.literal(2), z.literal(3)]),
        teamBSide: z.union([z.literal(2), z.literal(3)]),
        winnerSide: z.union([z.literal(2), z.literal(3)]),
        winnerName: name,
        overtimeNumber: count,
      }),
    )
    .min(1)
    .max(150),
});
export type CsRaw = z.infer<typeof csRawSchema>;
export type CsSnapshot = {
  id: string;
  filename: string;
  fetchedAt: string;
  analyzerVersion: string;
  sha256?: string;
  source?: string;
  league?: string;
  raw: unknown;
};
export type CsSummary = Pick<
  MatchData,
  "id" | "radiant" | "dire" | "radiantScore" | "direScore" | "fetchedAt"
> & {
  map: string;
  filename: string;
  players: { steamId: string; name: string }[];
};

export function normalizeCs(snapshot: CsSnapshot): MatchData {
  matchIdSchema.parse(snapshot.id);
  if (!snapshot.id.startsWith("cs2-")) throw new Error("不是 CS 比赛编号。");
  const parsed = csRawSchema.safeParse(snapshot.raw);
  if (!parsed.success)
    throw new Error(
      "CS 数据不完整：" +
        parsed.error.issues
          .slice(0, 3)
          .map((i) => i.path.join("."))
          .join("、"),
    );
  const m = parsed.data;
  const fail = (message: string): never => {
    throw new Error(message);
  };
  if (
    m.teamA.letter !== "A" ||
    m.teamB.letter !== "B" ||
    m.teamA.name === m.teamB.name
  )
    fail("CS 战队身份重复或不明确，无法在换边后正确统计。");
  let a = 0,
    b = 0;
  const rounds: NonNullable<MatchData["cs"]>["rounds"] = m.rounds.map(
    (r, i) => {
      const wonA = r.winnerSide === r.teamASide;
      if (
        r.number !== i + 1 ||
        r.teamASide === r.teamBSide ||
        r.teamAName !== m.teamA.name ||
        r.teamBName !== m.teamB.name ||
        r.winnerName !== (wonA ? m.teamA.name : m.teamB.name)
      )
        fail("CS 回合缺失、重复或换边后的战队身份不一致。");
      wonA ? a++ : b++;
      if (r.teamAScore !== a || r.teamBScore !== b)
        fail("CS 回合比分不连续，不能用片段生成完整赛后战报。");
      return {
        number: r.number,
        radiantScore: a,
        direScore: b,
        winner: wonA ? "radiant" : "dire",
        radiantSide: r.teamASide === 3 ? "CT" : "T",
        overtime: r.overtimeNumber,
      };
    },
  );
  if (a !== m.teamA.score || b !== m.teamB.score)
    fail("CS 最终比分与回合记录不一致。");
  const winner = a > b ? "radiant" : "dire";
  const won = winner === "radiant" ? m.teamA : m.teamB;
  if (
    a === b ||
    m.winner.letter !== won.letter ||
    m.winner.name !== won.name ||
    m.winner.score !== won.score
  )
    fail("CS 胜者与比分不一致，或比赛尚未分出胜负。");
  const half = m.maxRounds / 2;
  const overtime = rounds.at(-1)!.overtime;
  // Support standard regulation and MR3 overtime; reject interrupted demos,
  // surrendered games and unknown overtime formats rather than invent a result.
  if (
    won.score !== half + overtime * 3 + 1 ||
    Math.min(a, b) > half + overtime * 3 - 1 ||
    (overtime > 0 && Math.min(a, b) < half + (overtime - 1) * 3)
  )
    fail(
      "Demo 未包含常规赛制的完整终局（或不是 MR3 加时），请导入完整的 5v5 比赛。",
    );
  const entries = Object.entries(m.players).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  if (
    entries.length !== 10 ||
    ["A", "B"].some(
      (letter) =>
        entries.filter(([, p]) => p.team.letter === letter).length !== 5,
    )
  )
    fail(
      "需要完整的 5v5 十名选手数据，暂不支持替补、机器人或多人混战的 Demo。",
    );
  const slots = { A: 0, B: 128 };
  const players: PlayerData[] = entries.map(([steamId, p]) => {
    const t = p.team.letter === "A" ? m.teamA : m.teamB;
    if (
      p.team.name !== t.name ||
      p.team.score !== t.score ||
      (p.headshotCount ?? 0) > p.killCount ||
      (p.utilityDamage ?? 0) > p.healthDamage ||
      (p.firstKillCount ?? 0) > p.killCount
    )
      fail("CS 选手统计或战队归属不一致。");
    return {
      slot: slots[p.team.letter]++,
      steamId,
      playerId: steamId,
      name: p.name,
      hero: m.mapName.replace(/^de_/, ""),
      heroId: 0,
      image: "",
      side: p.team.letter === "A" ? "radiant" : "dire",
      kills: p.killCount,
      deaths: p.deathCount,
      assists: p.assistCount,
      damage: p.healthDamage,
      cs: {
        adr: p.healthDamage / rounds.length,
        kast: p.kast,
        headshotPercent:
          p.headshotCount === undefined || p.killCount === 0
            ? undefined
            : (p.headshotCount / p.killCount) * 100,
        openingKills: p.firstKillCount,
        utilityDamage: p.utilityDamage,
      },
    };
  });
  const duration = m.duration / 1e9;
  if (duration < 60 || duration > 24 * 3600) fail("CS 比赛时长异常。");
  return {
    game: "cs2",
    id: snapshot.id,
    league: snapshot.league || "CS · 本地 Demo",
    date: "",
    duration,
    radiant: m.teamA.name,
    dire: m.teamB.name,
    radiantScore: a,
    direScore: b,
    winner,
    players,
    gold: [],
    source: snapshot.source || "/api/cs/source/" + snapshot.id,
    fetchedAt: snapshot.fetchedAt,
    cs: {
      version: m.game,
      map: m.mapName.replace(/^de_/, ""),
      filename: snapshot.filename,
      maxRounds: m.maxRounds,
      rounds,
    },
  };
}

export const summarizeCs = (m: MatchData): CsSummary => ({
  id: m.id,
  radiant: m.radiant,
  dire: m.dire,
  radiantScore: m.radiantScore,
  direScore: m.direScore,
  fetchedAt: m.fetchedAt,
  map: m.cs!.map,
  filename: m.cs!.filename,
  players: m.players.map((p) => ({ steamId: p.steamId!, name: p.name })),
});
