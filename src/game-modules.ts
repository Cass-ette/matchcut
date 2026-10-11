import type { Game } from "./domain";

// New adapters register their identity and asset ownership here. Match archives
// and user uploads remain separate from downloadable, replaceable game media.
export const gameModules = [
  {
    game: "dota2",
    name: "Dota 2",
    label: "DOTA 2",
    description: "英雄立绘、头像、装备和战队图标",
    color: "#e26356",
    directories: [
      "public/assets/heroes",
      "public/assets/renders",
      "public/assets/dota",
    ],
    prefix: "dota",
  },
  {
    game: "lol",
    name: "英雄联盟",
    label: "LEAGUE OF LEGENDS",
    description: "全部英雄、选手照片、装备、技能与符文",
    color: "#cba86b",
    directories: ["public/assets/lol"],
    prefix: "lol",
  },
  {
    game: "cs2",
    name: "CS",
    label: "COUNTER-STRIKE 2",
    description: "地图徽标、选手照片和战队图标",
    color: "#80b5ca",
    directories: ["public/assets/cs"],
    prefix: "cs2",
  },
] as const;

export function ownsModuleAsset(game: Game, file: string) {
  if (
    !/^[A-Za-z0-9_./-]+$/.test(file) ||
    file.split("/").some((p) => !p || p === "." || p === "..")
  )
    return false;
  const module = gameModules.find((m) => m.game === game)!;
  return (
    module.directories.some((dir) => file.startsWith(dir + "/")) ||
    ["teams", "players"].some(
      (dir) =>
        file.startsWith(`public/assets/${dir}/${module.prefix}-`) &&
        !file.slice(`public/assets/${dir}/`.length).includes("/"),
    )
  );
}

export type GameModuleState = {
  game: Game;
  installed: boolean;
  enabled: boolean;
  version: string;
  retainedData: boolean;
  operation?: {
    action: "install" | "remove";
    progress: number;
    message: string;
  };
  error?: string;
};
export type GameModulesResponse = {
  modules: GameModuleState[];
  busyReason?: string;
};
