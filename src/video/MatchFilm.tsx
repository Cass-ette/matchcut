import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import "@fontsource/orbitron/latin-700.css";
import "@fontsource/orbitron/latin-900.css";
import {
  MatchData,
  PlayerData,
  sceneNames,
  isSupport,
  providerName,
  VideoProps,
  Comparison,
  comparisons,
  assignedPositions,
  axisValue,
  participation,
  compact,
  facts,
  getFocus,
  matchDuration,
  num,
  radar,
  sortedDamage,
  totalFrames,
  bgmVolume,
} from "../domain";

const font = '"Arial", "PingFang SC", "Microsoft YaHei", sans-serif';
const display = '"Orbitron", "Arial Black", "Arial", "PingFang SC", sans-serif';
const mono = '"SF Mono", "Menlo", monospace';
export const palettes = {
  obsidian: {
    bg: "#080706",
    panel: "#1b1710",
    ink: "#fff7e5",
    dim: "#b4a88e",
    line: "#453825",
  },
  ember: {
    bg: "#080a10",
    panel: "#11151e",
    ink: "#f3f5fa",
    dim: "#909bab",
    line: "#2b3443",
  },
  glacier: {
    bg: "#070d18",
    panel: "#101d30",
    ink: "#eef6ff",
    dim: "#8aacc5",
    line: "#273e59",
  },
  paper: {
    bg: "#100b18",
    panel: "#20132c",
    ink: "#f9f0ff",
    dim: "#ab97bf",
    line: "#453052",
  },
};
type Ctx = VideoProps & { index: number };
const enter = (frame: number, delay = 0, duration = 30) =>
  interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
const digits: React.CSSProperties = {
  fontFamily: display,
  fontWeight: 900,
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1,
};
const fit = (text: string, max: number, base: number) =>
  Math.min(
    base,
    max /
      Math.max(
        1,
        [...text].reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 1 : 0.62), 0),
      ),
  );
