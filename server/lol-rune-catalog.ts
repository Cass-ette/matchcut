import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { LolLoadoutIcon } from "../src/domain";

// Called only by explicit rune sync. Loading cached matches remains offline.
export async function fetchRuneCatalog(
  root: string,
  prefix: string,
  request: typeof fetch,
) {
  assert.match(prefix, /^\d+\.\d+$/);
  const signal = AbortSignal.timeout(45000);
  const json = async (url: string) => {
    const r = await request(url, {
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
    });
    if (!r.ok) throw new Error(`符文目录暂不可用（HTTP ${r.status}）`);
    return r.json();
  };
  const dragon = "https://ddragon.leagueoflegends.com";
  const community = `https://raw.communitydragon.org/${prefix}/plugins/rcp-be-lol-game-data/global`;
  const versions = z
    .array(z.string())
    .parse(await json(dragon + "/api/versions.json"));
  const version = versions.find(
    (v) => v.startsWith(prefix + ".") && /^\d+\.\d+\.\d+$/.test(v),
  );
  assert.ok(version, "缺少当前版本的符文目录");
  const rune = z.object({
    id: z.number().int().positive(),
    name: z.string(),
    icon: z.string().regex(/^[\w/.-]+\.png$/),
  });
  const styles = z
    .array(rune.extend({ slots: z.array(z.object({ runes: z.array(rune) })) }))
    .parse(
      await json(`${dragon}/cdn/${version}/data/zh_CN/runesReforged.json`),
    );
  const rawPerks = z
    .array(
      z.object({
        id: z.number().int().positive(),
        name: z.string(),
        iconPath: z.string(),
      }),
    )
    .parse(await json(community + "/zh_cn/v1/perks.json"));
  const entries = new Map<number, { id: number; name: string; url: string }>();
  const shardUrl = (icon: string) => {
    assert.match(
      icon,
      /^\/lol-game-data\/assets\/v1\/perk-images\/[\w/.-]+\.png$/i,
    );
    assert.ok(!icon.includes(".."));
    return dragon + "/cdn/img/" + icon.split("/v1/")[1];
  };
  for (const style of styles) {
    assert.ok(!style.icon.includes(".."));
    entries.set(style.id, {
      id: style.id,
      name: style.name,
      url: `${dragon}/cdn/img/${style.icon}`,
    });
    for (const slot of style.slots)
      for (const r of slot.runes) {
        assert.ok(!r.icon.includes(".."));
        entries.set(r.id, {
          id: r.id,
          name: r.name,
          url: `${dragon}/cdn/img/${r.icon}`,
        });
      }
  }
  for (const r of rawPerks.filter((r) => r.id >= 5000 && r.id < 6000))
    entries.set(r.id, {
      id: r.id,
      name: r.name,
      url: shardUrl(r.iconPath),
    });
  const runes: LolLoadoutIcon[] = [...entries.values()].map(({ id, name }) => ({
    id,
    name,
  }));
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < runes.length) {
        const r = runes[next++];
        const asset = `/assets/lol/loadouts/${prefix}/runes-${r.id}.png`;
        const file = path.join(root, "public", asset);
        const valid = (b: Buffer) =>
          b.length < 1024 * 1024 &&
          b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
        try {
          if (valid(await readFile(file))) {
            r.image = asset;
            continue;
          }
        } catch {}
        try {
          const response = await request(entries.get(r.id)!.url, {
            redirect: "error",
            signal,
          });
          if (!response.ok) continue;
          const bytes = Buffer.from(await response.arrayBuffer());
          if (!valid(bytes)) continue;
          await mkdir(path.dirname(file), { recursive: true });
          const tmp = file + "." + randomUUID() + ".tmp";
          await writeFile(tmp, bytes);
          await rename(tmp, file);
          r.image = asset;
        } catch {
          /* The verified rune ID and name remain usable without an icon. */
        }
      }
    }),
  );
  return { version, runes };
}
