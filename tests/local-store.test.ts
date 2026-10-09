import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalStore, type StoredMatch } from "../server/local-store";
import { ArchiveIndex, type ArchiveEntry } from "../server/archive-index";
import type { MediaItem, MediaQuery } from "../src/media";

async function setup(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), "matchcut-store-"));
  const store = new LocalStore(root);
  t.after(async () => {
    store.close();
    await rm(root, { recursive: true, force: true });
  });
  return store;
}
const match = (
  id: string,
  team = "Old Club",
  name = "Old Name",
  date = "2025-01-01",
): StoredMatch => ({
  id,
  date,
  radiant: team,
  dire: "Rival",
  players: [{ playerId: "stable-id", name, team }],
});

test("archive indexing is incremental, shared during initialization and reusable after restart", async (t) => {
  const store = await setup(t);
  let index = new ArchiveIndex(store, "lol");
  let loads = 0,
    lists = 0;
  const entry = (id: string, version = "1"): ArchiveEntry => ({
    id,
    version,
    load: async () => {
      loads++;
      return match(id);
    },
  });
  let source = [entry("a"), entry("b")];
  const entries = async () => {
    lists++;
    return source;
  };
  await Promise.all([
    index.ensure("first", entries),
    index.ensure("first", entries),
  ]);
  assert.equal(loads, 2);
  assert.equal(lists, 1);
  store.close();
  index = new ArchiveIndex(store, "lol");
  await index.ensure("first", entries);
  assert.equal(loads, 2);
  assert.equal(lists, 1);
  source = [entry("a", "2"), entry("b"), entry("c")];
  await index.ensure("second", entries);
  assert.equal(loads, 4);
  source = [entry("a", "2")];
  await index.ensure("third", entries);
  assert.equal(loads, 4);
  assert.equal(store.matches("lol").length, 1);
  assert.equal(
    store.db.prepare("SELECT count(*) AS n FROM appearances").get()!.n,
    1,
  );
});

test("failed parsing and failed SQL updates keep the prior archive and allow retry", async (t) => {
  const store = await setup(t),
    index = new ArchiveIndex(store, "lol");
  const good = { id: "a", version: "1", load: async () => match("a") };
  await index.ensure("old", async () => [good]);
  await assert.rejects(
    index.ensure("new", async () => [
      good,
      {
        id: "b",
        version: "1",
        load: async () => {
          throw new Error("unreadable match");
        },
      },
    ]),
    /unreadable/,
  );
  assert.equal(store.meta("archive:lol"), "old");
  assert.equal(store.matches("lol").length, 1);
  await assert.rejects(
    index.ensure("bad-sql", async () => [
      {
        id: "b",
        version: "1",
        load: async () => ({
          ...match("b"),
          players: [
            { playerId: "same", name: "A" },
            { playerId: "same", name: "B" },
          ],
        }),
      },
    ]),
  );
  assert.equal(store.meta("archive:lol"), "old");
  assert.equal(store.matches<StoredMatch>("lol")[0].id, "a");
  await index.ensure("new", async () => [
    good,
    { id: "b", version: "1", load: async () => match("b") },
  ]);
  assert.equal(store.matches("lol").length, 2);
});

test("player identity is independent of teams and games; latest name and historical aliases survive restart", async (t) => {
  const store = await setup(t),
    index = new ArchiveIndex(store, "lol");
  await index.ensure("one", async () => [
    { id: "old", version: "1", load: async () => match("old") },
  ]);
  const before = store.summaries("lol");
  await index.ensure("two", async () => [
    { id: "old", version: "1", load: async () => match("old") },
    {
      id: "new",
      version: "1",
      load: async () => match("new", "New Club", "New Name", "2026-01-01"),
    },
    {
      id: "other",
      version: "1",
      load: async () => ({
        ...match("other"),
        players: [
          { playerId: "other-id", name: "New Name", team: "Other Club" },
        ],
      }),
    },
  ]);
  assert.notStrictEqual(store.summaries("lol"), before);
  assert.strictEqual(store.summaries("lol"), store.summaries("lol"));
  store.close();
  const people = store.summaries("lol").flatMap((m) => m.players || []);
  assert.equal(people.length, 2);
  const person = people.find((p) => p.playerId === "stable-id")!;
  assert.equal(person.name, "New Name");
  assert.deepEqual(
    new Set(person.aliases),
    new Set(["Old Name", "Old Club", "New Name", "New Club"]),
  );
  assert.equal(
    store.summaries("cs2").flatMap((m) => m.players || []).length,
    0,
  );
  const teams = store.db
    .prepare("SELECT team FROM appearances WHERE player_id=? ORDER BY date")
    .all("stable-id");
  assert.deepEqual(
    teams.map((t) => t.team),
    ["Old Club", "New Club"],
  );
});

test("media pages search literal text, filter across the full library and remain bounded/game-specific", async (t) => {
  const store = await setup(t);
  const items: MediaItem[] = Array.from({ length: 125 }, (_, i) => ({
    id: `p-${i}`,
    game: "lol",
    kind: "player",
    name: i === 124 ? "Ｆａｋｅｒ" : `Person ${i}`,
    aliases: i === 124 ? ["T1", "100%_literal' OR 1=1 --"] : [],
    images: i % 2 ? { artwork: "/assets/test.png" } : {},
    defaults: {},
    overrides: i === 123 ? ["artwork"] : [],
  }));
  store.replaceMedia("lol", items, "v1");
  store.replaceMedia("cs2", [{ ...items[0], game: "cs2" }], "v1");
  const query: MediaQuery = {
    kind: "player",
    query: "",
    filter: "all",
    offset: 0,
    limit: 60,
  };
  const first = store.page("lol", query),
    second = store.page("lol", { ...query, offset: 60 });
  assert.equal(first.total, 125);
  assert.equal(first.items.length, 60);
  assert.equal(second.items[0].id, "p-60");
  assert.equal(
    new Set([...first.items, ...second.items].map((i) => i.id)).size,
    120,
  );
  assert.equal(store.page("lol", { ...query, offset: 120 }).items.length, 5);
  assert.equal(store.page("lol", { ...query, offset: 500 }).items.length, 0);
  assert.equal(
    store.page("lol", { ...query, query: "faker" }).items[0].id,
    "p-124",
  );
  assert.equal(
    store.page("lol", { ...query, query: "100%_literal' OR 1=1 --" }).total,
    1,
  );
  assert.equal(store.page("lol", { ...query, filter: "missing" }).total, 63);
  assert.equal(
    store.page("lol", { ...query, filter: "custom" }).items[0].id,
    "p-123",
  );
  assert.deepEqual(first.counts, { team: 0, hero: 0, player: 125 });
  assert.equal(store.page("cs2", query).total, 1);
  assert.throws(() => store.page("lol", { ...query, filter: "1=1 --" as any }));
  assert.throws(() => store.page("lol", { ...query, limit: -1 }));
  const team: MediaItem = {
    ...items[0],
    id: "team",
    kind: "team",
    logoReview: "ambiguous",
  };
  store.replaceMedia("lol", [team], "v2");
  assert.equal(store.item("lol", "p-0"), undefined);
  assert.equal(
    store.page("lol", { ...query, kind: "team", filter: "review" }).total,
    1,
  );
  assert.throws(() => store.replaceMedia("lol", [team, team], "bad"));
  assert.equal(store.meta("media:lol"), "v2");
  assert.equal(store.item("lol", "team")!.logoReview, "ambiguous");
});
