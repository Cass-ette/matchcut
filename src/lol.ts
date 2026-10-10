import { MatchData, PlayerData, Position, matchIdSchema } from "./domain";

export type OracleRow = Record<string, string>;
export type ChampionCatalog = {
  version: string;
  data: Record<string, { id: string; key: string; name: string }>;
};
export const LOL_PROVIDER = "https://oracleselixir.com/tools/downloads";
export const LOL_ROLES = { top: 1, jng: 2, mid: 3, bot: 4, sup: 5 } as const;

function number(
  row: OracleRow,
  field: string,
  optional = false,
): number | undefined {
  const raw = row[field]?.trim();
  if (optional && (!raw || raw === "NA")) return undefined;
  const value = raw ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${field} 缺失或无效`);
  return value;
}
function required(row: OracleRow, field: string): string {
  const value = row[field]?.trim();
  if (!value || value.length > 120) throw new Error(`${field} 缺失或过长`);
  return value;
}
const canonical = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export function championFor(name: string, catalog: ChampionCatalog) {
  return Object.values(catalog.data).find(
    (c) =>
      canonical(c.name) === canonical(name) ||
      canonical(c.id) === canonical(name),
  );
}

// OE positions are recorded roles. They are never inferred from row order or damage.
export function normalizeLol(
  rows: OracleRow[],
  catalog: ChampionCatalog,
  fetchedAt = new Date().toISOString(),
): MatchData {
  if (rows.length !== 12)
    throw new Error("需要同一局的十名选手和两行战队数据（共 12 行）");
  const first = rows[0];
  const sourceId = required(first, "gameid");
  const id = matchIdSchema.parse("lol-" + sourceId);
  const duration = number(first, "gamelength")!;
  if (duration < 60 || duration > 21600) throw new Error("比赛时长异常");
  const dateText = required(first, "date");
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?$/.test(dateText))
    throw new Error("比赛日期格式无效");
  const date = new Date(dateText.replace(" ", "T").replace(/Z?$/, "Z"));
  if (!Number.isFinite(date.getTime())) throw new Error("比赛日期无效");
  const league = required(first, "league");
  const gameNumber = number(first, "game", true);
  if (
    gameNumber !== undefined &&
    (!Number.isInteger(gameNumber) || gameNumber < 1 || gameNumber > 15)
  )
    throw new Error("局数必须是 1–15 的整数");
  for (const row of rows) {
    if (
      row.gameid !== sourceId ||
      row.gamelength !== first.gamelength ||
      row.date !== first.date ||
      row.league !== league ||
      row.game !== first.game
    )
      throw new Error("同局数据不一致");
    if (!["Blue", "Red"].includes(row.side) || !["0", "1"].includes(row.result))
      throw new Error("阵营或赛果无效");
  }
  const teams = rows.filter((r) => r.position === "team");
  const blue = teams.find((r) => r.side === "Blue"),
    red = teams.find((r) => r.side === "Red");
  if (teams.length !== 2 || !blue || !red || blue.result === red.result)
    throw new Error("双方战队或赛果不完整");
  const players: PlayerData[] = rows
    .filter((r) => r.position !== "team")
    .map((row) => {
      const role = LOL_ROLES[row.position as keyof typeof LOL_ROLES] as
        Position | undefined;
      if (!role) throw new Error("未知选手位置：" + row.position);
      const team = row.side === "Blue" ? blue : red;
      if (
        row.teamname !== team.teamname ||
        row.result !== team.result ||
        number(row, "teamkills") !== number(team, "kills")
      )
        throw new Error("选手与战队数据不一致");
      const champion = required(row, "champion"),
        known = championFor(champion, catalog);
      const kills = number(row, "kills")!,
        assists = number(row, "assists")!;
      if (kills + assists > number(team, "kills")!)
        throw new Error("选手参团数据超过战队击杀");
      return {
        slot: (row.side === "Blue" ? 0 : 128) + role - 1,
        name: required(row, "playername"),
        playerId:
          row.playerid?.trim() && row.playerid !== "NA"
            ? row.playerid.trim()
            : `match:${id}:${row.side}:${role}`,
        hero: champion,
        heroId: known ? Number(known.key) : 0,
        image: "/assets/lol/placeholder.svg", // server attaches verified cached assets
        side: row.side === "Blue" ? "radiant" : "dire",
        declaredPosition: role,
        kills,
        deaths: number(row, "deaths")!,
        assists,
        gpm: number(row, "totalgold")! / (duration / 60),
        damage: number(row, "damagetochampions")!,
        damageTaken:
          number(row, "damagetakenperminute", true) === undefined
            ? undefined
            : (number(row, "damagetakenperminute", true)! * duration) / 60,
        totalGold: number(row, "totalgold")!,
        lastHits: number(row, "total cs")!,
        obs: number(row, "wardsplaced", true),
        wardsKilled: number(row, "wardskilled", true),
        vision: number(row, "visionscore", true),
        controlWards: number(row, "controlwardsbought", true),
      };
    });
  if (new Set(players.map((p) => p.slot)).size !== 10)
    throw new Error("选手位置重复或缺失");
  for (const [side, team] of [
    ["radiant", blue],
    ["dire", red],
  ] as const) {
    const sidePlayers = players.filter((p) => p.side === side);
    const total = (key: "damage" | "damageTaken" | "totalGold") =>
      sidePlayers.every((p) => p[key] !== undefined)
        ? sidePlayers.reduce((n, p) => n + p[key]!, 0)
        : undefined;
    for (const p of sidePlayers)
      p.teamTotals = {
        damage: total("damage")!,
        damageTaken: total("damageTaken"),
        totalGold: total("totalGold"),
      };
    if (
      sidePlayers.reduce((sum, p) => sum + p.kills, 0) !==
        number(team, "kills") ||
      sidePlayers.reduce((sum, p) => sum + p.deaths, 0) !==
        number(team, "deaths")
    )
      throw new Error("击杀 / 死亡数据不一致");
  }
  return {
    game: "lol",
    id,
    league,
    date: date.toISOString(),
    duration,
    radiant: required(blue, "teamname"),
    dire: required(red, "teamname"),
    radiantScore: number(blue, "kills")!,
    direScore: number(red, "kills")!,
    winner: blue.result === "1" ? "radiant" : "dire",
    players,
    gold: [], // CSV checkpoints are not a continuous economy timeline.
    objectives: [
      ["totalgold", "总经济"],
      ["dragons", "小龙"],
      ["barons", "大龙"],
      ["towers", "摧毁防御塔"],
    ].map(([key, label]) => ({
      label,
      radiant: number(blue, key, true),
      dire: number(red, key, true),
    })),
    source: LOL_PROVIDER,
    fetchedAt,
    gameNumber,
    patch: first.patch || undefined,
  };
}
