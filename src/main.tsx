import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Player, PlayerRef } from "@remotion/player";
import {
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clapperboard,
  Clock3,
  Copy,
  Database,
  FileJson,
  Film,
  FolderDown,
  LoaderCircle,
  Palette,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Type,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import {
  DEFAULT_MATCH,
  FPS,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  MatchData,
  SCENES,
  Settings,
  VideoProps,
  POSITIONS,
  POSITION_NAMES,
  assignedPositions,
  comparisons,
  comparisonScript,
  refreshSettings,
  defaultSettings,
  matchDuration,
  previewProps,
  settingsSchema,
  totalFrames,
} from "./domain";
import { MatchFilm } from "./video/MatchFilm";
import "./style.css";

type Job = {
  id: string;
  status: string;
  progress: number;
  message: string;
  error?: string;
  title?: string;
  matchId?: string;
  files?: Record<string, string>;
  createdAt: string;
  props?: VideoProps;
  width?: number;
  height?: number;
};
async function api<T = any>(url: string, options?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "请求失败");
  return data;
}
const themes = [
  {
    id: "obsidian",
    name: "黑金荣耀",
    description: "曜黑 × 熔金 · 决赛舞台",
    a: "#f6c453",
    b: "#c4d0e4",
    bg: "#080706",
  },
  {
    id: "ember",
    name: "烈焰对决",
    description: "炽橙 × 冰青 · 主场对抗",
    a: "#ff6138",
    b: "#50d9ed",
    bg: "#080a10",
  },
  {
    id: "glacier",
    name: "极地赛场",
    description: "电蓝 × 亮金 · 冷光舞台",
    a: "#53baff",
    b: "#ffcf5a",
    bg: "#070d18",
  },
  {
    id: "paper",
    name: "霓虹交锋",
    description: "紫电 × 酸绿 · 夜场聚焦",
    a: "#c78aff",
    b: "#c6f45e",
    bg: "#100b18",
  },
] as const;
function App() {
  const [match, setMatch] = useState<MatchData | null>(null),
    [settings, setSettings] = useState<Settings | null>(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const [matchId, setMatchId] = useState(DEFAULT_MATCH),
    [source, setSource] = useState<"current" | "latest">("current"),
    [leagueId, setLeagueId] = useState(""),
    [teamId, setTeamId] = useState("");
  const [loading, setLoading] = useState(false),
    [job, setJob] = useState<Job | null>(null),
    [jobs, setJobs] = useState<Job[]>([]),
    [tab, setTab] = useState<"design" | "script">("design");
  const [scene, setScene] = useState(0),
    [help, setHelp] = useState(false),
    [recent, setRecent] = useState<any[] | null>(null),
    [recentLoading, setRecentLoading] = useState(false);
  const [result, setResult] = useState<Job | null>(null),
    [templateNote, setTemplateNote] = useState(false);
  const player = useRef<PlayerRef>(null),
    importInput = useRef<HTMLInputElement>(null),
    ready = useRef(false),
    appliedJob = useRef("");
  const busy = Boolean(job && !["done", "error"].includes(job.status));
  useEffect(() => {
    api("/api/bootstrap")
      .then((data) => {
        setMatch(data.match);
        const prefs = data.preferences;
        setSettings(
          prefs?.settings
            ? refreshSettings(
                data.match,
                settingsSchema.parse(prefs.settings),
                true,
              )
            : data.settings,
        );
        setSource(prefs?.source || "current");
        setLeagueId(prefs?.leagueId || "");
        setTeamId(prefs?.teamId || "");
        setJobs(data.jobs);
        const active = data.jobs.find(
          (j: Job) => !["done", "error"].includes(j.status),
        );
        if (active) setJob(active);
        ready.current = true;
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!settings || !ready.current) return;
    const id = setTimeout(() => {
      api("/api/preferences", {
        method: "PUT",
        body: JSON.stringify({ settings, source, leagueId, teamId }),
      }).catch((e) => setError("偏好未保存：" + e.message));
    }, 700);
    return () => clearTimeout(id);
  }, [settings, source, leagueId, teamId]);
  useEffect(() => {
    if (!busy || !job) return;
    let stopped = false;
    let pollErrors = 0;
    const poll = async () => {
      try {
        const value = await api<Job>("/api/jobs/" + job.id);
        if (stopped) return;
        pollErrors = 0;
        setJob(value);
        if (value.props && appliedJob.current !== value.id) {
          appliedJob.current = value.id;
          setMatch(value.props.match);
          setMatchId(value.props.match.id);
          setSettings(value.props.settings);
        }
        if (value.status === "done") {
          setResult(value);
          setJobs(await api("/api/jobs"));
          setToast("视频、封面和字幕都准备好了");
        }
        if (value.status === "error") setError(value.error || value.message);
      } catch (e) {
        if (++pollErrors >= 3 && !stopped)
          setError(
            "暂时无法读取生成进度。后台任务可能仍在继续，请恢复连接后刷新。",
          );
      }
    };
    const id = setInterval(poll, 1200);
    void poll();
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [busy, job?.id]);
  const props = useMemo(
    () => (match && settings ? previewProps(match, settings) : null),
    [match, settings],
  );
  const frames = props ? totalFrames(props.segments) : 1;
  useEffect(() => {
    const currentPlayer = player.current;
    if (!currentPlayer || !props) return;
    const onFrame = ({ detail }: { detail: { frame: number } }) => {
      let offset = 0;
      let index = 0;
      props.segments.forEach((seg, i) => {
        if (detail.frame >= offset) index = i;
        offset += seg.frames;
      });
      setScene(index);
    };
    currentPlayer.addEventListener("frameupdate", onFrame);
    return () => currentPlayer.removeEventListener("frameupdate", onFrame);
  }, [props]);

  function patch<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
  }
  async function load(id: string) {
    setLoading(true);
    setError("");
    try {
      const data = await api("/api/matches/" + encodeURIComponent(id.trim()));
      setMatch(data.match);
      setMatchId(data.match.id);
      setSettings((current) =>
        current ? refreshSettings(data.match, current) : data.settings,
      );
      setSource("current");
      setRecent(null);
      setResult(null);
      setScene(0);
      player.current?.seekTo(60);
      setToast(data.cached ? "已载入本地保存的比赛" : "比赛数据已载入并保存");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function showRecent() {
    setRecentLoading(true);
    setError("");
    try {
      setRecent(await api("/api/recent"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRecentLoading(false);
    }
  }
  async function generate() {
    if (!match || !settings || busy) return;
    setError("");
    setResult(null);
    try {
      setJob(
        await api("/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            matchId: match.id,
            settings,
            source,
            leagueId,
            teamId,
          }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function seek(index: number) {
    if (!props) return;
    setScene(index);
    player.current?.pause();
    player.current?.seekTo(
      props.segments.slice(0, index).reduce((sum, x) => sum + x.frames, 0) + 65,
    );
  }
  function changeComparison(changes: Partial<Settings>) {
    if (!match) return;
    setSettings((current) => {
      if (!current) return current;
      const next = { ...current, ...changes, scripts: [...current.scripts] };
      next.scripts[2] = comparisonScript(match, next);
      return next;
    });
    player.current?.pause();
  }
  function changePosition(slot: number, position: number) {
    if (!match || !settings) return;
    const assigned = assignedPositions(match, settings);
    const current = assigned.find((x) => x.player.slot === slot)!;
    const occupant = assigned.find(
      (x) =>
        x.player.side === current.player.side &&
        x.position === position &&
        x.player.slot !== slot,
    );
    const roles =
      settings.positionOverrides?.matchId === match.id
        ? { ...settings.positionOverrides.roles }
        : {};
    if (occupant) roles[occupant.player.slot] = current.position || 0;
    roles[slot] = position;
    changeComparison({ positionOverrides: { matchId: match.id, roles } });
  }
  function exportTemplate() {
    if (!settings || !match) return;
    const file = new Blob(
      [
        JSON.stringify(
          {
            schemaVersion: 3,
            aspectRatio: "16:9",
            matchId: match.id,
            settings,
            source,
            leagueId,
            teamId,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = "matchcut-project-" + match.id + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
    setToast("项目设置已导出，可再次导入");
  }
  async function importTemplate(file: File) {
    setError("");
    setLoading(true);
    try {
      const json = JSON.parse(await file.text());
      const next = settingsSchema.parse({
        ...json.settings,
        radarMode:
          json.schemaVersion <= 2 && !json.settings?.radarMode
            ? "damage"
            : json.settings?.radarMode,
      });
      if (!/^\d{6,15}$/.test(String(json.matchId)))
        throw new Error("项目里没有有效的比赛编号。");
      const data = await api("/api/matches/" + json.matchId);
      setMatch(data.match);
      setMatchId(data.match.id);
      setSettings(next);
      setSource("current");
      setResult(null);
      setToast("已恢复比赛、模板与文案");
    } catch (e) {
      setError("导入失败：" + (e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  if (!match || !settings || !props)
    return (
      <div className="boot">
        <div className="mark">M</div>
        <h2>Matchcut</h2>
        {error ? (
          <>
            <p className="error-text">{error}</p>
            <button onClick={() => location.reload()}>重新连接</button>
          </>
        ) : (
          <p>
            <LoaderCircle className="spin" size={16} /> 正在打开工作台…
          </p>
        )}
      </div>
    );
  const winner = match[match.winner];
  const matchups = comparisons(match, settings);
  const assigned = assignedPositions(match, settings);
  const incomplete = matchups.some((c) => !c.pair);
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="mark">
            M<span />
          </span>
          <b>
            matchcut<span className="word-dot">.</span>
          </b>
        </a>
        <div className="top-links">
          <span className="active">视频工作台</span>
          <button
            onClick={() => {
              setTab("design");
              setTemplateNote(true);
              document
                .getElementById("inspector")
                ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }}
          >
            我的模板
          </button>
        </div>
        <div className="top-right">
          <span className="local-dot" /> 本机运行{" "}
          <button
            className="icon-button"
            title="使用指南"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={19} />
          </button>
        </div>
      </header>
      <div className="page-intro">
        <div>
          <div className="eyebrow">POST-MATCH PRODUCTION / DOTA 2</div>
          <h1>
            赛后，数据上场<span>。</span>
          </h1>
          <p>选手雷达 · 经济走势 · 伤害排行。选一场比赛，生成横屏赛后视频。</p>
        </div>
        <div className="workspace-label">
          <Film size={17} />
          <span>
            Dota 2 工作空间<small>LOCAL STUDIO / 01</small>
          </span>
        </div>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="关闭错误">
            <X size={16} />
          </button>
        </div>
      )}
      <main className="workspace">
        <aside className="left-panel">
          <div className="panel-title">
            <span className="step-dot">1</span>
            <h2>选择比赛</h2>
            <span className="tiny-tag">DOTA 2</span>
          </div>
          <div className="source-switch">
            <button
              className={source === "current" ? "selected" : ""}
              onClick={() => setSource("current")}
            >
              指定比赛
            </button>
            <button
              className={source === "latest" ? "selected" : ""}
              onClick={() => setSource("latest")}
            >
              <Radio size={13} /> 自动最新
            </button>
          </div>
          {source === "current" ? (
            <>
              <label className="field-label">比赛编号</label>
              <form
                className="match-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void load(matchId);
                }}
              >
                <input
                  aria-label="比赛编号"
                  value={matchId}
                  onChange={(e) => setMatchId(e.target.value)}
                  inputMode="numeric"
                />
                <button title="载入比赛" disabled={loading || busy}>
                  {loading ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <ArrowRight size={17} />
                  )}
                </button>
              </form>
              <button
                className="text-button recent-button"
                onClick={showRecent}
                disabled={recentLoading || busy}
              >
                {recentLoading ? (
                  <LoaderCircle className="spin" size={13} />
                ) : (
                  <Clock3 size={13} />
                )}{" "}
                浏览最近职业赛 <ArrowRight size={13} />
              </button>
            </>
          ) : (
            <div className="auto-source">
              <p>每次生成时，自动选择最新已解析的职业赛。</p>
              <label className="field-label">
                关注战队编号 <span>选填 · 可跨赛事</span>
              </label>
              <input
                aria-label="关注战队编号"
                placeholder="留空关注所有战队"
                value={teamId}
                onChange={(e) =>
                  setTeamId(e.target.value.replace(/\D/g, "").slice(0, 12))
                }
              />
              <div className="follow-teams">
                {(["radiant", "dire"] as const).map((side) =>
                  match[(side + "Id") as "radiantId" | "direId"] ? (
                    <button
                      key={side}
                      className={
                        teamId ===
                        String(match[(side + "Id") as "radiantId" | "direId"])
                          ? "following"
                          : ""
                      }
                      onClick={() =>
                        setTeamId(
                          teamId ===
                            String(
                              match[(side + "Id") as "radiantId" | "direId"],
                            )
                            ? ""
                            : String(
                                match[(side + "Id") as "radiantId" | "direId"],
                              ),
                        )
                      }
                    >
                      关注 {match[side]}
                    </button>
                  ) : null,
                )}
              </div>
              <label className="field-label">
                限定联赛编号 <span>选填 · 当前届次</span>
              </label>
              <input
                aria-label="限定联赛编号"
                placeholder="留空选择全部职业赛"
                value={leagueId}
                onChange={(e) =>
                  setLeagueId(e.target.value.replace(/\D/g, "").slice(0, 8))
                }
              />
              <small>外观设置会保留，赛果文案随新比赛重新生成。</small>
            </div>
          )}
          <div className="match-card">
            <div className="match-card-top">
              <span className="status-dot" />
              {match.league}
              <span>单局</span>
            </div>
            <div className="team-row">
              <span className="team-initial radiant">
                {match.radiant.slice(0, 1)}
              </span>
              <b>{match.radiant}</b>
              <strong>{match.radiantScore}</strong>
            </div>
            <div className="team-row">
              <span className="team-initial dire">
                {match.dire.slice(0, 1)}
              </span>
              <b>{match.dire}</b>
              <strong>{match.direScore}</strong>
            </div>
            <div className="match-card-bottom">
              <span>
                <Clock3 size={12} />
                {matchDuration(match.duration)}
              </span>
              <span>{winner} 胜</span>
            </div>
          </div>
          <div className="source-caption">
            {source === "latest"
              ? "当前画面为预览比赛；生成时更新数据。"
              : match.id === DEFAULT_MATCH
                ? "内置真实比赛样片 · 可离线生成"
                : "已保存比赛快照 · 可重复生成"}
          </div>
          <div className="section-divider" />
          <div className="subheading">
            <span>节目编排</span>
            <span>5 幕</span>
          </div>
          <div className="story-list">
            {SCENES.map((name, i) => (
              <button
                key={name}
                onClick={() => seek(i)}
                className={scene === i ? "current" : ""}
              >
                <span className="scene-num">0{i + 1}</span>
                <div>
                  <b>{name}</b>
                  <small>
                    {
                      [
                        "最终赛果与看点",
                        "优势随时间的变化",
                        settings.radarMode === "damage"
                          ? "双方伤害最高"
                          : settings.radarPosition === "all"
                            ? "一至五号位 · 五组对位"
                            : POSITION_NAMES[
                                Number(settings.radarPosition) as
                                  1 | 2 | 3 | 4 | 5
                              ],
                        "全场输出前五",
                        "结果与数据出处",
                      ][i]
                    }
                  </small>
                </div>
                <span className="scene-time">
                  {Math.round(props.segments[i].frames / FPS)}s
                </span>
              </button>
            ))}
          </div>
          <div className="data-note">
            <Database size={17} />
            <div>
              <b>数据有出处，内容可追溯</b>
              <p>
                OpenDota API · 不依赖网页抓取
                <br />
                原始数据随视频一同保存
              </p>
              <a href={match.source} target="_blank" rel="noreferrer">
                查看本场来源 ↗
              </a>
            </div>
          </div>
        </aside>
        <section className="preview-panel">
          <div className="preview-heading">
            <div>
              <span className="step-dot">2</span>
              <h2>成片预览</h2>
            </div>
            <span className="preview-meta">
              16:9 <span>·</span>{" "}
              {settings.resolution === "1080" ? "1920 × 1080" : "1280 × 720"}
            </span>
          </div>
          <div className="preview-stage">
            <div className="stage-badge">
              <span /> {SCENES[scene]}{" "}
              <span className="preview-indicator">预览</span>
            </div>
            <div className="player-shell">
              <Player
                ref={player}
                key={match.id}
                component={MatchFilm}
                inputProps={props}
                durationInFrames={frames}
                fps={FPS}
                compositionWidth={VIDEO_WIDTH}
                compositionHeight={VIDEO_HEIGHT}
                style={{ width: "100%" }}
                controls
                initialFrame={65}
                loop
                showVolumeControls={false}
                clickToPlay
                doubleClickToFullscreen
              />
            </div>
            <div className="stage-bottom">
              <span>
                <span className="stage-dot" /> 实时画面预览
              </span>
              <span>静音成片 · 自由搭配 BGM</span>
            </div>
          </div>
          <div className="scene-strip">
            {SCENES.map((name, i) => (
              <button
                key={name}
                onClick={() => seek(i)}
                className={scene === i ? "active" : ""}
              >
                <span>0{i + 1}</span>
                {name}
              </button>
            ))}
          </div>
          <section className="matchups-panel">
            <div className="subheading">
              <span>雷达对比</span>
              <span>
                {settings.radarMode === "positions" ? "按职责对位" : "输出焦点"}
              </span>
            </div>
            <div className="comparison-controls">
              <select
                aria-label="雷达对比模式"
                value={settings.radarMode}
                onChange={(e) =>
                  changeComparison({
                    radarMode: e.target.value as Settings["radarMode"],
                  })
                }
              >
                <option value="positions">按位置对比（默认）</option>
                <option value="damage">双方伤害最高</option>
              </select>
              {settings.radarMode === "positions" && (
                <select
                  aria-label="展示位置"
                  value={settings.radarPosition}
                  onChange={(e) =>
                    changeComparison({
                      radarPosition: e.target
                        .value as Settings["radarPosition"],
                    })
                  }
                >
                  <option value="all">全部五组对位</option>
                  {POSITIONS.map((position) => (
                    <option key={position} value={String(position)}>
                      {POSITION_NAMES[position]}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="matchup-list">
              {matchups.map((c, i) => (
                <button
                  key={c.key}
                  onClick={() => {
                    setScene(2);
                    player.current?.pause();
                    player.current?.seekTo(
                      props.segments[0].frames +
                        props.segments[1].frames +
                        Math.floor(
                          (props.segments[2].frames * i) / matchups.length,
                        ) +
                        65,
                    );
                  }}
                >
                  <span>{c.label}</span>
                  <b>
                    {c.pair
                      ? c.pair[0].name + " vs " + c.pair[1].name
                      : "对位待修正"}
                  </b>
                  <small>{c.provenance}</small>
                </button>
              ))}
            </div>
            {settings.radarMode === "positions" && (
              <details className="position-editor">
                <summary>
                  核对 / 修正选手位置 <span>仅影响本场比赛</span>
                </summary>
                <p>
                  位置来自 OpenDota
                  的估计，不按玩家列表顺序分配。选择已占用的位置会交换两人；换比赛后重新读取位置。
                </p>
                <div className="position-teams">
                  {(["radiant", "dire"] as const).map((side) => (
                    <div key={side}>
                      <b>{match[side]}</b>
                      {assigned
                        .filter((x) => x.player.side === side)
                        .map((x) => (
                          <label key={x.player.slot}>
                            <span>
                              {x.player.name}
                              <small>
                                {x.source === "manual"
                                  ? "手动指定"
                                  : x.source === "estimate"
                                    ? "数据源估计"
                                    : "缺失 / 冲突"}
                              </small>
                            </span>
                            <select
                              aria-label={
                                match[side] + " " + x.player.name + " 位置"
                              }
                              value={x.position || 0}
                              onChange={(e) =>
                                changePosition(
                                  x.player.slot,
                                  Number(e.target.value),
                                )
                              }
                            >
                              <option value="0">待确定</option>
                              {POSITIONS.map((position) => (
                                <option key={position} value={position}>
                                  {POSITION_NAMES[position]}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                    </div>
                  ))}
                </div>
                <button
                  className="text-button"
                  onClick={() =>
                    changeComparison({ positionOverrides: undefined })
                  }
                >
                  <RefreshCw size={13} /> 恢复数据源估计
                </button>
              </details>
            )}
            {incomplete && (
              <p className="error-text" role="alert">
                有位置缺失或重复，请修正后生成；不会用伤害排名替代对位。
              </p>
            )}
            <p className="comparison-note">
              一至三号位：击杀、助攻、经济、经验、伤害、推塔。四、五号位：助攻、参战率、观察守卫、岗哨守卫、眩晕时长、治疗。均为本场数据，非能力评级。
            </p>
          </section>
          <div className="export-bar">
            <div>
              <b>{busy ? "正在渲染赛后节目" : "导出横屏成片"}</b>
              <span>
                {busy ? job?.message : "MP4 视频 + 封面 + 字幕 + 数据档案"}
              </span>
            </div>
            <button
              className="generate-button"
              onClick={generate}
              disabled={busy || loading || (incomplete && source !== "latest")}
            >
              {busy ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <Clapperboard size={18} />
              )}{" "}
              {busy ? "生成中 " + job?.progress + "%" : "一键生成视频"}
              {!busy && <ArrowRight size={17} />}
            </button>
          </div>
          {busy && (
            <div
              className="progress-track"
              role="progressbar"
              aria-valuenow={job?.progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div style={{ width: job?.progress + "%" }} />
            </div>
          )}
          {result?.files && (
            <div className="result-card">
              <CheckCircle2 size={23} />
              <div>
                <b>成片已就绪</b>
                <p>{result.title}</p>
              </div>
              <button
                className="outline-button"
                onClick={() => setResult({ ...result, status: "preview" })}
              >
                <Play size={14} /> 观看
              </button>
              <a
                className="solid-small"
                href={result.files["matchcut.mp4"]}
                download
              >
                <ArrowDownToLine size={15} /> 下载
              </a>
              <div className="result-extras">
                {[
                  "cover.png",
                  "captions.srt",
                  "project.json",
                  "source.json",
                ].map((file, i) => (
                  <a key={file} href={result.files![file]} download>
                    {["封面", "字幕", "项目设置", "原始数据"][i]} ↗
                  </a>
                ))}
              </div>
            </div>
          )}
        </section>
        <aside className="inspector" id="inspector">
          <div className="panel-title">
            <span className="step-dot">3</span>
            <h2>节目设置</h2>
            <SlidersHorizontal size={16} />
          </div>
          <div className="inspector-tabs">
            <button
              className={tab === "design" ? "selected" : ""}
              onClick={() => setTab("design")}
            >
              <Palette size={14} /> 外观与节奏
            </button>
            <button
              className={tab === "script" ? "selected" : ""}
              onClick={() => setTab("script")}
            >
              <Type size={14} /> 标题与文案
            </button>
          </div>
          {templateNote && (
            <div className="small-notice">
              外观和生成偏好会自动保存。导出项目可以保留这场比赛的完整文案。
              <button
                onClick={() => setTemplateNote(false)}
                aria-label="关闭说明"
              >
                <X size={12} />
              </button>
            </div>
          )}
          {tab === "design" ? (
            <>
              <label className="field-label">选择一个起点</label>
              <div className="theme-options">
                {themes.map((t) => (
                  <button
                    key={t.id}
                    className={
                      "theme-card " + (settings.theme === t.id ? "chosen" : "")
                    }
                    onClick={() =>
                      setSettings((s) =>
                        s
                          ? { ...s, theme: t.id, accent: t.a, secondary: t.b }
                          : s,
                      )
                    }
                  >
                    <span className="theme-mini" style={{ background: t.bg }}>
                      <i style={{ background: t.a, width: "45%" }} />
                      <i style={{ background: t.b, width: "65%" }} />
                      <span style={{ color: t.a }}>
                        44<span style={{ color: t.b }}>42</span>
                      </span>
                    </span>
                    <span>
                      <b>{t.name}</b>
                      <small>{t.description}</small>
                    </span>
                    {settings.theme === t.id && <Check size={15} />}
                  </button>
                ))}
              </div>
              <label className="field-label">栏目名称</label>
              <input
                aria-label="栏目名称"
                maxLength={24}
                value={settings.brand}
                onChange={(e) => patch("brand", e.target.value)}
              />
              <label className="field-label">战队配色</label>
              <div className="color-fields">
                <label>
                  <input
                    type="color"
                    aria-label="天辉配色"
                    value={settings.accent}
                    onChange={(e) => patch("accent", e.target.value)}
                  />
                  天辉<span>{settings.accent.toUpperCase()}</span>
                </label>
                <label>
                  <input
                    type="color"
                    aria-label="夜魇配色"
                    value={settings.secondary}
                    onChange={(e) => patch("secondary", e.target.value)}
                  />
                  夜魇<span>{settings.secondary.toUpperCase()}</span>
                </label>
              </div>
              <div className="section-divider" />
              <div className="subheading">
                节奏与输出 <AudioLines size={15} />
              </div>
              {(
                [
                  {
                    key: "captions",
                    title: "画面字幕",
                    desc: "同时导出独立 SRT",
                  },
                ] as const
              ).map((toggle) => (
                <label className="toggle-row" key={toggle.key}>
                  <span>
                    <b>{toggle.title}</b>
                    <small>{toggle.desc}</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings[toggle.key]}
                    onChange={(e) => patch(toggle.key, e.target.checked)}
                  />
                  <i />
                </label>
              ))}
              <label className="field-label">特效强度</label>
              <select
                aria-label="特效强度"
                value={settings.effects}
                onChange={(e) =>
                  patch("effects", e.target.value as Settings["effects"])
                }
              >
                <option value="arena">高燃 · 粒子 / 光带 / 辉光</option>
                <option value="restrained">收敛 · 减少粒子与光效</option>
              </select>
              <label className="field-label">镜头节奏</label>
              <select
                aria-label="画面节奏"
                value={settings.pace}
                onChange={(e) =>
                  patch("pace", e.target.value as Settings["pace"])
                }
              >
                <option value="snappy">利落 · 较快切换</option>
                <option value="standard">标准 · 清晰易读</option>
                <option value="relaxed">舒展 · 留足阅读时间</option>
              </select>
              <label className="field-label">导出清晰度</label>
              <select
                aria-label="导出清晰度"
                value={settings.resolution}
                onChange={(e) =>
                  patch("resolution", e.target.value as Settings["resolution"])
                }
              >
                <option value="1080">1080p · 正式发布</option>
                <option value="720">720p · 快速试片</option>
              </select>
            </>
          ) : (
            <>
              <div className="small-notice">
                {source === "latest"
                  ? "自动最新模式会重写标题和五段文案。要使用这里的编辑，切换到「指定比赛」。"
                  : "这些文案由当前比赛数据生成。可以编辑，再一键重做。"}
              </div>
              <label className="field-label">
                开场标题 <span>{settings.headline.length}/44</span>
              </label>
              <textarea
                rows={2}
                aria-label="开场标题"
                maxLength={44}
                value={settings.headline}
                onChange={(e) => patch("headline", e.target.value)}
              />
              {SCENES.map((name, i) => (
                <div className="script-block" key={name}>
                  <label className="field-label">
                    0{i + 1} · {name}
                  </label>
                  <textarea
                    rows={4}
                    aria-label={name + "文案"}
                    value={settings.scripts[i]}
                    maxLength={240}
                    onChange={(e) =>
                      patch(
                        "scripts",
                        settings.scripts.map((text, j) =>
                          j === i ? e.target.value : text,
                        ),
                      )
                    }
                  />
                </div>
              ))}
              <label className="field-label">结尾画面文字</label>
              <textarea
                rows={2}
                aria-label="结尾画面文字"
                maxLength={56}
                value={settings.outro}
                onChange={(e) => patch("outro", e.target.value)}
              />
              <button
                className="text-button"
                onClick={() => {
                  const d = refreshSettings(match, settings, true);
                  patch("scripts", d.scripts);
                  patch("headline", d.headline);
                  setToast("已恢复这场比赛的默认文案");
                }}
              >
                <RefreshCw size={13} /> 恢复默认文案
              </button>
            </>
          )}
          <div className="template-tools">
            <button onClick={exportTemplate}>
              <FolderDown size={14} /> 导出项目
            </button>
            <button onClick={() => importInput.current?.click()}>
              <Upload size={14} /> 导入项目
            </button>
            <input
              ref={importInput}
              type="file"
              accept=".json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importTemplate(file);
                e.target.value = "";
              }}
            />
          </div>
          <div className="saved-hint">
            <Check size={12} /> 外观与生成偏好自动保存在本机
          </div>
        </aside>
      </main>
      <section className="recent-exports">
        <div className="subheading">
          <h2>最近生成</h2>
          <span>{jobs.filter((j) => j.status === "done").length} 个作品</span>
        </div>
        {jobs.filter((j) => j.status === "done").length ? (
          <div className="export-grid">
            {jobs
              .filter((j) => j.status === "done")
              .slice(0, 6)
              .map((j) => (
                <button
                  key={j.id}
                  className="export-item"
                  onClick={() => setResult({ ...j, status: "preview" })}
                >
                  <img src={j.files?.["cover.png"]} />
                  <div>
                    <b>{j.title}</b>
                    <span>
                      {j.width ? "16:9 · " : "旧版竖屏 · "}比赛 #{j.matchId}
                    </span>
                    <small>
                      {new Date(j.createdAt).toLocaleString("zh-CN")}
                    </small>
                  </div>
                  <Play size={18} />
                </button>
              ))}
          </div>
        ) : (
          <div className="empty-exports">
            <Clapperboard size={22} />
            <span>第一条作品，从一次点击开始。</span>
            <small>生成记录和文件会留在你的电脑上。</small>
          </div>
        )}
      </section>
      <footer className="page-footer">
        <span>MATCHCUT / BUILT FOR THE NEXT GAME</span>
        <span>数据来自 OpenDota · 当前支持 Dota 2 职业赛</span>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={16} />
          {toast}
        </div>
      )}
      {recent && (
        <div className="modal-backdrop" onClick={() => setRecent(null)}>
          <div
            className="modal recent-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <h2>最近职业赛</h2>
                <p>选择一场已结束的比赛。部分赛后数据需要等待解析。</p>
              </div>
              <button className="icon-button" onClick={() => setRecent(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="recent-list">
              {recent.map((m) => (
                <button
                  key={m.match_id}
                  disabled={loading || busy}
                  onClick={() => load(String(m.match_id))}
                >
                  <span>
                    <small>{m.league_name}</small>
                    <b>
                      {m.radiant_name} <i>vs</i> {m.dire_name}
                    </b>
                    <small>
                      #{m.match_id} · 联赛 {m.leagueid}
                    </small>
                  </span>
                  <span>
                    {m.radiant_score} : {m.dire_score}
                    <ArrowRight size={16} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {result?.status === "preview" && result.files && (
        <div
          className="modal-backdrop"
          onClick={() => setResult({ ...result, status: "done" })}
        >
          <div
            className="modal video-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <h2>{result.title}</h2>
              <button
                className="icon-button"
                onClick={() => setResult({ ...result, status: "done" })}
              >
                <X size={20} />
              </button>
            </div>
            <video controls autoPlay src={result.files["matchcut.mp4"]} />
            <a
              className="generate-button"
              href={result.files["matchcut.mp4"]}
              download
            >
              <ArrowDownToLine size={17} /> 下载成片
            </a>
          </div>
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <div
            className="modal help-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <h2>从比赛到视频，只需一步</h2>
              <button className="icon-button" onClick={() => setHelp(false)}>
                <X size={20} />
              </button>
            </div>
            <p>
              第一次使用，直接点击「一键生成视频」即可。内置一场真实职业赛的数据和英雄图片，不需要
              API 密钥。
            </p>
            <ol>
              <li>
                <b>换比赛：</b>输入 OpenDota 比赛编号，或浏览最近职业赛。
              </li>
              <li>
                <b>长期使用：</b>
                选「自动最新」，可关注战队以跨赛事跟进，也可限定联赛编号。外观设置会保存，比赛文案每次自动更新。
              </li>
              <li>
                <b>个性化：</b>
                调整配色、栏目名、标题或逐段字幕，画面会即时变化。
              </li>
              <li>
                <b>导出：</b>生成 MP4、PNG 封面、SRT
                字幕、项目设置、发布文案和原始数据。
              </li>
            </ol>
            <p>
              视频不含音轨，导出后可以在剪映等工具中自行加入
              BGM。镜头时长随字幕长度与节奏设置调整。OpenDota
              解析可能滞后；数据不完整时会明确提示，不自动填零。
            </p>
            <p>
              雷达默认按一至五号位逐组对比，可只选一个位置，也可切换为双方伤害最高。
              位置来自 OpenDota 估计，可手动修正；每轴较高者为
              100%，不代表综合能力。
            </p>
            <div className="help-source">
              <a
                href="https://www.opendota.com/"
                target="_blank"
                rel="noreferrer"
              >
                OpenDota ↗
              </a>
              <a
                href="https://www.remotion.dev/"
                target="_blank"
                rel="noreferrer"
              >
                Remotion ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
