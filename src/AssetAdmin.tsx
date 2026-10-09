import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Download,
  ExternalLink,
  ImagePlus,
  LoaderCircle,
  Plus,
  RotateCcw,
  Save,
  Search,
  Shield,
  UserRound,
  CircleAlert,
  Upload,
  X,
} from "lucide-react";
import type { Game } from "./domain";
import {
  catalogLogoUrl,
  teamInitials,
  logoReviewText,
  type MediaItem,
  type MediaSlot,
} from "./media";
import "./admin.css";
import { LogoPicker } from "./LogoPicker";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "保存失败，请重试。");
  return data;
}
function Thumbnail({
  src,
  name,
  logo = false,
}: {
  src?: string;
  name: string;
  logo?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? (
    <img
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{
        objectFit: logo ? "contain" : "cover",
        objectPosition: logo ? "center" : "center 15%",
      }}
    />
  ) : (
    <span className="media-initials">{teamInitials(name)}</span>
  );
}
function ImageSlot({
  item,
  slot,
  busy,
  onChange,
}: {
  item: MediaItem;
  slot: MediaSlot;
  busy: boolean;
  onChange: (slot: MediaSlot, file: File | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [background, setBackground] = useState("dark");
  const label = {
    logo: "战队图标",
    portrait: item.kind === "player" ? "选手头像" : "英雄头像",
    artwork: item.kind === "player" ? "选手定妆照" : "英雄立绘",
  }[slot];
  return (
    <section className="media-slot">
      <div className="media-slot-heading">
        <h3>{label}</h3>
        <span>
          {item.overrides.includes(slot)
            ? "自定义"
            : slot === "logo" && item.automaticLogo
              ? "自动匹配"
              : item.images[slot]
                ? "默认"
                : "未设置"}
        </span>
      </div>
      <div className={`media-image-preview ${slot} ${background}`}>
        {item.images[slot] ? (
          <img src={item.images[slot]} alt={label} />
        ) : slot === "logo" ? (
          <span className="media-initials">{teamInitials(item.name)}</span>
        ) : (
          <ImagePlus size={42} strokeWidth={1} />
        )}
      </div>
      <div className="media-slot-actions">
        <button
          className="media-button"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Upload size={15} />
          {item.images[slot] ? "替换图片" : "上传图片"}
        </button>
        <button
          className="icon-button"
          disabled={busy || !item.overrides.includes(slot)}
          title={`恢复默认${label}`}
          aria-label={`恢复默认${label}`}
          onClick={() => onChange(slot, null)}
        >
          <RotateCcw size={16} />
        </button>
        <div className="media-swatches" aria-label="预览底色">
          {[
            ["dark", "#101219", "深色"],
            ["light", "#e8e9eb", "浅色"],
            ["checker", "#797c83", "透明格"],
          ].map(([value, color, title]) => (
            <button
              key={value}
              title={title}
              aria-label={title}
              aria-pressed={background === value}
              style={{ background: color }}
              onClick={() => setBackground(value)}
            />
          ))}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label={`上传${label}`}
        hidden
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onChange(slot, file);
        }}
      />
    </section>
  );
}

