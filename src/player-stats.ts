import { participation, type PlayerData, type ReportData } from "./domain";

export const share = (value: number | undefined, total: number | undefined) =>
  value === undefined || total === undefined || total <= 0
    ? undefined
    : (100 * value) / total;

export function playerShares(match: ReportData, player: PlayerData) {
  const team = match.players.filter((p) => p.side === player.side);
  const total = (key: "damage" | "damageTaken" | "totalGold") => {
    if (player.teamTotals) return player.teamTotals[key];
    // Older saved reports may not carry denominators. Do not infer them for substitutes.
    if (
      player.playedGames ||
      team.length !== 5 ||
      team.some((p) => p[key] === undefined)
    )
      return undefined;
    return team.reduce((n, p) => n + p[key]!, 0);
  };
  return {
    damage: share(player.damage, total("damage")),
    damageTaken: share(player.damageTaken, total("damageTaken")),
    gold: share(player.totalGold, total("totalGold")),
  };
}

// Every role sees the same metrics. Role-specific emphasis belongs to the radar.
export function playerStats(match: ReportData, p: PlayerData) {
  const minutes = (p.playedDuration ?? match.duration) / 60;
  const shares = playerShares(match, p);
  const rate = (value: number | undefined) =>
    value === undefined || minutes <= 0 ? undefined : value / minutes;
  const number = (
    label: string,
    value: number | undefined,
    decimal = false,
  ) => ({
    label,
    value:
      value === undefined
        ? "—"
        : decimal
          ? value.toFixed(1)
          : Math.round(value).toLocaleString("en-US"),
  });
  const percent = (label: string, value: number | undefined) => ({
    label,
    value: value === undefined ? "—" : value.toFixed(1) + "%",
  });
  const common = [
    { label: "K / D / A", value: `${p.kills} / ${p.deaths} / ${p.assists}` },
    percent(
      match.game === "lol" ? "参团率" : "参战率",
      participation(match, p),
    ),
  ];
  if (match.game === "cs2")
    return [
      common[0],
      number("ADR", p.cs?.adr, true),
      percent("KAST", p.cs?.kast),
      percent("爆头率", p.cs?.headshotPercent),
      number("首杀", p.cs?.openingKills),
      number("伤害", p.damage),
      number("道具伤害", p.cs?.utilityDamage),
    ];
  if (match.game === "lol")
    return [
      ...common,
      number("补刀", p.lastHits),
      number("分均补刀", rate(p.lastHits), true),
      number("伤害", p.damage),
      number("分均伤害", rate(p.damage)),
      percent("伤害占比", shares.damage),
      number("承伤", p.damageTaken),
      percent("承伤占比", shares.damageTaken),
      number("总经济", p.totalGold),
      number("分均经济", p.gpm),
      percent("经济占比", shares.gold),
      number("视野得分", p.vision),
      number("插眼", p.obs),
      number("排眼", p.wardsKilled),
      number("真眼购买", p.controlWards),
    ];
  return [
    ...common,
    number("伤害", p.damage),
    percent("伤害占比", shares.damage),
    number("分均伤害", rate(p.damage)),
    number("分均经济", p.gpm),
    number("分均经验", p.xpm),
    number("补刀", p.lastHits),
    number("建筑伤害", p.tower),
    number("观察守卫", p.obs),
    number("岗哨守卫", p.sentries),
    number("眩晕时长", p.stuns, true),
    number("英雄治疗", p.healing),
  ];
}
