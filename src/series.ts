import { MatchData, PlayerData, POSITIONS, ReportData } from "./domain";

export type LolSummary = Pick<
  MatchData,
  "id" | "league" | "date" | "radiant" | "dire" | "gameNumber"
>;
export type LolMediaSummary = LolSummary & {
  players?: { playerId?: string; name: string; team: string }[];
};
export type LolSeries = {
  id: string;
  league: string;
  date: string;
  teams: [string, string];
  games: LolSummary[];
};

// OE has no universal series ID. Group adjacent numbered games for the same teams;
// a reset/repeat of the game number or an eight-hour gap starts another meeting.
// This describes available games only, never infers a BO format or series winner.
export function groupLolSeries(matches: LolSummary[]): LolSeries[] {
  const result: LolSeries[] = [],
    latest = new Map<string, LolSeries>();
  for (const match of [...matches].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || (a.gameNumber || 0) - (b.gameNumber || 0),
  )) {
    const teams = [match.radiant, match.dire].sort() as [string, string];
    const key = JSON.stringify([match.league, teams]);
    const previous = latest.get(key),
      last = previous?.games.at(-1);
    if (
      previous &&
      last?.gameNumber &&
      match.gameNumber &&
      match.gameNumber > last.gameNumber &&
      Date.parse(match.date) - Date.parse(last.date) <= 8 * 3600000
    ) {
      previous.games.push(match);
    } else {
      const series = {
        id: match.id,
        league: match.league,
        date: match.date,
        teams,
        games: [match],
      };
      result.push(series);
      latest.set(key, series);
    }
  }
  return result.sort((a, b) => b.date.localeCompare(a.date));
}

type Entry = { player: PlayerData; game: MatchData };
const sum = (values: (number | undefined)[]) =>
  values.every((v) => v !== undefined)
    ? (values as number[]).reduce((a, b) => a + b, 0)
    : undefined;

function totalPlayer(
  entries: Entry[],
  side: PlayerData["side"],
  slot: number,
): PlayerData {
  const duration = entries.reduce((n, e) => n + e.game.duration, 0);
  const champions = new Map<string, { player: PlayerData; games: number }>();
  for (const { player } of entries) {
    const champion = champions.get(player.hero) || { player, games: 0 };
    champion.games++;
    champions.set(player.hero, champion);
  }
  const picks = [...champions.values()].sort((a, b) => b.games - a.games);
  const main = picks[0].player;
  const positions = new Set(entries.map((e) => e.player.declaredPosition));
  const identities = new Set(entries.map((e) => e.player.playerId));
  const singlePlayer = identities.size === 1 && Boolean(main.playerId);
  const values = (key: keyof PlayerData) =>
    entries.map((e) => e.player[key] as number | undefined);
  return {
    slot,
    side,
    name: [...new Set(entries.map((e) => e.player.name))].join(" / "),
    hero: `${entries.length} 局 · ${picks.length} 名英雄`,
    heroId: main.heroId,
    image: main.image,
    artwork: main.artwork,
    playerId: singlePlayer ? main.playerId : undefined,
    playerImage: singlePlayer ? main.playerImage : undefined,
    playerArtwork: singlePlayer ? main.playerArtwork : undefined,
    champions: picks.map((p) => ({
      hero: p.player.hero,
      image: p.player.image,
      games: p.games,
    })),
    declaredPosition: positions.size === 1 ? main.declaredPosition : undefined,
    playedGames: entries.length,
    playedDuration: duration,
    teamKills: entries.reduce(
      (n, e) =>
        n +
        (e.player.side === "radiant" ? e.game.radiantScore : e.game.direScore),
      0,
    ),
    kills: sum(values("kills"))!,
    deaths: sum(values("deaths"))!,
    assists: sum(values("assists"))!,
    damage: sum(values("damage"))!,
    damageTaken: sum(values("damageTaken")),
    totalGold: sum(values("totalGold")),
    teamTotals: {
      damage: sum(entries.map((e) => e.player.teamTotals?.damage))!,
      damageTaken: sum(entries.map((e) => e.player.teamTotals?.damageTaken)),
      totalGold: sum(entries.map((e) => e.player.teamTotals?.totalGold)),
    },
    lastHits: sum(values("lastHits"))!,
    gpm:
      entries.reduce((n, e) => n + e.player.gpm! * e.game.duration, 0) /
      duration,
    obs: sum(values("obs")),
    wardsKilled: sum(values("wardsKilled")),
    vision: sum(values("vision")),
    controlWards: sum(values("controlWards")),
  };
}