export function AssetAdmin() {
  const initialGame: Game =
    new URLSearchParams(location.search).get("game") === "cs2"
      ? "cs2"
      : new URLSearchParams(location.search).get("game") === "lol"
        ? "lol"
        : "dota2";
  const [game, setGame] = useState<Game>(initialGame);
  const [kind, setKind] = useState<"team" | "hero" | "player">(
    new URLSearchParams(location.search).get("kind") === "player"
      ? "player"
      : "team",
  );
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(
    new URLSearchParams(location.search).get("filter") === "review"
      ? "review"
      : "all",
  );
  const [limit, setLimit] = useState(60);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [pickerTeam, setPickerTeam] = useState<MediaItem | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoCandidate, setPhotoCandidate] =
    useState<MediaItem["photoSource"]>();
  const selected = items.find(
    (item) => item.id === selectedId && item.kind === kind,
  );
  const list = useMemo(
    () =>
      items.filter(
        (item) =>
          item.kind === kind &&
          [item.name, ...item.aliases].some((v) =>
            v.toLowerCase().includes(query.trim().toLowerCase()),
          ) &&
          (filter === "all" ||
            (filter === "review"
              ? Boolean(item.logoReview)
              : filter === "custom"
                ? !!item.overrides.length
                : kind === "team"
                  ? !item.images.logo
                  : kind === "player"
                    ? !item.images.portrait && !item.images.artwork
                    : !item.images.portrait || !item.images.artwork)),
      ),
    [items, kind, query, filter],
  );
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setNotice("");
    setItems([]);
    setSelectedId("");
    history.replaceState(null, "", `/admin?game=${game}`);
    request<MediaItem[]>(`/api/media?game=${game}`, {
      signal: controller.signal,
    })
      .then((data) => {
        setItems(data);
        setSelectedId(data.find((item) => item.kind === kind)?.id || "");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [game]);
  useEffect(() => {
    setName(selected?.name || "");
    setAliases(selected?.aliases.join("\n") || "");
  }, [selected]);
  useEffect(() => {
    setPhotoCandidate(undefined);
    setPhotoUrl(
      selected?.kind === "player" && /^[a-z0-9-]+$/i.test(selected.name)
        ? `https://prosettings.net/players/${selected.name.toLowerCase()}/`
        : "",
    );
  }, [selected?.id]);
  useEffect(() => {
    setSelectedId((id) =>
      items.some((item) => item.id === id && item.kind === kind)
        ? id
        : items.find((item) => item.kind === kind)?.id || "",
    );
  }, [items, kind]);
  useEffect(() => setLimit(60), [query, kind, filter]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  const refresh = async () =>
    setItems(await request<MediaItem[]>(`/api/media?game=${game}`));
  async function act(action: () => Promise<void>, notice = "已保存") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await refresh();
      setNotice(notice);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const changeImage = (slot: MediaSlot, file: File | null) => {
    if (!selected) return;
    if (file && file.size > 12 * 1024 * 1024) {
      setError("图片不能超过 12 MB。");
      return;
    }
    void act(async () => {
      await request(
        `/api/media/${selected.id}/${slot}?game=${game}`,
        file
          ? {
              method: "PUT",
              headers: { "Content-Type": "application/octet-stream" },
              body: file,
            }
          : { method: "DELETE" },
      );
    });
  };
  const teamBody = (name: string, aliases: string[]) => ({
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, aliases }),
  });
  return (
    <div className="app media-admin">
      <header className="topbar">
        <a className="brand" href={`/?game=${game}`}>
          <span className="mark">
            M<span />
          </span>
          <b>
            matchcut<span className="word-dot">.</span>
          </b>
        </a>
        <nav className="top-links">
          <a href={`/?game=${game}`}>视频工作台</a>
          <span className="active">素材管理</span>
        </nav>
        <a className="top-right media-back" href={`/?game=${game}`}>
          <ArrowLeft size={16} />
          <span>返回工作台</span>
        </a>
      </header>
      <div className="media-heading">
        <div>
          <span className="media-eyebrow">ASSET LIBRARY</span>
          <h1>素材管理</h1>
        </div>
        <div className="game-switch">
          {(["dota2", "lol", "cs2"] as const).map((g) => (
            <button
              key={g}
              disabled={busy}
              className={game === g ? "selected" : ""}
              aria-pressed={game === g}
              onClick={() => {
                setQuery("");
                setKind("team");
                setGame(g);
              }}
            >
              {g === "cs2" ? "CS" : g === "lol" ? "英雄联盟" : "Dota 2"}
            </button>
          ))}
        </div>
      </div>
      <div className="media-tabs" role="tablist" aria-label="素材类别">
        {[
          ["team", "战队图标"],
          ...(game === "cs2" ? [] : [["hero", "英雄图片"]]),
          ["player", "选手定妆照"],
        ].map(([value, title]) => (
          <button
            role="tab"
            aria-selected={kind === value}
            key={value}
            disabled={busy}
            onClick={() => {
              setKind(value as typeof kind);
              setQuery("");
              setFilter("all");
              setSelectedId(
                items.find((item) => item.kind === value)?.id || "",
              );
            }}
          >
            {value === "player" ? (
              <UserRound size={16} />
            ) : (
              <Shield size={16} />
            )}
            {title}
            <span>{items.filter((item) => item.kind === value).length}</span>
          </button>
        ))}
      </div>
      <div className="media-status" aria-live="polite">
        {busy ? (
          <>
            <LoaderCircle className="spin" size={15} />
            正在保存…
          </>
        ) : notice ? (
          <>
            <Check size={15} />
            {notice}
          </>
        ) : null}
        {error && <span role="alert">{error}</span>}
      </div>
      <div className="media-layout">
        <section className="media-browser">
          <div className="media-toolbar">
            <label className="media-search">
              <Search size={16} />
              <input
                aria-label="搜索素材"
                placeholder={
                  kind === "team"
                    ? "搜索战队 / 别名"
                    : kind === "player"
                      ? "搜索选手"
                      : "搜索英雄"
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="素材筛选"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="custom">已替换</option>
              <option value="missing">待补图</option>
              {kind === "team" && <option value="review">待确认队标</option>}
            </select>
            {kind === "team" && (
              <button
                className="media-button"
                disabled={busy}
                onClick={() => {
                  setNewName("");
                  setAdding(true);
                }}
              >
                <Plus size={16} />
                <span>新增战队</span>
              </button>
            )}
          </div>
          {loading ? (
            <div className="media-empty">
              <LoaderCircle className="spin" size={22} />
              正在加载素材…
            </div>
          ) : (
            <>
              <div className="media-result-count">
                {list.length}{" "}
                {kind === "team"
                  ? "支战队"
                  : kind === "player"
                    ? "位选手"
                    : "位英雄"}
              </div>
              <div className="media-grid">
                {list.slice(0, limit).map((item) => (
                  <button
                    key={item.id}
                    className={`media-tile ${selectedId === item.id ? "selected" : ""}`}
                    disabled={busy}
                    aria-pressed={selectedId === item.id}
                    onClick={() => {
                      setSelectedId(item.id);
                      if (window.matchMedia("(max-width: 850px)").matches)
                        document
                          .querySelector(".media-editor")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                    }}
                  >
                    {item.logoReview && (
                      <span
                        className="logo-review-badge"
                        title={logoReviewText(item.logoReview)}
                        aria-label={logoReviewText(item.logoReview)}
                      >
                        <span />
                      </span>
                    )}
                    <div className={`media-thumb ${kind}`}>
                      <Thumbnail
                        src={
                          kind === "team"
                            ? item.images.logo
                            : item.images.portrait || item.images.artwork
                        }
                        name={item.name}
                        logo={kind === "team"}
                      />
                    </div>
                    <strong title={item.name}>{item.name}</strong>
                    <span className={item.overrides.length ? "is-custom" : ""}>
                      {item.logoReview
                        ? logoReviewText(item.logoReview)
                        : item.overrides.length
                          ? "自定义"
                          : kind === "team" && item.automaticLogo
                            ? "自动匹配"
                            : (
                                  kind === "team"
                                    ? item.images.logo
                                    : item.images.portrait ||
                                      item.images.artwork
                                )
                              ? "默认"
                              : "待补图"}
                    </span>
                  </button>
                ))}
              </div>
              {!list.length && (
                <div className="media-empty">没有匹配的素材</div>
              )}
              {list.length > limit && (
                <button
                  className="media-button media-more"
                  onClick={() => setLimit(limit + 60)}
                >
                  加载更多
                </button>
              )}
            </>
          )}
        </section>
        <aside className="media-editor" aria-label="素材编辑">
          {selected ? (
            <>
              <div className="media-editor-title">
                <h2>{selected.name}</h2>
                <span>
                  {selected.kind === "team"
                    ? "TEAM"
                    : selected.kind === "player"
                      ? "PLAYER"
                      : "HERO"}
                </span>
              </div>
              {selected.kind === "player" && (
                <section className="photo-source-picker">
                  <label className="field-label" htmlFor="photo-source-url">
                    从资料页获取照片
                  </label>
                  <input
                    id="photo-source-url"
                    aria-label="选手资料页链接"
                    value={photoUrl}
                    onChange={(e) => {
                      setPhotoUrl(e.target.value);
                      setPhotoCandidate(undefined);
                    }}
                    placeholder="HLTV / ProSettings 选手链接"
                  />
                  <button
                    className="media-button"
                    disabled={busy || !photoUrl.trim()}
                    onClick={() =>
                      void act(async () => {
                        const candidate = await request<
                          NonNullable<MediaItem["photoSource"]>
                        >("/api/player-photo/preview", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ url: photoUrl }),
                        });
                        setPhotoCandidate(candidate);
                      }, "已获取照片，请核对选手后使用")
                    }
                  >
                    <Download size={15} /> 获取照片预览
                  </button>
                  {photoCandidate && (
                    <div className="photo-source-candidate">
                      <img
                        src={photoCandidate.imageUrl}
                        alt={photoCandidate.name}
                      />
                      <div>
                        {photoCandidate.name} · {photoCandidate.provider}
                      </div>
                      <a
                        href={photoCandidate.pageUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        查看资料页 ↗
                      </a>
                      <button
                        className="media-button"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            await request(
                              `/api/media/${selected.id}/photo-source?game=${game}`,
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(photoCandidate),
                              },
                            );
                            setPhotoCandidate(undefined);
                          })
                        }
                      >
                        用于 {selected.name}
                      </button>
                    </div>
                  )}
                  {selected.photoSource && (
                    <a
                      href={selected.photoSource.pageUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      照片来源：{selected.photoSource.provider} ↗
                    </a>
                  )}
                </section>
              )}
              {selected.logoReview && (
                <div className="logo-review-notice" role="status">
                  <CircleAlert size={17} />
                  {selected.logoReview === "ambiguous"
                    ? "同名有多个队标，请从图标库选择。"
                    : "缺少队标，请从图标库选择或上传。"}
                </div>
              )}
              {(selected.kind === "team"
                ? ["logo"]
                : ["portrait", "artwork"]
              ).map((slot) => (
                <ImageSlot
                  key={selected.id + slot}
                  item={selected}
                  slot={slot as MediaSlot}
                  busy={busy}
                  onChange={changeImage}
                />
              ))}
              {selected.kind === "team" && (
                <div className="media-catalog-entry">
                  <button
                    className="media-button"
                    disabled={busy}
                    onClick={() => setPickerTeam(selected)}
                  >
                    <Download size={15} />
                    从图标库选择
                  </button>
                  {selected.logoSource && (
                    <a
                      href={selected.logoSource.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      已绑定：{selected.logoSource.name}{" "}
                      <ExternalLink size={12} />
                    </a>
                  )}
                  {!selected.overrides.includes("logo") &&
                    selected.automaticLogo && (
                      <a
                        href={catalogLogoUrl(selected.automaticLogo)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        自动匹配：{selected.automaticLogo.name}{" "}
                        <ExternalLink size={12} />
                      </a>
                    )}
                </div>
              )}
              {selected.kind === "team" && (
                <form
                  className="media-team-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(async () => {
                      await request(
                        `/api/media/teams/${selected.id}?game=${game}`,
                        {
                          method: "PUT",
                          ...teamBody(
                            name,
                            aliases
                              .split("\n")
                              .map((v) => v.trim())
                              .filter(Boolean),
                          ),
                        },
                      );
                    });
                  }}
                >
                  <label>
                    战队名称
                    <input
                      aria-label="战队名称"
                      value={name}
                      maxLength={100}
                      required
                      disabled={busy}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    其他队名（每行一个）
                    <textarea
                      aria-label="战队别名"
                      rows={3}
                      value={aliases}
                      disabled={busy}
                      onChange={(e) => setAliases(e.target.value)}
                    />
                  </label>
                  <button
                    className="media-button"
                    disabled={busy || !name.trim()}
                  >
                    <Save size={15} />
                    保存队名
                  </button>
                </form>
              )}
            </>
          ) : (
            <div className="media-empty">
              选择
              {kind === "team" ? "战队" : kind === "player" ? "选手" : "英雄"}
            </div>
          )}
        </aside>
      </div>
      {adding && (
        <div
          className="media-modal-backdrop"
          onKeyDown={(e) => {
            if (e.key === "Escape" && !busy) setAdding(false);
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-team-title"
            className="media-dialog"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                const data = await request<{ id: string }>(
                  `/api/media/teams?game=${game}`,
                  { method: "POST", ...teamBody(newName, []) },
                );
                setSelectedId(data.id);
                setQuery("");
                setFilter("all");
                setAdding(false);
              });
            }}
          >
            <div>
              <h2 id="add-team-title">新增战队</h2>
              <button
                className="icon-button"
                type="button"
                disabled={busy}
                title="关闭"
                aria-label="关闭"
                onClick={() => setAdding(false)}
              >
                <X size={18} />
              </button>
            </div>
            <label>
              战队名称
              <input
                autoFocus
                required
                aria-label="新战队名称"
                maxLength={100}
                value={newName}
                disabled={busy}
                onChange={(e) => setNewName(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <button
              className="media-button primary"
              disabled={busy || !newName.trim()}
            >
              <Plus size={16} />
              创建战队
            </button>
          </form>
        </div>
      )}
      {pickerTeam && (
        <LogoPicker
          team={pickerTeam}
          onClose={() => setPickerTeam(null)}
          onBound={async () => {
            await refresh();
            setNotice("图标已绑定");
          }}
        />
      )}
    </div>
  );
}
