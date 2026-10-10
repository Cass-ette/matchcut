import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { normalizeLol } from "../src/lol";
import { syncLolGameLoadout } from "../server/lol-game-loadout";
const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const match = () =>
  normalizeLol(
    read("data/fixtures/lol/LOLTMNT02_76144.json").rows,
    read("data/fixtures/lol/champions.json"),
  );
const runes = {
  primary: { id: 8200, name: "巫术" },
  secondary: { id: 8300, name: "启迪" },
  perks: [{ id: 8229, name: "彗星" }],
};
test("one action starts both sources and merges successful equipment and runes without changing spells", async () => {
  const m = match();
  m.players[0].lolLoadout = { spells: [{ id: 4, name: "闪现" }, null] };
  const calls: string[] = [];
  const result = await syncLolGameLoadout(m, {
    items: {
      sync: async (m) => {
        calls.push("items");
        m.players[0].inventory = {
          layout: "list",
          main: [{ id: 3009, name: "轻灵之靴" }],
        };
      },
    },
    runes: {
      sync: async (m) => {
        calls.push("runes");
        m.players[0].lolLoadout = { runes };
      },
    },
  });
  assert.deepEqual(calls, ["items", "runes"]);
  assert.equal(result.message, "已核对并保存装备与符文");
  assert.deepEqual(result.warnings, []);
  assert.equal(m.players[0].inventory!.main[0]!.id, 3009);
  assert.equal(m.players[0].lolLoadout!.spells![0]!.id, 4);
  assert.deepEqual(m.players[0].lolLoadout!.runes, runes);
});
test("a paused inventory failure still saves runes and retains prior verified equipment", async () => {
  const m = match();
  m.players[0].inventory = {
    layout: "list",
    main: [{ id: 3009, name: "已核实装备" }],
  };
  const result = await syncLolGameLoadout(m, {
    items: {
      sync: async (copy) => {
        copy.players[0].inventory = undefined;
        throw new Error("暂停导致装备不完整");
      },
    },
    runes: {
      sync: async (copy) => {
        copy.players[0].lolLoadout = { runes };
      },
    },
  });
  assert.equal(result.message, "已核对并保存符文");
  assert.match(result.warnings[0], /装备.*暂停/);
  assert.equal(m.players[0].inventory!.main[0]!.id, 3009);
  assert.deepEqual(m.players[0].lolLoadout!.runes, runes);
});
test("rune errors preserve cached runes while equipment can update; two errors preserve all data", async () => {
  const m = match();
  m.players[0].lolLoadout = { runes };
  const fail = {
    sync: async () => {
      throw new Error("offline");
    },
  };
  const partial = await syncLolGameLoadout(m, {
    items: {
      sync: async (copy) => {
        copy.players[0].inventory = {
          layout: "list",
          main: [{ id: 3009, name: "鞋" }],
        };
      },
    },
    runes: fail,
  });
  assert.equal(partial.message, "已核对并保存装备");
  assert.deepEqual(m.players[0].lolLoadout!.runes, runes);
  const before = structuredClone(m);
  const failed = await syncLolGameLoadout(m, { items: fail, runes: fail });
  assert.equal(failed.warnings.length, 2);
  assert.deepEqual(m, before);
});
