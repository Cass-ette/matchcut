import type { MatchData } from "../src/domain";
import { lolItems } from "./lol-items";
import { lolLoadouts } from "./lol-loadout";

type Source = { sync: (match: MatchData) => Promise<unknown> };
// Both sources are independent: a restarted inventory must not block start runes.
export async function syncLolGameLoadout(
  match: MatchData,
  sources: { items: Source; runes: Source } = {
    items: lolItems,
    runes: lolLoadouts,
  },
) {
  const itemsMatch = structuredClone(match),
    runesMatch = structuredClone(match);
  const outcomes = await Promise.allSettled([
    sources.items.sync(itemsMatch),
    sources.runes.sync(runesMatch),
  ]);
  const warnings: string[] = [],
    updated: string[] = [];
  if (outcomes[0].status === "fulfilled") {
    for (const p of match.players)
      p.inventory = itemsMatch.players.find(
        (v) => v.slot === p.slot,
      )?.inventory;
    match.inventorySource = itemsMatch.inventorySource;
    updated.push("装备");
  }
  if (outcomes[1].status === "fulfilled") {
    for (const p of match.players) {
      const runes = runesMatch.players.find((v) => v.slot === p.slot)
        ?.lolLoadout?.runes;
      p.lolLoadout = { ...p.lolLoadout, runes };
    }
    match.runeSource = runesMatch.runeSource;
    updated.push("符文");
  }
  for (const [i, outcome] of outcomes.entries())
    if (outcome.status === "rejected") {
      const reason =
        outcome.reason instanceof Error
          ? outcome.reason.message.split("\n")[0]
          : "数据源暂不可用";
      warnings.push(`${i === 0 ? "装备" : "符文"}：${reason}`);
    }
  return {
    match,
    warnings,
    message: updated.length
      ? `已核对并保存${updated.join("与")}`
      : "本次未获取到新装备或符文，已保存的数据保持不变",
  };
}
