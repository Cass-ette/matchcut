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
  MatchData,
  SCENES,
  Settings,
  VideoProps,
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
const presentation = (s: Settings) => ({
  theme: s.theme,
  accent: s.accent,
  secondary: s.secondary,
  brand: s.brand,
  outro: s.outro,
  pace: s.pace,
  captions: s.captions,
  resolution: s.resolution,
});
const themes = [
  {
    id: "ember",
    name: "夜场橙",
    description: "清晰、锐利、有力量",
    a: "#ff8652",
    b: "#76d6c7",
    bg: "#101719",
  },
  {
    id: "glacier",
    name: "冰川蓝",
    description: "冷静的数据观察",
    a: "#6dc9ff",
    b: "#e2bd72",
    bg: "#0d1e2b",
  },
  {
    id: "paper",
    name: "纸上比赛",
    description: "克制的编辑部风格",
    a: "#cc5238",
    b: "#258a80",
    bg: "#f2eee5",
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
            ? {
                ...data.settings,
                ...presentation(settingsSchema.parse(prefs.settings)),
              }
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
      setSettings((current) => ({
        ...data.settings,
        ...(current ? presentation(current) : {}),
      }));
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
  function exportTemplate() {
    if (!settings || !match) return;
    const file = new Blob(
      [
        JSON.stringify(
          {
            schemaVersion: 1,
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
      const next = settingsSchema.parse(json.settings);
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
          <div className="eyebrow">YOUR NEXT MATCH STORY</div>
          <h1>
            把一场比赛，变成一个好故事<span>。</span>
          </h1>
          <p>选好比赛，其余交给模板。你的下一条赛后视频，从这里开始。</p>
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
            <span>这条视频会讲什么</span>
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
                        "双人六维数据对比",
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
              9:16 <span>·</span>{" "}
              {settings.resolution === "1080" ? "1080 × 1920" : "720 × 1280"}
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
                compositionWidth={1080}
                compositionHeight={1920}
                style={{ width: "100%" }}
                controls
                initialFrame={65}
                loop
                showVolumeControls={false}
                clickToPlay
                doubleClickToFullscreen={false}
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
          <div className="export-bar">
            <div>
              <b>{busy ? "正在制作你的下一条视频" : "准备好，让比赛开口。"}</b>
              <span>
                {busy ? job?.message : "MP4 视频 + 封面 + 字幕 + 数据档案"}
              </span>
            </div>
            <button
              className="generate-button"
              onClick={generate}
              disabled={busy || loading}
            >
              {busy ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <WandSparkles size={18} />
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
            <h2>让它像你的作品</h2>
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
              <label className="field-label">画面节奏</label>
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
                  const d = defaultSettings(match);
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
                    <span>比赛 #{j.matchId}</span>
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
              雷达展示双方伤害最高选手的相对数值，每轴较高者为
              100%。它不代表综合能力，也没有假定两人的场上位置相同。
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