// A report is explicitly marked as a series. Team identity survives blue/red swaps;
// same-position totals and individual rankings are kept separate for substitutions.
export function summarizeLolSeries(input: MatchData[]): ReportData {
  if (
    !input.length ||
    input.some((g) => g.game !== "lol") ||
    new Set(input.map((g) => g.id)).size !== input.length
  )
    throw new Error("系列赛需要不重复的英雄联盟比赛。");
  const groups = groupLolSeries(input);
  if (groups.length !== 1) throw new Error("这些比赛不属于同一组系列赛。");
  const games = groups[0].games.map((g) => input.find((m) => m.id === g.id)!);
  const first = games[0];
  const wins = { radiant: 0, dire: 0 };
  const players: PlayerData[] = [],
    individuals: PlayerData[] = [];
  const sideInGame = (g: MatchData, side: PlayerData["side"]) =>
    g.radiant === first[side] ? "radiant" : "dire";
  for (const side of ["radiant", "dire"] as const) {
    const entries = games.flatMap((game) =>
      game.players
        .filter((p) => p.side === sideInGame(game, side))
        .map((player) => ({ game, player })),
    );
    for (const position of POSITIONS) {
      const role = entries.filter(
        (e) => e.player.declaredPosition === position,
      );
      if (role.length !== games.length)
        throw new Error("系列赛中有选手位置缺失或重复，无法汇总对位。");
      players.push(
        totalPlayer(role, side, (side === "radiant" ? 0 : 128) + position - 1),
      );
    }
    for (const name of new Set(entries.map((e) => e.player.name))) {
      individuals.push(
        totalPlayer(
          entries.filter((e) => e.player.name === name),
          side,
          1000 + individuals.length,
        ),
      );
    }
    wins[side] = games.filter((g) => g[g.winner] === first[side]).length;
  }
  const numbered = games.flatMap((g) => (g.gameNumber ? [g.gameNumber] : []));
  const missingGames = Array.from(
    { length: Math.max(0, ...numbered) },
    (_, i) => i + 1,
  ).filter((n) => !numbered.includes(n));
  const score = (side: PlayerData["side"]) =>
    games.reduce(
      (n, g) =>
        n + (sideInGame(g, side) === "radiant" ? g.radiantScore : g.direScore),
      0,
    );
  const objectives = [
    ...new Set(games.flatMap((g) => g.objectives?.map((o) => o.label) || [])),
  ].map((label) => ({
    label,
    radiant: sum(
      games.map(
        (g) =>
          g.objectives?.find((o) => o.label === label)?.[
            sideInGame(g, "radiant")
          ],
      ),
    ),
    dire: sum(
      games.map(
        (g) =>
          g.objectives?.find((o) => o.label === label)?.[sideInGame(g, "dire")],
      ),
    ),
  }));
  return {
    game: "lol",
    id: first.id,
    date: first.date,
    league: first.league,
    radiant: first.radiant,
    dire: first.dire,
    radiantLogo: first.radiantLogo,
    direLogo: first.direLogo,
    logoReview: first.logoReview,
    duration: games.reduce((n, g) => n + g.duration, 0),
    radiantScore: score("radiant"),
    direScore: score("dire"),
    winner:
      wins.radiant === wins.dire
        ? null
        : wins.radiant > wins.dire
          ? "radiant"
          : "dire",
    players,
    gold: [],
    objectives,
    source: first.source,
    fetchedAt: games
      .map((g) => g.fetchedAt)
      .sort()
      .at(-1)!,
    series: {
      wins,
      missingGames,
      players: individuals,
      games: games.map(
        ({
          id,
          date,
          gameNumber,
          radiant,
          dire,
          winner,
          radiantScore,
          direScore,
          duration,
          source,
          fetchedAt,
        }) => ({
          id,
          date,
          gameNumber,
          radiant,
          dire,
          winner,
          radiantScore,
          direScore,
          duration,
          source,
          fetchedAt,
        }),
      ),
    },
  };
}
