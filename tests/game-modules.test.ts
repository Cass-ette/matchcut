import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
  symlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { GameModuleManager, purgeGameData } from "../server/game-modules";
import { localStore } from "../server/local-store";

const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");
async function setup(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), "matchcut-modules-"));
  const put = async (file: string, content = "preserved") => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  };
  await put("public/assets/lol/Ashe.png", "old");
  await put("public/assets/heroes/1.png");
  await put("public/assets/cs/maps/nuke.png");
  await put("public/assets/players/lol-player-example.png");
  await put("public/assets/players/cs2-player-example.png");
  await put("data/cache/lol/lol-test.json");
  await put("data/cache/cs/cs2-test/snapshot.json");
  await put("data/cache/123.json");
  await put("data/preferences-lol.json");
  await put("output/video.mp4");
  await put("public/assets/bgm/music.mp3");
  t.after(async () => {
    localStore(root).close();
    await rm(root, { recursive: true, force: true });
  });
  return { root, put };
}
function download(
  records: { path: string; content: string }[],
  corrupt = false,
): typeof fetch {
  const rows = records.map((r) => {
    const data = Buffer.from(r.content);
    return {
      path: r.path,
      bytes: data.length,
      sha256: sha(data),
      data: data.toString("base64"),
    };
  });
  const archive = gzipSync(
    [
      JSON.stringify({ schemaVersion: 1, game: "lol", version: "0.6.0" }),
      ...rows.map((r) => JSON.stringify(r)),
    ].join("\n") + "\n",
  );
  const pack = {
    game: "lol",
    version: "0.6.0",
    file: "matchcut-lol-0.6.0.pack.gz",
    bytes: archive.length,
    sha256: corrupt ? "0".repeat(64) : sha(archive),
    files: rows.length,
    installedBytes: rows.reduce((sum, r) => sum + r.bytes, 0),
  };
  return (async (url: string | URL | Request) =>
    String(url).endsWith("modules.json")
      ? Response.json({ schemaVersion: 1, modules: [pack] })
      : new Response(archive)) as typeof fetch;
}
const current = (manager: GameModuleManager) =>
  manager.list().modules.find((m) => m.game === "lol")!;

test("existing games migrate enabled; hiding persists all data and selecting a hidden game falls back", async (t) => {
  const { root } = await setup(t);
  const manager = new GameModuleManager(root);
  await manager.initialize();
  assert.equal(manager.list().modules.filter((m) => m.enabled).length, 3);
  manager.start("lol", "hide");
  await manager.settled();
  assert.equal(manager.select("lol"), "dota2");
  assert.throws(() => manager.assertEnabled("lol"), /尚未启用/);
  assert.equal(
    await readFile(path.join(root, "public/assets/lol/Ashe.png"), "utf8"),
    "old",
  );
  assert.equal(
    await readFile(path.join(root, "data/cache/lol/lol-test.json"), "utf8"),
    "preserved",
  );
  const restarted = new GameModuleManager(root);
  await restarted.initialize();
  assert.equal(current(restarted).enabled, false);
  for (const game of ["dota2", "cs2"] as const) {
    restarted.start(game, "hide");
    await restarted.settled();
  }
  assert.equal(restarted.select(), undefined);
  restarted.start("lol", "enable");
  await restarted.settled();
  assert.equal(restarted.select(), "lol");
});

test("remove retains match data by default, downloads restore only the selected game, and busy checks reserve the operation", async (t) => {
  const { root } = await setup(t);
  const manager = new GameModuleManager(root, {
    fetch: download([{ path: "public/assets/lol/Ashe.png", content: "new" }]),
  });
  await manager.initialize();
  manager.start("lol", "remove");
  await manager.settled();
  assert.equal(current(manager).installed, false);
  await assert.rejects(
    readFile(path.join(root, "public/assets/lol/Ashe.png")),
    { code: "ENOENT" },
  );
  await assert.rejects(
    readFile(path.join(root, "public/assets/players/lol-player-example.png")),
    { code: "ENOENT" },
  );
  for (const file of [
    "data/cache/lol/lol-test.json",
    "data/preferences-lol.json",
    "public/assets/players/cs2-player-example.png",
    "output/video.mp4",
    "public/assets/bgm/music.mp3",
  ])
    assert.equal(await readFile(path.join(root, file), "utf8"), "preserved");
  manager.start("lol", "install");
  assert.throws(() => manager.start("cs2", "remove"), /正在处理/);
  await manager.settled();
  assert.equal(current(manager).error, undefined);
  assert.equal(current(manager).version, "0.6.0");
  assert.equal(current(manager).enabled, true);
  assert.equal(
    await readFile(path.join(root, "public/assets/lol/Ashe.png"), "utf8"),
    "new",
  );
});

