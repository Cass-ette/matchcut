import assert from "node:assert/strict";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type { LolLoadoutIcon, MatchData } from "../src/domain";
import type { ChampionCatalog } from "../src/lol";
import { fetchRuneCatalog } from "./lol-rune-catalog";
import {
  LolItems,
  lolMetadataSchema,
  verifyLolParticipants,
} from "./lol-items";

const time = z.string().datetime();
const perks = z.object({
  styleId: z.number().int().positive(),
  subStyleId: z.number().int().positive(),
  // Riot's feed can report eight entries. Preserve them; never invent a shard.
  perks: z.array(z.number().int().positive()).min(6).max(9),
});
const frame = z.object({
  rfc460Timestamp: time,
  participants: z
    .array(
      z.object({
        participantId: z.number().int().min(1).max(10),
        perkMetadata: perks,
      }),
    )
    .length(10),
});
const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  esportsGameId: z.string().regex(/^\d{10,25}$/),
  startedAt: time,
  fetchedAt: time,
  metadata: lolMetadataSchema,
  details: frame,
});
export function verifyLolRunes(
  match: MatchData,
  input: unknown,
  champions: ChampionCatalog,
) {
  const snapshot = snapshotSchema.parse(input);
  const people = verifyLolParticipants(
    match,
    snapshot.metadata,
    snapshot.startedAt,
    champions,
  );
  const elapsed =
    Date.parse(snapshot.details.rfc460Timestamp) -
    Date.parse(snapshot.startedAt);
  assert.ok(elapsed >= 0 && elapsed <= 120000, "符文必须来自开局记录");
  const result = new Map<number, z.infer<typeof perks>>();
  const ids = new Set<number>();
  for (const record of snapshot.details.participants) {
    assert.ok(!ids.has(record.participantId), "符文选手编号重复");
    ids.add(record.participantId);
    const p = people.get(record.participantId);
    assert.ok(p, "符文选手编号不匹配");
    assert.notEqual(
      record.perkMetadata.styleId,
      record.perkMetadata.subStyleId,
      "主副系重复",
    );
    result.set(p.slot, record.perkMetadata);
  }
  return { snapshot, result };
}
type Catalog = {
  version: string;
  spells: LolLoadoutIcon[];
  runes: LolLoadoutIcon[];
};
const read = async (file: string) => JSON.parse(await readFile(file, "utf8"));
async function save(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = file + "." + randomUUID() + ".tmp";
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, file);
}
export const spellSelection = z.object({
  slot: z.number().int(),
  spells: z
    .tuple([
      z.number().int().positive().nullable(),
      z.number().int().positive().nullable(),
    ])
    .refine(
      ([a, b]) => a === null || b === null || a !== b,
      "两个召唤师技能不能重复",
    ),
});
export class LolLoadouts {
  private pending = new Map<string, Promise<z.infer<typeof snapshotSchema>>>();
  constructor(
    private root: string,
    private request: typeof fetch = fetch,
  ) {}
  async catalog(patch?: string, network = false): Promise<Catalog> {
    const version = patch?.split(".").slice(0, 2).map(Number).join(".");
    if (version && /^\d+\.\d+$/.test(version)) {
      try {
        const cached: Catalog = await read(
          path.join(
            this.root,
            "data/cache/lol/loadout-catalogs",
            version + ".json",
          ),
        );
        if (!network || cached.runes.every((r) => r.image)) return cached;
      } catch {}
      try {
        return await read(
          path.join(
            this.root,
            "data/fixtures/lol/loadout-catalogs",
            version + ".json",
          ),
        );
      } catch {}
    }
    const latest: Catalog = await read(
      path.join(this.root, "data/fixtures/lol/loadout-catalogs/16.18.json"),
    );
    if (network && version && /^\d+\.\d+$/.test(version)) {
      const runes = await fetchRuneCatalog(this.root, version, this.request);
      const catalog = { ...runes, spells: latest.spells };
      await save(
        path.join(
          this.root,
          "data/cache/lol/loadout-catalogs",
          version + ".json",
        ),
        catalog,
      );
      return catalog;
    }
    // Unknown patches retain IDs rather than assigning renamed/retired runes.
    return { ...latest, runes: [] };
  }
  private file(match: MatchData, kind: "runes" | "spells", fixture = false) {
    assert.match(match.id, /^lol-[A-Za-z0-9_-]{1,100}$/);
    return path.join(
      this.root,
      fixture ? "data/fixtures/lol" : "data/cache/lol",
      kind,
      match.id.slice(4) + ".json",
    );
  }
  private async champions(): Promise<ChampionCatalog> {
    return read(path.join(this.root, "data/fixtures/lol/champions.json"));
  }
  private async attach(match: MatchData, input: unknown, network = false) {
    const { snapshot, result } = verifyLolRunes(
      match,
      input,
      await this.champions(),
    );
    const catalog = await this.catalog(
      snapshot.metadata.patchVersion,
      network,
    ).catch(() => ({
      version: snapshot.metadata.patchVersion,
      spells: [],
      runes: [],
    }));
    const icon = (id: number): LolLoadoutIcon =>
      catalog.runes.find((r) => r.id === id) ?? { id, name: `符文 #${id}` };
    for (const p of match.players) {
      const runes = result.get(p.slot)!;
      p.lolLoadout = {
        ...p.lolLoadout,
        runes: {
          primary: icon(runes.styleId),
          secondary: icon(runes.subStyleId),
          perks: runes.perks.map(icon),
        },
      };
    }
    match.runeSource = {
      url: `https://feed.lolesports.com/livestats/v1/details/${snapshot.esportsGameId}`,
      fetchedAt: snapshot.fetchedAt,
      timestamp: snapshot.details.rfc460Timestamp,
    };
  }
  async applyCached(match: MatchData) {
    for (const fixture of [false, true]) {
      try {
        await this.attach(
          match,
          await read(this.file(match, "runes", fixture)),
        );
        break;
      } catch {
        /* A stale loadout never blocks statistics. */
      }
    }
    try {
      const saved = await read(this.file(match, "spells"));
      const catalog = await this.catalog(match.patch);
      for (const p of match.players) {
        const record = saved.players?.find(
          (v: any) =>
            v.slot === p.slot && v.name === p.name && v.heroId === p.heroId,
        );
        if (!record) continue;
        const { spells } = spellSelection.parse(record);
        const selected = spells.map((id) =>
          id === null ? null : catalog.spells.find((s) => s.id === id),
        );
        if (selected.some((s) => s === undefined)) continue;
        p.lolLoadout = {
          ...p.lolLoadout,
          spells: selected as [LolLoadoutIcon | null, LolLoadoutIcon | null],
        };
      }
    } catch {}
  }
  async setSpells(match: MatchData, input: unknown) {
    const selection = spellSelection.parse(input);
    const p = match.players.find((p) => p.slot === selection.slot);
    assert.ok(p, "选手不存在");
    const catalog = await this.catalog(match.patch);
    const selected = selection.spells.map((id) =>
      id === null ? null : catalog.spells.find((s) => s.id === id),
    );
    assert.ok(
      selected.every((s) => s !== undefined),
      "未知召唤师技能",
    );
    p.lolLoadout = {
      ...p.lolLoadout,
      spells: selected as [LolLoadoutIcon | null, LolLoadoutIcon | null],
    };
    await save(this.file(match, "spells"), {
      matchId: match.id,
      updatedAt: new Date().toISOString(),
      players: match.players.map((p) => ({
        slot: p.slot,
        name: p.name,
        heroId: p.heroId,
        spells: p.lolLoadout?.spells?.map((s) => s?.id ?? null) ?? [null, null],
      })),
    });
  }
  private async fetchRunes(match: MatchData) {
    const source = new LolItems(this.root, this.request);
    const candidates = await source.candidates(match);
    const verified: z.infer<typeof snapshotSchema>[] = [];
    const champions = await this.champions();
    for (const candidate of candidates) {
      try {
        const initial = await source.readWindow(candidate.id);
        const startedAt = initial.frames[0].rfc460Timestamp;
        verifyLolParticipants(match, initial.metadata, startedAt, champions);
        const r = await this.request(
          `https://feed.lolesports.com/livestats/v1/details/${candidate.id}`,
          { redirect: "error", signal: AbortSignal.timeout(12000) },
        );
        assert.ok(r.ok, "符文接口不可用");
        const raw = await r.json();
        const details = z.array(frame).min(1).parse(raw.frames)[0];
        verified.push(
          verifyLolRunes(
            match,
            {
              schemaVersion: 1,
              esportsGameId: candidate.id,
              startedAt,
              fetchedAt: new Date().toISOString(),
              metadata: initial.metadata,
              details,
            },
            champions,
          ).snapshot,
        );
      } catch {
        /* Try other scheduled games; no partial/ambiguous identities. */
      }
    }
    assert.equal(
      verified.length,
      1,
      "无法唯一核对当前局的开局符文，未写入符文",
    );
    return verified[0];
  }
  async sync(match: MatchData) {
    let task = this.pending.get(match.id);
    if (!task) {
      task = this.fetchRunes(match);
      this.pending.set(match.id, task);
    }
    try {
      const snapshot = await task;
      await this.attach(match, snapshot, true);
      await save(this.file(match, "runes"), snapshot);
    } finally {
      if (this.pending.get(match.id) === task) this.pending.delete(match.id);
    }
  }
}
export const lolLoadouts = new LolLoadouts(process.cwd());
