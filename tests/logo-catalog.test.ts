import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { LogoCatalog } from "../server/logo-catalog";
import { exactLogo, searchLogos, type CatalogLogo } from "../src/media";

const logo = (name: string, game: "lol" | "dota2" = "lol"): CatalogLogo => ({
  name,
  game,
  path: `${game === "lol" ? "league-of-legends" : "dota-2"}/${name.replace(/ /g, "-")}/logo.png`,
  sha: "a".repeat(40),
});
test("automatic matching ignores case, keeps games separate and refuses fuzzy or ambiguous names", () => {
  const logos = [
    logo("mixed case club"),
    logo("team liquid", "dota2"),
    logo("team liquid"),
    logo("gen.g"),
  ];
  assert.equal(
    exactLogo(logos, "lol", ["MiXeD Case Club"])?.name,
    "mixed case club",
  );
  assert.equal(exactLogo(logos, "lol", ["Team Liquid"])?.game, "lol");
  assert.equal(exactLogo(logos, "lol", ["Mixed Club"]), undefined);
  assert.equal(exactLogo(logos, "lol", ["Gen G"]), undefined);
  assert.equal(
    exactLogo(
      [...logos, { ...logo("mixed case club"), sha: "b".repeat(40) }],
      "lol",
      ["Mixed Case Club"],
    ),
    undefined,
  );
  const primary = {
    ...logo("kt rolster"),
    path: "league-of-legends/kt-rolster/kt-rolster-logo.png",
  };
  assert.equal(
    exactLogo(
      [
        primary,
        {
          ...primary,
          path: "league-of-legends/kt-rolster/kt-rolster-chall-logo.png",
          sha: "b".repeat(40),
        },
      ],
      "lol",
      ["KT Rolster"],
    )?.path,
    primary.path,
  );
});
test("logo search handles punctuation, short names, aliases and acronyms without automatically binding", () => {
  const logos = [
    logo("bilibili gaming"),
    logo("gen.g"),
    logo("t1"),
    logo("t1 academy"),
    logo("team liquid"),
  ];
  assert.equal(
    searchLogos(logos, "BLG", ["Bilibili Gaming"])[0].name,
    "bilibili gaming",
  );
  assert.equal(searchLogos(logos, "Gen G Esports")[0].name, "gen.g");
  assert.equal(searchLogos(logos, "TL")[0].name, "team liquid");
  assert.equal(searchLogos(logos, "T1")[0].name, "t1");
  assert.equal(searchLogos(logos, "unknown club").length, 0);
  assert.equal(searchLogos(logos, "").length, logos.length);
});

test("cached directory remains searchable offline; explicit refresh fails without losing it", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "matchcut-logo-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "data/fixtures"), { recursive: true });
  const data = { fetchedAt: "2026-10-09T00:00:00Z", logos: [logo("t1")] };
  await writeFile(
    path.join(root, "data/fixtures/logo-catalog.json"),
    JSON.stringify(data),
  );
  let requests = 0;
  const catalog = new LogoCatalog(root, async () => {
    requests++;
    throw new Error("offline");
  });
  assert.equal((await catalog.list()).logos.length, 1);
  assert.equal(requests, 0);
  assert.match((await catalog.list(true)).warning!, /继续使用本地/);
  assert.deepEqual(await catalog.list(), data);
  await assert.rejects(catalog.image("../bad"));
  await assert.rejects(catalog.image("b".repeat(40)), /未找到/);
});

test("directory refresh is cached, ignores unsafe paths and downloads only indexed immutable blobs", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "matchcut-logo-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const png = await sharp({
    create: { width: 80, height: 80, channels: 4, background: "#f6c453" },
  })
    .png()
    .toBuffer();
  const sha = createHash("sha1")
    .update(`blob ${png.length}\0`)
    .update(png)
    .digest("hex");
  let imageRequests = 0;
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("https://raw.githubusercontent.com/")) {
      imageRequests++;
      return new Response(new Uint8Array(png));
    }
    if (url.endsWith("/master"))
      return Response.json({
        tree: [
          { path: "dota-2", sha: "1".repeat(40), type: "tree" },
          { path: "league-of-legends", sha: "2".repeat(40), type: "tree" },
        ],
      });
    return Response.json({
      tree: [
        { path: "t1/logo.png", sha, type: "blob" },
        { path: "../../escape.png", sha, type: "blob" },
        { path: "bad/logo.svg", sha, type: "blob" },
      ],
    });
  };
  const catalog = new LogoCatalog(root, fetcher);
  const data = await catalog.list(true);
  assert.equal(data.logos.length, 2);
  const [a, b] = await Promise.all([catalog.image(sha), catalog.image(sha)]);
  assert.deepEqual(a, b);
  assert.equal(imageRequests, 1);
  const restarted = new LogoCatalog(root, async () => {
    throw new Error("offline");
  });
  assert.equal((await restarted.list()).logos.length, 2);
  assert.deepEqual(await restarted.image(sha), a);
  assert.ok(
    (await readFile(path.join(root, "data/cache/logo-catalog/index.json")))
      .length,
  );
  await assert.rejects(
    catalog.find(sha, "league-of-legends/not-t1/logo.png"),
    /未找到/,
  );
});

test("changed remote bytes cannot replace an indexed logo silently", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "matchcut-logo-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "data/fixtures"), { recursive: true });
  await writeFile(
    path.join(root, "data/fixtures/logo-catalog.json"),
    JSON.stringify({ fetchedAt: "2026-10-09", logos: [logo("t1")] }),
  );
  const catalog = new LogoCatalog(
    root,
    async () => new Response("changed content"),
  );
  await assert.rejects(catalog.image("a".repeat(40)), /图标已更新/);
});