test("removing local data scopes SQLite, archives and overrides by game and retains shared uploads", async (t) => {
  const { root, put } = await setup(t);
  const store = localStore(root);
  const shared = "a".repeat(64) + ".png",
    orphan = "b".repeat(64) + ".png";
  await put("public/assets/library/" + shared);
  await put("public/assets/library/" + orphan);
  store.writeRegistry({
    version: 1,
    heroes: { "lol-hero-22": { portrait: "/assets/library/" + orphan } },
    players: {},
    teams: {
      "lol-team-1": {
        game: "lol",
        images: { logo: "/assets/library/" + shared },
      },
      "cs2-team-1": {
        game: "cs2",
        images: { logo: "/assets/library/" + shared },
      },
    },
  });
  for (const game of ["lol", "cs2"] as const)
    store.syncMatches(
      game,
      [
        {
          version: "1",
          match: {
            id: "test",
            radiant: "A",
            dire: "B",
            players: [{ playerId: "p", name: "P" }],
          },
        },
      ],
      new Set(["test"]),
      "source",
    );
  const manager = new GameModuleManager(root, {
    purgeData: (game) => purgeGameData(root, game),
  });
  await manager.initialize();
  manager.start("lol", "remove", false);
  await manager.settled();
  assert.equal(current(manager).error, undefined);
  assert.equal(store.matches("lol").length, 0);
  assert.equal(store.matches("cs2").length, 1);
  assert.deepEqual(Object.keys(store.registry().teams), ["cs2-team-1"]);
  assert.deepEqual(store.registry().heroes, {});
  await assert.rejects(
    readFile(path.join(root, "data/cache/lol/lol-test.json")),
    { code: "ENOENT" },
  );
  await assert.rejects(readFile(path.join(root, "data/preferences-lol.json")), {
    code: "ENOENT",
  });
  await assert.rejects(
    readFile(path.join(root, "public/assets/library/" + orphan)),
    { code: "ENOENT" },
  );
  assert.equal(
    await readFile(path.join(root, "public/assets/library/" + shared), "utf8"),
    "preserved",
  );
  assert.equal(
    await readFile(path.join(root, "data/cache/123.json"), "utf8"),
    "preserved",
  );
});

test("corrupt, cross-game and traversal downloads preserve the prior installation", async (t) => {
  const { root } = await setup(t);
  for (const [file, corrupt] of [
    ["public/assets/lol/Ashe.png", true],
    ["public/assets/cs/maps/nuke.png", false],
    ["public/assets/lol/../../escape", false],
  ] as const) {
    const manager = new GameModuleManager(root, {
      fetch: download([{ path: file, content: "replacement" }], corrupt),
    });
    await manager.initialize();
    manager.start("lol", "install");
    await manager.settled();
    assert.ok(current(manager).error);
    assert.equal(current(manager).enabled, true);
    assert.equal(current(manager).version, "bundled");
    assert.equal(
      await readFile(path.join(root, "public/assets/lol/Ashe.png"), "utf8"),
      "old",
    );
  }
});

test("failed commit rolls back earlier file replacements and refuses symlink parents", async (t) => {
  const { root } = await setup(t);
  await symlink(
    path.join(root, "public/assets/cs"),
    path.join(root, "public/assets/lol/linked"),
  );
  const manager = new GameModuleManager(root, {
    fetch: download([
      { path: "public/assets/lol/Ashe.png", content: "new" },
      { path: "public/assets/lol/linked/new.png", content: "wrong game" },
    ]),
  });
  await manager.initialize();
  manager.start("lol", "install");
  await manager.settled();
  assert.match(current(manager).error!, /符号链接/);
  assert.equal(
    await readFile(path.join(root, "public/assets/lol/Ashe.png"), "utf8"),
    "old",
  );
});

test("active render or import blocks game changes before any state mutation", async (t) => {
  const { root } = await setup(t);
  const manager = new GameModuleManager(root, {
    busyReason: () => "正在生成视频",
  });
  await manager.initialize();
  assert.throws(() => manager.start("lol", "hide"), /正在生成视频/);
  assert.equal(current(manager).enabled, true);
});

test("updating a hidden game preserves its visibility", async (t) => {
  const { root } = await setup(t);
  const manager = new GameModuleManager(root, {
    fetch: download([
      { path: "public/assets/lol/Ashe.png", content: "updated" },
    ]),
  });
  await manager.initialize();
  manager.start("lol", "hide");
  await manager.settled();
  manager.start("lol", "install");
  await manager.settled();
  assert.equal(current(manager).error, undefined);
  assert.equal(current(manager).enabled, false);
  assert.equal(current(manager).version, "0.6.0");
});

test("empty folders do not masquerade as installed games on a fresh setup", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "matchcut-empty-modules-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "public/assets/heroes"), { recursive: true });
  const manager = new GameModuleManager(root);
  await manager.initialize();
  assert.equal(manager.select(), undefined);
  assert.ok(manager.list().modules.every((m) => !m.installed));
});
