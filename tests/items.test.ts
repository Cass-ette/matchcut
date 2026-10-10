import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { normalizeMatch } from "../src/domain";
import { inventoryItems, normalizeDotaInventory } from "../src/items";
import { DotaItemAssets } from "../server/item-source";

const fixture = JSON.parse(
  await readFile("data/fixtures/9035078952.json", "utf8"),
);
const heroes = JSON.parse(await readFile("data/fixtures/heroes.json", "utf8"));
const match = () =>
  normalizeMatch(structuredClone(fixture.raw), heroes, fixture.fetchedAt);

test("real Dota final inventories preserve slots, backpacks, neutral items and enhancements", () => {
  const m = match();
  const inventory = m.players[0].inventory!;
  assert.deepEqual(
    inventory.main.map((i) => i?.id),
    [116, 603, 208, 50, 145, 1097],
  );
  assert.equal(inventory.main[0]!.name, "Black King Bar");
  assert.equal(inventory.main[4]!.name, "Battle Fury");
  assert.deepEqual(
    inventory.backpack!.map((i) => i?.id),
    [26, 43, 5],
  );
  assert.equal(inventory.neutral!.id, 1860);
  assert.equal(inventory.enhancement!.id, 1584);
  assert.equal(m.players[3].inventory!.main[1], null);
  assert.ok(m.players.every((p) => p.inventory!.main.length === 6));
  // Starting and consumed items in item_uses must never replace final slots.
  assert.ok(!inventoryItems(inventory).some((i) => i.name === "Tango"));
});

test("unavailable inventories remain absent; valid empty slots and unknown IDs retain their meaning", () => {
  const raw = structuredClone(fixture.raw.players[0]);
  delete raw.item_0;
  assert.equal(normalizeDotaInventory(raw), undefined);
  for (const value of [null, -1, 1.5, "116", NaN]) {
    raw.item_0 = value;
    assert.equal(normalizeDotaInventory(raw), undefined);
  }
  raw.item_0 = 999999;
  assert.deepEqual(normalizeDotaInventory(raw)!.main[0], {
    id: 999999,
    name: "未知装备 #999999",
  });
  raw.item_0 = 0;
  assert.equal(normalizeDotaInventory(raw)!.main[0], null);
});

test("item image downloads deduplicate across matches, reuse disk cache and survive unavailable images", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "matchcut-items-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const png = await readFile("public/assets/dota/items/116.png");
  const requests: string[] = [];
  const fetcher: typeof fetch = async (url) => {
    requests.push(String(url));
    return new Response(png, { headers: { "content-type": "image/png" } });
  };
  const assets = new DotaItemAssets(root, fetcher);
  const a = match(),
    b = match();
  for (const m of [a, b])
    for (const p of m.players)
      p.inventory = {
        main: [p.slot === 0 ? null : { id: 116, name: "Black King Bar" }],
      };
  await Promise.all([assets.apply(a), assets.apply(b)]);
  assert.equal(requests.length, 1);
  assert.equal(
    a.players[1].inventory!.main[0]!.image,
    "/assets/dota/items/116.png",
  );
  await new DotaItemAssets(root, async () => {
    throw new Error("offline");
  }).apply(b);
  assert.equal(
    b.players[1].inventory!.main[0]!.image,
    "/assets/dota/items/116.png",
  );
  const unavailable = match();
  for (const p of unavailable.players)
    p.inventory = {
      main: [
        { id: 603, name: "Swift Blink" },
        { id: 999999, name: "Unknown" },
      ],
    };
  let failures = 0;
  const failing = new DotaItemAssets(root, async () => {
    failures++;
    return new Response("not png", {
      headers: { "content-type": "image/png" },
    });
  });
  await failing.apply(unavailable);
  await failing.apply(unavailable);
  assert.equal(failures, 1);
  assert.ok(
    unavailable.players.every((p) => p.inventory!.main.every((i) => !i!.image)),
  );
  const dest = path.join(root, "public/assets/dota/items");
  await mkdir(dest, { recursive: true });
  await writeFile(path.join(dest, "603.png"), png);
  await failing.apply(unavailable);
  assert.ok(unavailable.players.every((p) => p.inventory!.main[0]!.image));
});
