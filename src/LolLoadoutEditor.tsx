import React, { useEffect, useState } from "react";
import type { LolLoadoutIcon, ReportData } from "./domain";

export function LolLoadoutEditor({
  match,
  disabled,
  onChange,
}: {
  match: ReportData;
  disabled: boolean;
  onChange: (match: ReportData) => void;
}) {
  const [catalog, setCatalog] = useState<LolLoadoutIcon[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      "/api/lol/loadout-catalog" +
        (match.patch ? "?patch=" + encodeURIComponent(match.patch) : ""),
      { signal: controller.signal },
    )
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setCatalog(data.spells);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [match.id, match.patch]);
  async function update(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/lol/spells/${encodeURIComponent(match.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      onChange(data.match);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="loadout-editor">
      <summary>召唤师技能与符文</summary>
      <p>符文随装备一起获取；召唤师技能请按本局记录选择，自动保存。</p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {match.players.map((p) => (
        <div className="loadout-player" key={p.slot}>
          <b>
            {p.name}
            <small>{p.hero}</small>
          </b>
          <div className="spell-selects">
            {[0, 1].map((index) => (
              <select
                key={index}
                aria-label={`${p.name} 召唤师技能 ${index + 1}`}
                disabled={busy || disabled}
                value={p.lolLoadout?.spells?.[index]?.id ?? ""}
                onChange={(e) => {
                  const spells = p.lolLoadout?.spells?.map(
                    (s) => s?.id ?? null,
                  ) ?? [null, null];
                  spells[index] = e.target.value
                    ? Number(e.target.value)
                    : null;
                  void update({ slot: p.slot, spells });
                }}
              >
                <option value="">未选择</option>
                {catalog.map((s) => (
                  <option
                    key={s.id}
                    value={s.id}
                    disabled={p.lolLoadout?.spells?.[1 - index]?.id === s.id}
                  >
                    {s.name}
                  </option>
                ))}
              </select>
            ))}
          </div>
          {p.lolLoadout?.runes && (
            <div className="editor-runes" aria-label={`${p.name} 符文`}>
              {[
                p.lolLoadout.runes.primary,
                p.lolLoadout.runes.secondary,
                ...p.lolLoadout.runes.perks,
              ].map((r, i) => (
                <span key={i} title={r.name}>
                  {r.image ? <img src={r.image} alt={r.name} /> : r.name}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </details>
  );
}
