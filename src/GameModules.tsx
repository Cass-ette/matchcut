import React, { createContext, useContext, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowDownToLine,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  Package,
  Trash2,
  X,
} from "lucide-react";
import {
  gameModules,
  type GameModulesResponse,
  type GameModuleState,
} from "./game-modules";
import "./modules.css";

const ModulesContext = createContext<GameModuleState[]>([]);
export const useGameModules = () => useContext(ModulesContext);
async function request(
  options?: RequestInit,
  game?: string,
): Promise<GameModulesResponse> {
  const response = await fetch(
    "/api/modules" + (game ? "/" + game : ""),
    options,
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "游戏资料读取失败。");
  return data;
}

export function GameModuleGate({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<GameModulesResponse>();
  const [error, setError] = useState("");
  const management = location.pathname.replace(/\/$/, "") === "/games";
  useEffect(() => {
    const controller = new AbortController();
    request({ signal: controller.signal })
      .then((value) => {
        if (!management) {
          const params = new URLSearchParams(location.search);
          const desired =
            params.get("game") ||
            localStorage.getItem("matchcut-game") ||
            "dota2";
          const enabled = value.modules.filter(
            (m) => m.installed && m.enabled && !m.operation,
          );
          const selected =
            enabled.find((m) => m.game === desired) || enabled[0];
          if (selected) {
            params.set("game", selected.game);
            history.replaceState(null, "", location.pathname + "?" + params);
            localStorage.setItem("matchcut-game", selected.game);
          }
        }
        setData(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  if (!data)
    return (
      <div className="boot">
        <div className="mark">M</div>
        <h2>Matchcut</h2>
        <p>{error || "正在读取游戏…"}</p>
        {error && <button onClick={() => location.reload()}>重新连接</button>}
      </div>
    );
  if (
    management ||
    !data.modules.some((m) => m.installed && m.enabled && !m.operation)
  )
    return <GameModules initial={data} />;
  return (
    <ModulesContext.Provider value={data.modules}>
      {children}
    </ModulesContext.Provider>
  );
}

export function GameModules({ initial }: { initial: GameModulesResponse }) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [remove, setRemove] = useState<GameModuleState>();
  const [keepData, setKeepData] = useState(true);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        setData(await request({ signal: controller.signal }));
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 1500);
    };
    timer = setTimeout(poll, 500);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  const processing = sending || data.modules.some((m) => m.operation);
  async function act(
    module: GameModuleState,
    action: "install" | "enable" | "hide" | "remove",
  ) {
    setSending(true);
    setError("");
    setNotice("");
    try {
      const result = await request(
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, keepData }),
        },
        module.game,
      );
      setData(result);
      setRemove(undefined);
      if (action === "hide") setNotice("已隐藏，素材和比赛资料会保留。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }
  const enabled = data.modules.find(
    (m) => m.installed && m.enabled && !m.operation,
  );
  return (
    <div className="app module-page">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="mark">
            M<span />
          </span>
          <b>
            matchcut<span className="word-dot">.</span>
          </b>
        </a>
        <nav className="top-links">
          <a href="/">视频工作台</a>
          <a href="/admin">素材管理</a>
          <span className="active">游戏管理</span>
        </nav>
        {enabled && (
          <a className="module-back" href={`/?game=${enabled.game}`}>
            <ArrowLeft size={16} />
            返回工作台
          </a>
        )}
      </header>
      <main className="module-main">
        <div className="module-heading">
          <span className="module-eyebrow">YOUR GAMES</span>
          <h1>
            只留下你需要的游戏<span>。</span>
          </h1>
          <p>
            素材按游戏下载。隐藏保留所有内容，移除时可以选择是否保留本地资料。
          </p>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="module-notice" role="status">
            <Check size={16} />
            {notice}
          </div>
        )}
        {data.busyReason && (
          <div className="module-notice">
            <LoaderCircle size={16} />
            {data.busyReason}
          </div>
        )}
        <div className="module-grid">
          {gameModules.map((definition) => {
            const module = data.modules.find(
              (m) => m.game === definition.game,
            )!;
            const disabled = processing || Boolean(data.busyReason);
            const status = module.operation
              ? module.operation.message
              : module.installed
                ? module.enabled
                  ? "已启用"
                  : "已隐藏"
                : "未安装";
            return (
              <article
                key={module.game}
                className="module-card"
                style={
                  { "--game-color": definition.color } as React.CSSProperties
                }
              >
                <div className="module-card-top">
                  <Package size={26} />
                  <span
                    className={`module-state ${module.enabled ? "enabled" : ""}`}
                  >
                    {status}
                  </span>
                </div>
                <span className="module-eyebrow">{definition.label}</span>
                <h2>{definition.name}</h2>
                <p>{definition.description}</p>
                <div className="module-meta">
                  {module.installed
                    ? module.version === "bundled"
                      ? "随应用内置"
                      : `素材版本 ${module.version}`
                    : module.retainedData
                      ? "本地资料已保留，重新安装后可继续使用"
                      : "重新安装可恢复内置素材"}
                </div>
                {module.operation && (
                  <div
                    className="module-progress"
                    role="progressbar"
                    aria-label={`${definition.name}处理进度`}
                    aria-valuenow={module.operation.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span style={{ width: module.operation.progress + "%" }} />
                    <small>{module.operation.progress}%</small>
                  </div>
                )}
                {module.error && (
                  <p className="module-error" role="alert">
                    {module.error}
                  </p>
                )}
                <div className="module-actions">
                  {!module.installed ? (
                    <button
                      className="module-primary"
                      disabled={disabled}
                      onClick={() => void act(module, "install")}
                    >
                      <ArrowDownToLine size={16} />
                      下载并启用
                    </button>
                  ) : (
                    <>
                      <button
                        className="module-primary"
                        disabled={disabled}
                        onClick={() =>
                          void act(module, module.enabled ? "hide" : "enable")
                        }
                      >
                        {module.enabled ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                        {module.enabled ? "隐藏" : "启用"}
                      </button>
                      <button
                        disabled={disabled}
                        onClick={() => void act(module, "install")}
                        title="重新下载当前资料库的素材"
                      >
                        <ArrowDownToLine size={15} />
                        更新素材
                      </button>
                      <button
                        className="module-remove"
                        disabled={disabled}
                        onClick={() => {
                          setKeepData(true);
                          setRemove(module);
                        }}
                      >
                        <Trash2 size={15} />
                        移除
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {!enabled && (
          <p className="module-empty">启用一个游戏，即可返回视频工作台。</p>
        )}
        <p className="module-footnote">
          各游戏共用视频工作台和音乐。已导出的视频始终保留。
        </p>
      </main>
      {remove && (
        <div
          className="module-modal-backdrop"
          onClick={() => !sending && setRemove(undefined)}
        >
          <section
            className="module-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="module-remove-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="module-close"
              aria-label="关闭"
              disabled={sending}
              onClick={() => setRemove(undefined)}
            >
              <X size={18} />
            </button>
            <Trash2 size={26} />
            <h2 id="module-remove-title">
              移除 {gameModules.find((d) => d.game === remove.game)!.name}
            </h2>
            <p>删除这个游戏的已下载素材，之后可以重新安装。</p>
            {error && (
              <p className="module-error" role="alert">
                {error}
              </p>
            )}
            <label className="module-keep">
              <input
                type="checkbox"
                checked={keepData}
                onChange={(e) => setKeepData(e.target.checked)}
              />
              保留比赛记录和自定义资料
            </label>
            <p className="module-removal-detail">
              {keepData
                ? "比赛缓存、导入文件、个人设置和自定义图片会保留。"
                : "同时删除这个游戏的比赛缓存、导入文件、个人设置和自定义绑定。"}
            </p>
            <div className="module-actions">
              <button disabled={sending} onClick={() => setRemove(undefined)}>
                取消
              </button>
              <button
                className="module-primary"
                disabled={sending}
                onClick={() => void act(remove, "remove")}
              >
                确认移除
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
