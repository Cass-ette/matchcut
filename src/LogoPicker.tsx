import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Download,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  searchLogos,
  type CatalogLogo,
  type LogoCatalogData,
  type MediaItem,
} from "./media";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "图标库暂时无法连接。");
  return data;
}
function CatalogImage({
  logo,
  large = false,
}: {
  logo: CatalogLogo;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [logo.sha]);
  return failed ? (
    <span className="logo-unavailable">预览暂不可用</span>
  ) : (
    <span className="catalog-image">
      {!loaded && (
        <LoaderCircle
          size={20}
          className="spin catalog-image-loading"
          aria-label="正在下载预览"
        />
      )}
      <img
        src={`/api/logo-catalog/image/${logo.sha}${large ? "" : "?thumbnail=1"}`}
        alt={logo.name}
        loading={large ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        style={{ opacity: loaded ? 1 : 0 }}
      />
    </span>
  );
}
export function LogoPicker({
  team,
  onClose,
  onBound,
}: {
  team: MediaItem;
  onClose: () => void;
  onBound: () => Promise<void>;
}) {
  const [catalog, setCatalog] = useState<LogoCatalogData | null>(null);
  const [query, setQuery] = useState(team.name);
  const [scope, setScope] = useState<string>(team.game);
  const [selected, setSelected] = useState<CatalogLogo | null>(null);
  const [limit, setLimit] = useState(36);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [background, setBackground] = useState("dark");
  const dialog = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const rows = useMemo(
    () =>
      searchLogos(
        (catalog?.logos || []).filter(
          (logo) => scope === "all" || logo.game === scope,
        ),
        query,
        query === team.name ? team.aliases : [],
      ),
    [catalog, query, scope, team],
  );
  async function load(refresh = false) {
    setLoading(true);
    setError("");
    try {
      setCatalog(
        await request<LogoCatalogData>(
          `/api/logo-catalog${refresh ? "?refresh=1" : ""}`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const focused = document.activeElement as HTMLElement | null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    input.current?.focus();
    input.current?.select();
    return () => {
      document.body.style.overflow = previous;
      focused?.focus();
    };
  }, []);
  useEffect(() => setLimit(36), [query, scope]);
  async function bind() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await request(
        `/api/media/teams/${team.id}/catalog-logo?game=${team.game}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sha: selected.sha, path: selected.path }),
        },
      );
      await onBound();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="media-modal-backdrop logo-picker-backdrop"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) onClose();
        if (event.key === "Tab") {
          const elements = Array.from(
            dialog.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled)",
            ) || [],
          ).filter((element) => element.offsetParent !== null);
          const first = elements[0],
            last = elements.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          }
          if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <div
        ref={dialog}
        className="logo-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logo-picker-title"
      >
        <header>
          <div>
            <h2 id="logo-picker-title">从图标库选择</h2>
            <p>
              为 <strong>{team.name}</strong> 选择队标
            </p>
          </div>
          <button
            className="icon-button"
            aria-label="关闭图标库"
            title="关闭图标库"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="logo-picker-toolbar">
          <label className="media-search">
            <Search size={16} />
            <input
              ref={input}
              aria-label="搜索开源图标"
              placeholder="队名、简称或英文名"
              value={query}
              disabled={busy}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="图标游戏范围"
            value={scope}
            disabled={busy}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="lol">英雄联盟</option>
            <option value="dota2">Dota 2</option>
            <option value="cs2">CS</option>
            <option value="all">全部游戏</option>
          </select>
          <button
            className="media-button"
            disabled={busy || loading}
            onClick={() => void load(true)}
          >
            <RefreshCw size={15} />
            更新目录
          </button>
        </div>
        <div className="logo-picker-status" aria-live="polite">
          {error ? (
            <span role="alert">{error}</span>
          ) : (
            catalog?.warning ||
            (loading
              ? "正在加载图标目录…"
              : `${rows.length} 张图标 · 可改搜简称或英文名`)
          )}
          {!loading && (
            <button disabled={busy} onClick={() => setQuery("")}>
              查看全部
            </button>
          )}
        </div>
        <div className="logo-picker-body">
          <div className="logo-picker-results">
            {loading && !catalog ? (
              <div className="media-empty">
                <LoaderCircle className="spin" size={22} />
                正在加载…
              </div>
            ) : (
              <>
                <div className="logo-picker-grid">
                  {rows.slice(0, limit).map((logo) => (
                    <button
                      key={logo.path}
                      className={`logo-candidate ${selected?.path === logo.path ? "selected" : ""}`}
                      aria-pressed={selected?.path === logo.path}
                      disabled={busy}
                      onClick={() => setSelected(logo)}
                    >
                      <div>
                        <CatalogImage logo={logo} />
                      </div>
                      <strong title={logo.name}>{logo.name}</strong>
                      <span>
                        {logo.game === "cs2"
                          ? "CS"
                          : logo.game === "lol"
                            ? "英雄联盟"
                            : "Dota 2"}
                      </span>
                    </button>
                  ))}
                </div>
                {!rows.length && (
                  <div className="media-empty">
                    没有匹配结果，试试战队简称或「查看全部」。
                  </div>
                )}
                {rows.length > limit && (
                  <button
                    className="media-button media-more"
                    disabled={busy}
                    onClick={() => setLimit(limit + 36)}
                  >
                    加载更多
                  </button>
                )}
              </>
            )}
          </div>
          <aside className="logo-binding-preview">
            <span className="logo-preview-label">选中的图标</span>
            <div className={`media-image-preview logo ${background}`}>
              {selected ? (
                <CatalogImage key={selected.sha} logo={selected} large />
              ) : (
                <span>点击左侧图标预览</span>
              )}
            </div>
            <div className="logo-preview-meta">
              <strong>{selected?.name || "尚未选择"}</strong>
              <div className="media-swatches">
                {[
                  ["dark", "#101219", "深色底"],
                  ["light", "#e8e9eb", "浅色底"],
                ].map(([value, color, name]) => (
                  <button
                    key={value}
                    title={name}
                    aria-label={name}
                    aria-pressed={background === value}
                    style={{ background: color }}
                    onClick={() => setBackground(value)}
                  />
                ))}
              </div>
            </div>
            <div className="logo-binding-target">
              <ArrowRight size={16} />
              <span>
                绑定到 <b>{team.name}</b>
              </span>
            </div>
            <button
              className="media-button primary logo-bind-button"
              disabled={!selected || busy}
              onClick={() => void bind()}
            >
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Download size={16} />
              )}
              {busy ? "正在下载并绑定…" : "绑定到当前战队"}
            </button>
            {selected && (
              <a
                className="logo-source-link"
                href={`https://github.com/lootmarket/esport-team-logos/blob/master/${selected.path.split("/").map(encodeURIComponent).join("/")}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={13} />
                查看原图来源
              </a>
            )}
          </aside>
        </div>
        <footer>
          <a
            href="https://github.com/lootmarket/esport-team-logos"
            target="_blank"
            rel="noreferrer"
          >
            esport-team-logos <ExternalLink size={12} />
          </a>
          <span>
            {catalog ? `目录更新于 ${catalog.fetchedAt.slice(0, 10)}` : ""}
          </span>
        </footer>
      </div>
    </div>
  );
}