const asset = (path: string) => staticFile(path.replace(/^\//, ""));
const teamColor = (p: PlayerData, s: VideoProps["settings"]) =>
  p.side === "radiant" ? s.accent : s.secondary;
function Portrait({
  p,
  width = 96,
  height = 62,
}: {
  p: PlayerData;
  width?: number;
  height?: number;
}) {
  if (p.champions)
    return (
      <div style={{ width, height, display: "flex", overflow: "hidden" }}>
        {p.champions.slice(0, 3).map((c) => (
          <Img
            key={c.hero}
            src={asset(c.image)}
            style={{
              width: width / Math.min(3, p.champions!.length),
              height,
              objectFit: "cover",
            }}
          />
        ))}
      </div>
    );
  return (
    <Img src={asset(p.image)} style={{ width, height, objectFit: "cover" }} />
  );
}
function HeroArt({ p, style }: { p: PlayerData; style?: React.CSSProperties }) {
  return (
    <Img
      src={asset(p.artwork || p.image)}
      style={{
        width: 700,
        height: 660,
        objectFit: p.artwork ? "contain" : "cover",
        ...style,
      }}
    />
  );
}
function Tag({
  children,
  color,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <div
      style={{
        fontSize: 20,
        letterSpacing: 3,
        color,
        fontWeight: 700,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}
function Title({
  en,
  children,
  props,
}: {
  en: string;
  children: React.ReactNode;
  props: Ctx;
}) {
  return (
    <div style={{ position: "absolute", left: 84, top: 124 }}>
      <Tag color={props.settings.accent}>{en}</Tag>
      <div
        style={{
          fontSize: 54,
          fontWeight: 900,
          marginTop: 12,
          letterSpacing: -2,
        }}
      >
        {children}
      </div>
    </div>
  );
}
function Background({ settings: s }: VideoProps) {
  const frame = useCurrentFrame();
  const p = palettes[s.theme];
  const arena = s.effects === "arena";
  const sweep = ((frame * 11) % 2800) - 650;
  return (
    <AbsoluteFill style={{ background: p.bg, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 15% 50%, " +
            s.accent +
            (arena ? "30" : "15") +
            ", transparent 60%), radial-gradient(ellipse at 88% 35%, " +
            s.secondary +
            (arena ? "24" : "12") +
            ", transparent 58%)",
        }}
      />
      <svg
        width="1920"
        height="1080"
        style={{ position: "absolute", opacity: arena ? 1 : 0.5 }}
      >
        <defs>
          <radialGradient id="particle-a">
            <stop offset="0" stopColor="#fff8de" stopOpacity=".9" />
            <stop offset=".18" stopColor={s.accent} stopOpacity=".65" />
            <stop offset="1" stopColor={s.accent} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="particle-b">
            <stop offset="0" stopColor="#fff" stopOpacity=".8" />
            <stop offset=".18" stopColor={s.secondary} stopOpacity=".55" />
            <stop offset="1" stopColor={s.secondary} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="stage-beam">
            <stop stopColor={s.accent} stopOpacity="0" />
            <stop offset=".6" stopColor={s.accent} stopOpacity=".08" />
            <stop offset=".9" stopColor={s.accent} stopOpacity=".18" />
            <stop offset="1" stopColor={s.accent} stopOpacity="0" />
          </linearGradient>
          <pattern
            id="mesh"
            width="80"
            height="80"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 80 0 L 0 0 0 80"
              fill="none"
              stroke={p.line}
              strokeWidth=".6"
            />
          </pattern>
        </defs>
        <rect width="1920" height="1080" fill="url(#mesh)" opacity=".4" />
        <path
          d="M 1270 -80 L 690 1120 M 1320 -80 L 740 1120"
          stroke={p.line}
          strokeWidth="1"
          fill="none"
        />
        {arena && (
          <>
            <path
              d={
                "M " +
                sweep +
                " -100 L " +
                (sweep + 280) +
                " -100 L " +
                (sweep - 410) +
                " 1180 L " +
                (sweep - 690) +
                " 1180 Z"
              }
              fill="url(#stage-beam)"
            />
            <path
              d="M 0 900 L 300 1080 M 1620 0 L 1920 180"
              stroke={s.accent}
              strokeWidth="100"
              opacity=".035"
            />
            {Array.from({ length: 18 }, (_, i) => {
              const cycle = (frame * (2.4 + (i % 4)) + i * 137) % 2300;
              const x = ((i * 431 + cycle * 0.48) % 2050) - 60,
                y = 1130 - (cycle % 1250);
              const color = i % 4 === 0 ? s.secondary : s.accent;
              return (
                <g key={i} opacity={0.23 + (i % 4) * 0.08}>
                  <line
                    x1={x - 14}
                    y1={y + 38}
                    x2={x}
                    y2={y}
                    stroke={color}
                    strokeWidth={(i % 3) + 1}
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r="14"
                    fill={i % 4 === 0 ? "url(#particle-b)" : "url(#particle-a)"}
                  />
                </g>
              );
            })}
          </>
        )}
        {Array.from({ length: arena ? 145 : 42 }, (_, i) => {
          const speed = arena ? 4.5 : 1;
          const x =
            (i * 367 + 29 + frame * speed * (0.15 + (i % 3) * 0.07)) % 1920;
          const y =
            (((i * 173 + 30 - frame * speed * (0.12 + (i % 4) * 0.04)) % 1080) +
              1080) %
            1080;
          return (
            <g key={i}>
              {arena && i % 3 === 0 && (
                <circle
                  cx={x}
                  cy={y}
                  r={18 + (i % 11)}
                  fill={i % 4 === 0 ? "url(#particle-b)" : "url(#particle-a)"}
                  opacity={0.28 + 0.48 * Math.sin(i + frame / 26) ** 2}
                />
              )}
              <circle
                cx={x}
                cy={y}
                r={arena ? 1.3 + (i % 4) * 0.75 : i % 4 === 0 ? 2.5 : 1}
                fill={i % 4 === 0 ? s.secondary : s.accent}
                opacity={
                  arena
                    ? 0.3 + 0.55 * Math.sin(i + frame / 30) ** 2
                    : 0.18 + 0.22 * Math.sin(i + frame / 55) ** 2
                }
              />
            </g>
          );
        })}
      </svg>
      {arena && (
        <svg width="1920" height="1080" style={{ position: "absolute" }}>
          <path
            d="M 34 135 L 34 34 L 155 34 M 1765 34 L 1886 34 L 1886 135 M 34 945 L 34 1046 L 64 1046 M 1856 1046 L 1886 1046 L 1886 945"
            stroke={s.accent}
            strokeWidth="2"
            opacity=".55"
            fill="none"
          />
          <path
            d="M 45 125 L 45 45 L 100 45 M 1820 45 L 1875 45 L 1875 125"
            stroke={s.secondary}
            opacity=".25"
            fill="none"
          />
        </svg>
      )}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 5,
          background:
            "linear-gradient(90deg," +
            s.accent +
            " 0%," +
            s.accent +
            " 48%, " +
            s.secondary +
            " 52%)",
        }}
      />
    </AbsoluteFill>
  );
}
function SeriesGames({ props }: { props: Ctx }) {
  const { match: m, settings: s } = props;
  const frame = useCurrentFrame();
  const p = palettes[s.theme];
  if (!m.series) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 100,
        right: 100,
        top: 610,
        height: 170,
        display: "grid",
        gridTemplateColumns: `repeat(${Math.min(5, m.series.games.length)}, 1fr)`,
        gap: 14,
      }}
    >
      {m.series.games.map((game, i) => {
        const winner = game[game.winner];
        const color = winner === m.radiant ? s.accent : s.secondary;
        return (
          <div
            key={game.id}
            style={{
              background: color + "10",
              borderTop: "3px solid " + color,
              padding: m.series!.games.length > 5 ? "5px 18px" : "18px 22px",
              opacity: enter(frame, 8 + i * 3),
              overflow: "hidden",
            }}
          >
            <div style={{ fontFamily: mono, color: p.dim, fontSize: 18 }}>
              G{game.gameNumber || "?"}{" "}
              <span style={{ float: "right" }}>
                {matchDuration(game.duration)}
              </span>
            </div>
            <div
              style={{
                fontSize: fit(winner, 250, 30),
                color,
                fontWeight: 900,
                marginTop: 8,
              }}
            >
              {winner} <small style={{ fontSize: 17 }}>WIN</small>
            </div>
            {m.series!.games.length <= 5 && (
              <div style={{ color: p.dim, fontSize: 17, marginTop: 12 }}>
                {game.radiant} {game.radiantScore} : {game.direScore}{" "}
                {game.dire}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Intro(props: Ctx) {
  const { match: m, settings: s } = props;
  const f = useCurrentFrame();
  const p = palettes[s.theme];
  const focus = getFocus(m);
  const op = enter(f, 0, 32);
  return (
    <AbsoluteFill>
      {focus.map((player, i) => (
        <div
          key={player.slot}
          style={{
            position: "absolute",
            left: i ? 1170 : -20,
            top: 116,
            opacity: 0.36 * op,
            transform: "translateX(" + (1 - op) * (i ? 90 : -90) + "px)",
          }}
        >
          <HeroArt
            p={player}
            style={{
              width: 780,
              height: 690,
              maskImage:
                "linear-gradient(to bottom, #000 45%, transparent 100%)",
            }}
          />
        </div>
      ))}
      <div
        style={{
          position: "absolute",
          top: 132,
          left: 300,
          right: 300,
          textAlign: "center",
        }}
      >
        <Tag color={p.dim}>
          {m.game === "lol" ? "LEAGUE OF LEGENDS" : "DOTA 2"} · POST MATCH
          {m.series
            ? " · SERIES RECAP"
            : m.game === "lol" && m.gameNumber
              ? " · GAME " + m.gameNumber
              : ""}
        </Tag>
        <div
          style={{
            fontSize: fit(s.headline, 1190, 67),
            fontWeight: 900,
            lineHeight: 1.3,
            marginTop: 14,
          }}
        >
          {s.headline}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 155,
          right: 155,
          top: 322,
          display: "grid",
          gridTemplateColumns: "1fr 570px 1fr",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        {[0, 1, 2].map((i) =>
          i === 1 ? (
            <div key={i}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 25,
                }}
              >
                <span style={{ ...digits, fontSize: 150, color: s.accent }}>
                  {Math.round((m.series?.wins.radiant ?? m.radiantScore) * op)}
                </span>
                <span
                  style={{
                    fontFamily: mono,
                    fontSize: 66,
                    color: p.dim,
                    paddingBottom: 15,
                  }}
                >
                  :
                </span>
                <span style={{ ...digits, fontSize: 150, color: s.secondary }}>
                  {Math.round((m.series?.wins.dire ?? m.direScore) * op)}
                </span>
              </div>
              <div
                style={{
                  color: p.dim,
                  fontSize: 20,
                  marginTop: 25,
                  letterSpacing: 3,
                }}
              >
                {m.series
                  ? `已收录 ${m.series.games.length} 局比分`
                  : "英雄击杀"}{" "}
                · {matchDuration(m.duration)}
              </div>
            </div>
          ) : (
            (() => {
              const side = i === 0 ? "radiant" : "dire";
              const color = i === 0 ? s.accent : s.secondary;
              const winner = m.winner === side;
              return (
                <div key={i} style={{ zIndex: 1 }}>
                  <Tag color={color}>
                    {m.series
                      ? "SERIES / 战队"
                      : m.game === "lol"
                        ? side === "radiant"
                          ? "BLUE / 蓝方"
                          : "RED / 红方"
                        : side === "radiant"
                          ? "RADIANT / 天辉"
                          : "DIRE / 夜魇"}
                  </Tag>
                  <div
                    style={{
                      fontSize: fit(m[side], 450, 56),
                      fontWeight: 900,
                      margin: "19px 0 23px",
                      lineHeight: 1.2,
                    }}
                  >
                    {m[side]}
                  </div>
                  <span
                    style={{
                      display: "inline-block",
                      background: winner ? color : "#ffffff0a",
                      color: winner ? p.bg : p.dim,
                      padding: "9px 22px",
                      fontWeight: 900,
                      fontSize: 21,
                      letterSpacing: 4,
                      transform: "skewX(-8deg)",
                    }}
                  >
                    {m.series
                      ? m.winner === null
                        ? "TIED"
                        : winner
                          ? "LEADING"
                          : "TRAILING"
                      : winner
                        ? "VICTORY"
                        : "DEFEAT"}
                  </span>
                </div>
              );
            })()
          ),
        )}
      </div>
      {m.series ? (
        <SeriesGames props={props} />
      ) : (
        <div
          style={{
            position: "absolute",
            top: 614,
            left: 105,
            right: 105,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 170,
          }}
        >
          {(["radiant", "dire"] as const).map((side) => (
            <div key={side} style={{ display: "flex", gap: 10 }}>
              {m.players
                .filter((x) => x.side === side)
                .map((player, i) => (
                  <div
                    key={player.slot}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      opacity: enter(f, 8 + i * 3),
                      transform:
                        "translateY(" + (1 - enter(f, 8 + i * 3)) * 20 + "px)",
                    }}
                  >
                    <Img
                      src={asset(player.image)}
                      style={{
                        width: "100%",
                        height: 80,
                        objectFit: "cover",
                        borderBottom: "3px solid " + teamColor(player, s),
                      }}
                    />
                    <div
                      style={{
                        fontSize: 18,
                        textAlign: "center",
                        marginTop: 9,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {player.name}
                    </div>
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          top: 807,
          left: 84,
          right: 84,
          borderTop: "1px solid " + p.line,
          paddingTop: 23,
          display: "flex",
          justifyContent: "space-between",
          color: p.dim,
          fontSize: 21,
        }}
      >
        <span>{m.league}</span>
        <span style={{ fontFamily: mono }}>
          {m.date.slice(0, 10)} ·{" "}
          {m.series
            ? m.series.missingGames.length
              ? "缺少 G" +
                m.series.missingGames.join(" / G") +
                " · 仅统计已收录局"
              : "系列赛累计 · 仅统计已收录局"
            : "单局赛果"}
        </span>
      </div>
    </AbsoluteFill>
  );
}
function Economy(props: Ctx) {
  const { match: m, settings: s } = props;
  const p = palettes[s.theme],
    f = facts(m),
    frame = useCurrentFrame();
  const progress = enter(
    frame,
    12,
    Math.min(160, props.segments[1].frames - 60),
  );
  const left = 82,
    top = 68,
    width = 1120,
    height = 460;
  const max = Math.max(1000, ...m.gold.map((g) => Math.abs(g.value))) * 1.13;
  const minTime = m.gold[0].minute,
    maxTime = m.gold.at(-1)!.minute;
  const xy = (g: { minute: number; value: number }) => [
    left + ((g.minute - minTime) / (maxTime - minTime)) * width,
    top + height / 2 - ((g.value / max) * height) / 2,
  ];
  const points = m.gold.map((g) => xy(g).join(",")).join(" ");
  const zero = top + height / 2;
  const area =
    left + "," + zero + " " + points + " " + (left + width) + "," + zero;
  const [endX, endY] = xy(f.final);
  return (
    <AbsoluteFill>
      <Title en="02 / GOLD ADVANTAGE" props={props}>
        经济走势
      </Title>
      <div
        style={{
          position: "absolute",
          right: 94,
          top: 161,
          display: "flex",
          gap: 34,
          fontSize: 22,
        }}
      >
        <span style={{ color: s.accent }}>● {m.radiant}</span>
        <span style={{ color: s.secondary }}>● {m.dire}</span>
      </div>
      <svg
        width="1290"
        height="650"
        style={{
          position: "absolute",
          top: 268,
          left: 38,
          overflow: "visible",
        }}
      >
        <defs>
          <clipPath id="reveal-gold">
            <rect x={left} y="0" width={width * progress + 1} height="620" />
          </clipPath>
          <clipPath id="gold-positive">
            <rect width="1300" height={zero} />
          </clipPath>
          <clipPath id="gold-negative">
            <rect y={zero} width="1300" height="320" />
          </clipPath>
          <linearGradient id="gold-fill" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor={s.accent} stopOpacity=".18" />
            <stop offset=".5" stopColor={s.accent} stopOpacity=".015" />
            <stop offset="1" stopColor={s.secondary} stopOpacity=".18" />
          </linearGradient>
        </defs>
        {[-1, -0.5, 0, 0.5, 1].map((v) => {
          const y = zero - (v * height) / 2;
          return (
            <g key={v}>
              <line
                x1={left}
                x2={left + width}
                y1={y}
                y2={y}
                stroke={v === 0 ? p.dim : p.line}
                strokeDasharray={v === 0 ? undefined : "4 8"}
              />
              <text
                x={left - 16}
                y={y + 6}
                fill={p.dim}
                fontSize="19"
                textAnchor="end"
                fontFamily={mono}
              >
                {compact(v * max)}
              </text>
            </g>
          );
        })}
        {Array.from({ length: Math.floor(maxTime / 10) + 1 }, (_, i) => i * 10)
          .filter((t) => t >= minTime)
          .map((t) => (
            <text
              key={t}
              x={xy({ minute: t, value: 0 })[0]}
              y={top + height + 42}
              textAnchor="middle"
              fill={p.dim}
              fontSize="20"
              fontFamily={mono}
            >
              {t}:00
            </text>
          ))}
        <g clipPath="url(#reveal-gold)">
          <polygon points={area} fill="url(#gold-fill)" />
          {[
            ["gold-positive", s.accent],
            ["gold-negative", s.secondary],
          ].map(([clip, color]) => (
            <g key={clip} clipPath={"url(#" + clip + ")"}>
              <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="12"
                opacity=".13"
                strokeLinejoin="round"
              />
              <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="3.5"
                strokeLinejoin="round"
              />
            </g>
          ))}
          {[f.max, f.min].map((g, i) => {
            const [x, y] = xy(g),
              color = g.value >= 0 ? s.accent : s.secondary;
            return (
              <g key={i}>
                <circle cx={x} cy={y} r="6" fill={color} />
                <text
                  x={Math.min(left + width - 75, Math.max(left + 75, x))}
                  y={y + (g.value >= 0 ? -20 : 32)}
                  textAnchor="middle"
                  fill={color}
                  fontWeight="700"
                  fontSize="25"
                >
                  {(g.value >= 0 ? "+" : "") + num(g.value)}
                </text>
              </g>
            );
          })}
        </g>
        {progress > 0.99 && (
          <circle
            cx={endX}
            cy={endY}
            r="6"
            fill={f.final.value >= 0 ? s.accent : s.secondary}
          />
        )}
        <text x={left} y="637" fill={p.dim} fontSize="20">
          经济差 = 天辉 − 夜魇 · 采样数据
        </text>
      </svg>
      <div
        style={{
          position: "absolute",
          left: 1390,
          top: 316,
          right: 84,
          borderLeft: "1px solid " + p.line,
          paddingLeft: 46,
        }}
      >
        <Tag color={p.dim}>最大领先 / 天辉</Tag>
        <div
          style={{
            ...digits,
            fontSize: 67,
            margin: "18px 0 44px",
            color: s.accent,
          }}
        >
          {compact(Math.max(0, f.max.value))}
        </div>
        <Tag color={p.dim}>最大领先 / 夜魇</Tag>
        <div
          style={{
            ...digits,
            fontSize: 67,
            margin: "18px 0 44px",
            color: s.secondary,
          }}
        >
          {compact(Math.max(0, -f.min.value))}
        </div>
        <Tag color={p.dim}>末次采样 · {f.final.minute.toFixed(0)} MIN</Tag>
        <div
          style={{
            ...digits,
            fontSize: 48,
            color: f.final.value >= 0 ? s.accent : s.secondary,
            marginTop: 20,
          }}
        >
          {f.final.value >= 0 ? "+" : ""}
          {num(f.final.value)}
        </div>
      </div>
    </AbsoluteFill>
  );
}
function RadarChart({
  props,
  mode,
  local,
  comparison,
}: {
  props: Ctx;
  mode: number;
  local: number;
  comparison: Comparison & { pair: [PlayerData, PlayerData] };
}) {
  const { match: m, settings: s } = props;
  const p = palettes[s.theme],
    axes = radar(m, comparison.pair, comparison.position);
  const cx = 485,
    cy = 363,
    r = 258;
  const point = (i: number, radius: number) => {
    const a = ((i * 60 - 90) * Math.PI) / 180;
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
  };
  const polygon = (values: number[]) =>
    values.map((v, i) => point(i, r * v).join(",")).join(" ");
  const morph = enter(local, 0, 42);
  const a = axes.map((x) => x.ar),
    b = axes.map((x) => x.br);
  const active =
    mode === 0
      ? a.map((v) => (v === undefined ? undefined : v * morph))
      : mode === 1
        ? b.map((v, i) =>
            v === undefined || a[i] === undefined
              ? undefined
              : a[i]! + (v - a[i]!) * morph,
          )
        : b;
  const color = mode === 0 ? s.accent : s.secondary;
  const shape = (
    values: (number | undefined)[],
    c: string,
    alpha = 1,
    key = "",
  ) => (
    <g key={key} opacity={alpha}>
      {values.every((v) => v !== undefined) ? (
        <>
          <polygon
            points={polygon(values as number[])}
            fill={c + "13"}
            stroke={c}
            strokeWidth={s.effects === "arena" ? "27" : "15"}
            strokeLinejoin="round"
            opacity={s.effects === "arena" ? ".24" : ".14"}
          />
          <polygon
            points={polygon(values as number[])}
            fill={c + "0d"}
            stroke={c}
            strokeWidth={s.effects === "arena" ? "9" : "5"}
            strokeLinejoin="round"
            opacity=".6"
          />
          <polygon
            points={polygon(values as number[])}
            fill="none"
            stroke={c}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </>
      ) : (
        values.map((v, i) => {
          const next = values[(i + 1) % values.length];
          if (v === undefined || next === undefined) return null;
          return (
            <line
              key={i}
              x1={point(i, r * v)[0]}
              y1={point(i, r * v)[1]}
              x2={point((i + 1) % values.length, r * next)[0]}
              y2={point((i + 1) % values.length, r * next)[1]}
              stroke={c}
              strokeWidth="3"
            />
          );
        })
      )}
      {values.map((v, i) =>
        v === undefined ? null : (
          <circle
            key={i}
            cx={point(i, r * v)[0]}
            cy={point(i, r * v)[1]}
            r="4"
            fill="#fff"
          />
        ),
      )}
    </g>
  );
  return (
    <svg width="970" height="760" style={{ overflow: "visible" }}>
      {s.effects === "arena" && (
        <g>
          <circle
            cx={cx}
            cy={cy}
            r="319"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeDasharray="135 340 30 480"
            opacity=".72"
            transform={"rotate(" + local * 0.65 + " " + cx + " " + cy + ")"}
          />
          <circle
            cx={cx}
            cy={cy}
            r="303"
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeDasharray="3 14"
            opacity=".55"
            transform={"rotate(" + -local * 0.32 + " " + cx + " " + cy + ")"}
          />
          <circle
            cx={cx}
            cy={cy}
            r={70 + ((local * 2) % 220)}
            fill="none"
            stroke={color}
            strokeWidth="2"
            opacity={0.23 * (1 - ((local * 2) % 220) / 220)}
          />
        </g>
      )}
      <circle
        cx={cx}
        cy={cy}
        r="318"
        fill="none"
        stroke={p.line}
        strokeWidth="1"
        strokeDasharray="2 16"
      />
      <circle
        cx={cx}
        cy={cy}
        r="310"
        fill="none"
        stroke={p.line}
        opacity=".5"
      />
      {[0.2, 0.4, 0.6, 0.8, 1].map((level) => (
        <polygon
          key={level}
          points={polygon(Array(6).fill(level))}
          fill="none"
          stroke={level === 1 ? p.dim : p.line}
          strokeWidth={level === 1 ? 1.5 : 1}
          opacity={level === 1 ? 0.6 : 1}
        />
      ))}
      {axes.map((_, i) => (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={point(i, r)[0]}
          y2={point(i, r)[1]}
          stroke={p.line}
        />
      ))}
      {mode === 2 ? (
        <>
          {shape(b, s.secondary, 1, "b")}
          {shape(a, s.accent, morph, "a")}
        </>
      ) : (
        shape(active, color)
      )}
      {axes.map((axis, i) => {
        const [x, y] = point(i, r + 83);
        const label = axis.label;
        return (
          <g key={axis.label} textAnchor="middle">
            <text x={x} y={y - 8} fill={p.dim} fontSize="21" fontWeight="700">
              {label}
            </text>
            <text
              x={x}
              y={y + 27}
              fontSize={mode === 2 ? 26 : 31}
              fontFamily={display}
              fontWeight="700"
              fill={color}
            >
              {mode === 2 ? (
                <>
                  <tspan fill={s.accent}>{axisValue(axis.a, axis.unit)}</tspan>
                  <tspan fill={p.dim}> / </tspan>
                  <tspan fill={s.secondary}>
                    {axisValue(axis.b, axis.unit)}
                  </tspan>
                </>
              ) : (
                axisValue(mode === 0 ? axis.a : axis.b, axis.unit)
              )}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
function TeamResources(props: Ctx) {
  const { match: m, settings: s } = props,
    p = palettes[s.theme];
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Title en="02 / TEAM OBJECTIVES" props={props}>
        {m.series ? "系列赛累计，资源总览" : "终局资源，一览战局"}
      </Title>
      <div style={{ position: "absolute", left: 100, right: 100, top: 290 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 36,
            fontWeight: 900,
            marginBottom: 38,
          }}
        >
          <span style={{ color: s.accent }}>
            {m.radiant}{" "}
            <small style={{ fontSize: 20 }}>{m.series ? "TEAM" : "BLUE"}</small>
          </span>
          <span style={{ fontSize: 20, color: p.dim, alignSelf: "center" }}>
            {m.series
              ? `已收录 ${m.series.games.length} 局 · 各局终局值相加`
              : `终局累计 · 第 ${m.gameNumber || "—"} 局`}
          </span>
          <span style={{ color: s.secondary }}>
            {m.dire}{" "}
            <small style={{ fontSize: 20 }}>{m.series ? "TEAM" : "RED"}</small>
          </span>
        </div>
        {m.objectives?.map((item, i) => {
          const max = Math.max(item.radiant ?? 0, item.dire ?? 0, 1),
            progress = enter(frame, i * 8, 45);
          return (
            <div
              key={item.label}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 220px 1fr",
                alignItems: "center",
                gap: 30,
                height: 111,
                borderTop: "1px solid " + p.line,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
                <strong
                  style={{
                    ...digits,
                    color: s.accent,
                    fontSize: 44,
                    minWidth: 170,
                  }}
                >
                  {axisValue(item.radiant)}
                </strong>
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <div
                    style={{
                      width: ((item.radiant ?? 0) / max) * progress * 100 + "%",
                      height: 18,
                      background: s.accent,
                      boxShadow: "0 0 25px " + s.accent + "66",
                    }}
                  />
                </div>
              </div>
              <div
                style={{
                  textAlign: "center",
                  color: p.ink,
                  fontWeight: 700,
                  fontSize: 26,
                }}
              >
                {item.label}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      width: ((item.dire ?? 0) / max) * progress * 100 + "%",
                      height: 18,
                      background: s.secondary,
                      boxShadow: "0 0 25px " + s.secondary + "66",
                    }}
                  />
                </div>
                <strong
                  style={{
                    ...digits,
                    color: s.secondary,
                    fontSize: 44,
                    minWidth: 170,
                    textAlign: "right",
                  }}
                >
                  {axisValue(item.dire)}
                </strong>
              </div>
            </div>
          );
        })}
        <div style={{ color: p.dim, fontSize: 22, marginTop: 30 }}>
          总经济含被动收入 · 资源数量按数据源累计口径 · 缺失显示 —
        </div>
      </div>
    </AbsoluteFill>
  );
}
function RadarScene(props: Ctx) {
  const { match: m, settings: s } = props;
  const p = palettes[s.theme],
    frame = useCurrentFrame();
  const groups = comparisons(m, s),
    groupFrames = props.segments[2].frames / groups.length;
  const groupIndex = Math.min(
    groups.length - 1,
    Math.floor(frame / groupFrames),
  );
  const comparison = groups[groupIndex];
  const third = groupFrames / 3,
    groupFrame = frame - groupIndex * groupFrames;
  const mode = Math.min(2, Math.floor(groupFrame / third)),
    local = groupFrame - mode * third;
  if (!comparison.pair)
    return (
      <AbsoluteFill
        style={{ justifyContent: "center", alignItems: "center", gap: 25 }}
      >
        <Tag color={s.accent}>{comparison.label}</Tag>
        <div style={{ fontSize: 62, fontWeight: 800 }}>对位待修正</div>
        <div style={{ fontSize: 27, color: p.dim }}>
          位置数据缺失或冲突，请在工作台核对双方位置。
        </div>
      </AbsoluteFill>
    );
  const focus = comparison.pair;
  const support = isSupport(m, comparison.position);
  const player = focus[mode === 0 ? 0 : 1],
    color = teamColor(player, s);
  const teamTotal = m.players
    .filter((x) => x.side === player.side)
    .reduce((sum, x) => sum + x.damage, 0);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 84,
          top: 123,
          display: "flex",
          gap: 25,
          alignItems: "center",
        }}
      >
        <Tag color={mode === 0 ? s.accent : mode === 1 ? s.secondary : p.ink}>
          03 /{" "}
          {comparison.position
            ? m.game === "lol"
              ? ["TOP", "JUNGLE", "MID", "BOT", "SUPPORT"][
                  comparison.position - 1
                ]
              : "POSITION " + String(comparison.position).padStart(2, "0")
            : "DAMAGE DUEL"}
        </Tag>
        <span style={{ fontSize: 24, color: p.ink }}>
          {comparison.label}
          {m.series ? " · 系列赛累计" : ""}
        </span>
      </div>
      <div style={{ position: "absolute", top: 200, left: 72 }}>
        <RadarChart
          props={props}
          mode={mode}
          local={local}
          comparison={{ ...comparison, pair: focus }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 1105,
          right: 86,
          top: 126,
          display: "flex",
          gap: 12,
        }}
      >
        {[focus[0].name, focus[1].name, "双人对比"].map((name, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              padding: "12px 0",
              borderTop:
                "3px solid " +
                (i === mode
                  ? i === 0
                    ? s.accent
                    : i === 1
                      ? s.secondary
                      : p.ink
                  : p.line),
              color: mode === i ? p.ink : p.dim,
              fontSize: 20,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {name}
          </div>
        ))}
      </div>
      {mode < 2 ? (
        <div key={mode} style={{ opacity: enter(local, 0, 15) }}>
          <HeroArt
            p={player}
            style={{
              position: "absolute",
              left: 1080,
              top: 206,
              width: 750,
              height: 615,
              opacity: 0.94,
              filter:
                s.effects === "arena"
                  ? "drop-shadow(0 0 25px " + color + "80)"
                  : undefined,
              transform: "translateX(" + (1 - enter(local, 0, 36)) * 65 + "px)",
              maskImage: "linear-gradient(to bottom,#000 64%,transparent 100%)",
            }}
          />
          <div
            style={{ position: "absolute", left: 1105, right: 85, top: 217 }}
          >
            <Tag color={color}>
              {m[player.side]} / {player.hero}
            </Tag>
            <div
              style={{
                ...digits,
                fontSize: fit(player.name, 650, 105),
                marginTop: 14,
                textShadow:
                  s.effects === "arena"
                    ? "0 0 18px " + color + "aa, 0 0 60px " + color + "70"
                    : "0 0 35px " + color + "70",
              }}
            >
              {player.name}
            </div>
          </div>
          {player.champions && (
            <div
              style={{
                position: "absolute",
                left: 1105,
                right: 85,
                top: 420,
                display: "flex",
                gap: 12,
              }}
            >
              {player.champions.map((c) => (
                <div
                  key={c.hero}
                  style={{
                    background: p.bg + "dd",
                    padding: 8,
                    textAlign: "center",
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <Img
                    src={asset(c.image)}
                    style={{ width: 62, height: 62, objectFit: "cover" }}
                  />
                  <div style={{ fontSize: 14, marginTop: 4 }}>
                    {c.hero} ×{c.games}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div
            style={{
              position: "absolute",
              top: 715,
              left: 1105,
              right: 85,
              background:
                "linear-gradient(90deg," + p.bg + "f0," + p.bg + "66)",
              padding: "20px 0",
              borderTop: "2px solid " + color,
            }}
          >
            <div style={{ display: "flex", gap: 40, alignItems: "center" }}>
              <div>
                <Tag color={p.dim}>K / D / A</Tag>
                <div style={{ ...digits, fontSize: 46, marginTop: 15 }}>
                  {player.kills}
                  <span style={{ color: p.dim }}> / {player.deaths} / </span>
                  {player.assists}
                </div>
              </div>
              <div
                style={{ borderLeft: "1px solid " + p.line, paddingLeft: 35 }}
              >
                <Tag color={p.dim}>
                  {support ? "参战率 / KP" : "队内伤害占比"}
                </Tag>
                <div style={{ ...digits, color, fontSize: 46, marginTop: 15 }}>
                  {support
                    ? axisValue(participation(m, player), "%")
                    : teamTotal
                      ? ((100 * player.damage) / teamTotal).toFixed(1)
                      : "0.0"}
                  {!support && <span style={{ fontSize: 25 }}>%</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            position: "absolute",
            left: 1105,
            right: 85,
            top: 236,
            opacity: enter(local, 0, 18),
          }}
        >
          <Tag color={p.dim}>{comparison.label} / HEAD TO HEAD</Tag>
          {focus.map((pl) => (
            <div
              key={pl.slot}
              style={{
                marginTop: 30,
                borderLeft: "4px solid " + teamColor(pl, s),
                padding: "6px 0 12px 24px",
                background:
                  "linear-gradient(90deg," +
                  teamColor(pl, s) +
                  "0e,transparent)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
                <Portrait p={pl} width={124} height={78} />
                <div>
                  <div
                    style={{
                      fontFamily: display,
                      fontSize: fit(pl.name, 480, 43),
                      fontWeight: 900,
                      color: teamColor(pl, s),
                    }}
                  >
                    {pl.name}
                  </div>
                  <div style={{ fontSize: 19, color: p.dim, marginTop: 7 }}>
                    {m[pl.side]} · {pl.hero}
                  </div>
                </div>
              </div>
              <div style={{ fontFamily: mono, fontSize: 26, marginTop: 17 }}>
                {pl.kills} / {pl.deaths} / {pl.assists}{" "}
                <span style={{ fontSize: 18, color: p.dim }}>KDA</span>
                <span style={{ marginLeft: 40 }}>
                  {support
                    ? axisValue(m.game === "lol" ? pl.vision : pl.healing)
                    : num(pl.damage)}{" "}
                  <span style={{ fontSize: 18, color: p.dim }}>
                    {support
                      ? m.game === "lol"
                        ? "视野得分"
                        : "治疗"
                      : "伤害"}
                  </span>
                </span>
              </div>
            </div>
          ))}
          <div
            style={{
              borderTop: "1px solid " + p.line,
              marginTop: 34,
              paddingTop: 24,
              color: p.dim,
              fontSize: 21,
              lineHeight: 1.8,
            }}
          >
            每轴以二人较高值为外圈。
            <br />
            {m.series
              ? "系列赛累计；轮换选手计入同位置。"
              : support
                ? m.game === "lol"
                  ? "视野和眼位均为本局记录。"
                  : "眼位为放置数，眩晕为累计秒数。"
                : "比较本场数据，不作综合能力评级。"}
          </div>
        </div>
      )}
      <div
        style={{
          position: "absolute",
          top: 878,
          left: 1105,
          right: 85,
          color: p.dim,
          fontSize: 18,
          lineHeight: 1.6,
        }}
      >
        {comparison.provenance} · 六轴相对值
        <br />
        {support
          ? "KP =（击杀 + 助攻）/ 队伍击杀 · — 为缺失"
          : m.series
            ? "DPM = 累计英雄伤害 / 出场总分钟数"
            : "DPM = 英雄伤害 / 本场分钟数 · 非能力评分"}
      </div>
    </AbsoluteFill>
  );
}
function Damage(props: Ctx) {
  const { match: m, settings: s } = props;
  const p = palettes[s.theme],
    frame = useCurrentFrame(),
    players = sortedDamage(m).slice(0, 5),
    leader = players[0],
    color = teamColor(leader, s);
  return (
    <AbsoluteFill>
      <Title en="04 / DAMAGE LEADERS" props={props}>
        {m.series ? "系列赛，谁贡献了最多输出" : "谁打出了最多伤害"}
      </Title>
      <HeroArt
        p={leader}
        style={{
          position: "absolute",
          left: 30,
          top: 249,
          width: 740,
          height: 650,
          opacity: 0.64,
          maskImage: "linear-gradient(to bottom,#000 40%,transparent 98%)",
        }}
      />
      <div style={{ position: "absolute", top: 559, left: 85, width: 610 }}>
        <Tag color={color}>
          {m.series ? "系列赛累计英雄伤害第一" : "全场英雄伤害第一"}
        </Tag>
        <div
          style={{
            ...digits,
            fontSize: fit(leader.name, 600, 75),
            margin: "16px 0 24px",
          }}
        >
          {leader.name}
        </div>
        <div style={{ ...digits, fontSize: 92, color }}>
          {num(leader.damage)}
        </div>
        <div style={{ fontSize: 23, color: p.dim, marginTop: 20 }}>
          {m[leader.side]} · {leader.hero}
        </div>
      </div>
      <div style={{ position: "absolute", left: 820, right: 84, top: 270 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            color: p.dim,
            fontSize: 19,
            marginBottom: 17,
            letterSpacing: 2,
          }}
        >
          <span>TOP 05 / {m.series ? "选手累计英雄伤害" : "英雄伤害"}</span>
          <span>HERO DAMAGE</span>
        </div>
        {players.map((pl, i) => {
          const progress = enter(frame, 10 + i * 8, 46),
            c = teamColor(pl, s);
          return (
            <div
              key={pl.slot}
              style={{
                display: "grid",
                gridTemplateColumns: "45px 114px 1fr",
                gap: 18,
                alignItems: "center",
                height: 113,
                borderTop: "1px solid " + p.line,
                opacity: enter(frame, 4 + i * 5),
              }}
            >
              <span
                style={{ ...digits, fontSize: 31, color: i === 0 ? c : p.dim }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <Portrait p={pl} width={114} height={68} />
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 12,
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: 26,
                      fontWeight: 700,
                      maxWidth: 400,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {pl.name}
                  </span>
                  <span style={{ ...digits, fontSize: 30, color: c }}>
                    {num(pl.damage * progress)}
                  </span>
                </div>
                <div style={{ height: 8, background: p.line }}>
                  <div
                    style={{
                      height: "100%",
                      width:
                        (leader.damage
                          ? (pl.damage / leader.damage) * progress * 100
                          : 0) + "%",
                      background: c,
                      boxShadow: "0 0 18px " + c + "44",
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
        <div style={{ marginTop: 25, color: p.dim, fontSize: 20 }}>
          {m.series
            ? "按选手分别累计 · 出场局数不同会影响总量"
            : "不含建筑伤害 · 输出量不等于全部贡献"}
        </div>
      </div>
    </AbsoluteFill>
  );
}
function Outro(props: Ctx) {
  const { match: m, settings: s } = props;
  const p = palettes[s.theme],
    f = facts(m),
    focus = getFocus(m),
    winnerPlayer = m.winner ? focus[m.winner === "radiant" ? 0 : 1] : f.top,
    color = teamColor(winnerPlayer, s);
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 79,
          top: 131,
          fontFamily: display,
          fontSize: 175,
          fontWeight: 900,
          color: color + "0b",
          letterSpacing: -9,
        }}
      >
        {m.series ? "SERIES" : "VICTORY"}
      </div>
      <HeroArt
        p={winnerPlayer}
        style={{
          position: "absolute",
          left: 1060,
          top: 106,
          width: 825,
          height: 780,
          opacity: enter(frame, 0, 30),
          maskImage: "linear-gradient(to bottom,#000 68%,transparent 100%)",
        }}
      />
      <div style={{ position: "absolute", left: 85, top: 282, width: 1030 }}>
        <Tag color={color}>
          {m.series
            ? `SERIES / 已收录 ${m.series.games.length} 局`
            : "FINAL / 本局胜者"}
        </Tag>
        <div
          style={{
            fontSize: fit(
              m.series ? m.radiant + " vs " + m.dire : f.winner,
              1000,
              101,
            ),
            fontWeight: 900,
            lineHeight: 1.16,
            marginTop: 21,
          }}
        >
          {m.series ? m.radiant + " vs " + m.dire : f.winner}
        </div>
        <div
          style={{ width: 83, height: 5, background: color, margin: "34px 0" }}
        />
        <div style={{ display: "flex", gap: 55, marginTop: 37 }}>
          {[
            [
              m.series ? "系列赛比分" : "比赛用时",
              m.series
                ? m.series.wins.radiant + " : " + m.series.wins.dire
                : matchDuration(m.duration),
            ],
            [
              m.series ? "累计英雄击杀" : "英雄击杀",
              m.radiantScore + " : " + m.direScore,
            ],
            [m.series ? "最高累计伤害" : "全场最高伤害", compact(f.top.damage)],
          ].map(([label, value]) => (
            <div key={label}>
              <Tag color={p.dim}>{label}</Tag>
              <div style={{ ...digits, fontSize: 49, marginTop: 18 }}>
                {value}
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            fontSize: fit(s.outro, 1020, 31),
            lineHeight: 1.4,
            color: p.dim,
            marginTop: 58,
          }}
        >
          {s.outro}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 85,
          right: 85,
          top: 850,
          borderTop: "1px solid " + p.line,
          paddingTop: 22,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 21,
          color: p.dim,
        }}
      >
        <span>{m.league}</span>
        <span style={{ fontFamily: mono }}>
          {m.game === "lol"
            ? "oracleselixir.com · Riot Games"
            : "opendota.com/matches/" + m.id}
        </span>
      </div>
    </AbsoluteFill>
  );
}
function FilmScene(props: Ctx) {
  const frame = useCurrentFrame();
  const length = props.segments[props.index].frames;
  const opacity = Math.min(
    enter(frame, 0, 10),
    interpolate(frame, [length - 8, length - 1], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const Component = [
    Intro,
    props.match.game === "lol" ? TeamResources : Economy,
    RadarScene,
    Damage,
    Outro,
  ][props.index];
  return (
    <AbsoluteFill style={{ opacity }}>
      <Component {...props} />
    </AbsoluteFill>
  );
}
export function MatchFilm(props: VideoProps) {
  const [fontHandle] = useState(() => delayRender("Loading local title font"));
  useEffect(() => {
    Promise.all([
      document.fonts.load("700 30px Orbitron"),
      document.fonts.load("900 80px Orbitron"),
    ])
      .then(() => continueRender(fontHandle))
      .catch(cancelRender);
  }, [fontHandle]);
  const frame = useCurrentFrame();
  const { match: m, settings: s, segments } = props;
  const p = palettes[s.theme],
    total = totalFrames(segments);
  let offset = 0;
  const starts = segments.map((segment) => {
    const start = offset;
    offset += segment.frames;
    return start;
  });
  const index = Math.max(
    0,
    starts.findLastIndex((start) => frame >= start),
  );
  const caption = props.captions.find((c) => frame >= c.start && frame < c.end);
  return (
    <AbsoluteFill
      style={{ fontFamily: font, color: p.ink, overflow: "hidden" }}
    >
      <Background {...props} />
      {props.bgmTrack && s.bgm && (
        <Audio
          src={asset(props.bgmTrack.src)}
          loop={s.bgm.loop}
          loopVolumeCurveBehavior="extend"
          volume={(audioFrame) =>
            bgmVolume(audioFrame, total, props.bgmTrack!.duration, s.bgm!)
          }
        />
      )}
      {segments.map((seg, i) => (
        <Sequence key={i} from={starts[i]} durationInFrames={seg.frames}>
          <FilmScene {...props} index={i} />
        </Sequence>
      ))}
      <div
        style={{
          position: "absolute",
          left: 84,
          right: 84,
          top: 35,
          height: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid " + p.line,
          paddingBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span
            style={{
              width: 11,
              height: 26,
              background: s.accent,
              transform: "skewX(-15deg)",
            }}
          />
          <span style={{ fontWeight: 900, fontSize: 23, letterSpacing: 2 }}>
            {s.brand}
          </span>
          <span
            style={{
              color: p.dim,
              fontFamily: mono,
              fontSize: 17,
              marginLeft: 17,
            }}
          >
            MATCHCUT / {m.game === "lol" ? "LEAGUE OF LEGENDS" : "DOTA 2"}
          </span>
        </div>
        <span style={{ fontFamily: mono, fontSize: 18, color: p.dim }}>
          {m.series ? "SERIES" : "MATCH"} {m.id.replace(/^lol-/, "")}{" "}
          <span style={{ marginLeft: 26, color: s.accent }}>POST MATCH</span>
        </span>
      </div>
      {s.captions && caption && (
        <div
          style={{
            position: "absolute",
            bottom: 88,
            left: 100,
            right: 100,
            textAlign: "center",
            fontSize: 28,
            fontWeight: 600,
            lineHeight: 1.4,
          }}
        >
          <span
            style={{
              padding: "8px 25px",
              background: p.bg + "ed",
              borderLeft: "3px solid " + s.accent,
            }}
          >
            {caption.text}
          </span>
        </div>
      )}
      <div
        style={{
          position: "absolute",
          bottom: 31,
          left: 84,
          right: 84,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: p.dim,
          fontSize: 17,
          letterSpacing: 1,
        }}
      >
        <span>
          {providerName(m).toUpperCase()}{" "}
          <span style={{ marginLeft: 17 }}>
            {m.series
              ? `系列赛累计 · 已收录 ${m.series.games.length} 局`
              : m.gameNumber
                ? `单局数据 · G${m.gameNumber}`
                : "单局数据"}{" "}
            · {m.date.slice(0, 10)}
          </span>
        </span>
        <div style={{ display: "flex", gap: 25 }}>
          {sceneNames(m).map((scene, i) => (
            <span
              key={scene}
              style={{
                color: i === index ? p.ink : p.dim,
                opacity: i === index ? 1 : 0.55,
              }}
            >
              <span
                style={{
                  color: i === index ? s.accent : undefined,
                  fontFamily: mono,
                  marginRight: 8,
                }}
              >
                0{i + 1}
              </span>
              {scene}
            </span>
          ))}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          height: 3,
          width: ((frame + 1) / total) * 100 + "%",
          background: s.accent,
        }}
      />
    </AbsoluteFill>
  );
}
