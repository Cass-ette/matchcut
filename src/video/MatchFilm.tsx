import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
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
  SCENES,
  VideoProps,
  compact,
  facts,
  getFocus,
  matchDuration,
  num,
  radar,
  sortedDamage,
  totalFrames,
} from "../domain";

const font = '"Arial", "PingFang SC", "Microsoft YaHei", sans-serif';
const display = '"Orbitron", "Arial Black", "Arial", "PingFang SC", sans-serif';
const mono = '"SF Mono", "Menlo", monospace';
export const palettes = {
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
  return (
    <AbsoluteFill style={{ background: p.bg, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 15% 50%, " +
            s.accent +
            "15, transparent 52%), radial-gradient(ellipse at 88% 35%, " +
            s.secondary +
            "12, transparent 50%)",
        }}
      />
      <svg
        width="1920"
        height="1080"
        style={{ position: "absolute", opacity: 0.5 }}
      >
        <defs>
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
        {Array.from({ length: 42 }, (_, i) => {
          const x = (i * 367 + 29 + frame * (0.15 + (i % 3) * 0.07)) % 1920;
          const y =
            (i * 173 + 30 - frame * (0.12 + (i % 4) * 0.04) + 2160) % 1080;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={i % 4 === 0 ? 2.5 : 1}
              fill={i % 2 ? s.accent : s.secondary}
              opacity={0.18 + 0.22 * Math.sin(i + frame / 55) ** 2}
            />
          );
        })}
      </svg>
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
        <Tag color={p.dim}>DOTA 2 · POST MATCH</Tag>
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
                  {Math.round(m.radiantScore * op)}
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
                  {Math.round(m.direScore * op)}
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
                英雄击杀 · {matchDuration(m.duration)}
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
                    {side === "radiant" ? "RADIANT / 天辉" : "DIRE / 夜魇"}
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
                    {winner ? "VICTORY" : "DEFEAT"}
                  </span>
                </div>
              );
            })()
          ),
        )}
      </div>
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
          {m.date.slice(0, 10)} · 单局赛果
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
}: {
  props: Ctx;
  mode: number;
  local: number;
}) {
  const { match: m, settings: s } = props;
  const p = palettes[s.theme],
    axes = radar(m);
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
      ? a.map((v) => v * morph)
      : mode === 1
        ? b.map((v, i) => a[i] + (v - a[i]) * morph)
        : b;
  const color = mode === 0 ? s.accent : s.secondary;
  const shape = (values: number[], c: string, alpha = 1, key = "") => (
    <g key={key} opacity={alpha}>
      <polygon
        points={polygon(values)}
        fill={c + "13"}
        stroke={c}
        strokeWidth="15"
        strokeLinejoin="round"
        opacity=".14"
      />
      <polygon
        points={polygon(values)}
        fill={c + "0d"}
        stroke={c}
        strokeWidth="5"
        strokeLinejoin="round"
        opacity=".7"
      />
      <polygon
        points={polygon(values)}
        fill="none"
        stroke={c}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {values.map((v, i) => (
        <circle
          key={i}
          cx={point(i, r * v)[0]}
          cy={point(i, r * v)[1]}
          r="4"
          fill="#fff"
        />
      ))}
    </g>
  );
  return (
    <svg width="970" height="760" style={{ overflow: "visible" }}>
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
        const label = [
          "击杀 / KILLS",
          "助攻 / AST",
          "经济 / GPM",
          "经验 / XPM",
          "伤害 / DPM",
          "建筑伤害",
        ][i];
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
                  <tspan fill={s.accent}>{num(axis.a)}</tspan>
                  <tspan fill={p.dim}> / </tspan>
                  <tspan fill={s.secondary}>{num(axis.b)}</tspan>
                </>
              ) : (
                num(mode === 0 ? axis.a : axis.b)
              )}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
function RadarScene(props: Ctx) {
  const { match: m, settings: s } = props;
  const p = palettes[s.theme],
    frame = useCurrentFrame(),
    focus = getFocus(m);
  const third = props.segments[2].frames / 3;
  const mode = Math.min(2, Math.floor(frame / third)),
    local = frame - mode * third;
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
          03 / PLAYER RADAR
        </Tag>
        <span style={{ fontSize: 20, color: p.dim }}>双方队内伤害第一</span>
      </div>
      <div style={{ position: "absolute", top: 200, left: 72 }}>
        <RadarChart props={props} mode={mode} local={local} />
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
                textShadow: "0 0 35px " + color + "70",
              }}
            >
              {player.name}
            </div>
          </div>
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
                <Tag color={p.dim}>队内伤害占比</Tag>
                <div style={{ ...digits, color, fontSize: 46, marginTop: 15 }}>
                  {teamTotal
                    ? ((100 * player.damage) / teamTotal).toFixed(1)
                    : "0.0"}
                  <span style={{ fontSize: 25 }}>%</span>
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
          <Tag color={p.dim}>HEAD TO HEAD / 本局数据</Tag>
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
                  {num(pl.damage)}{" "}
                  <span style={{ fontSize: 18, color: p.dim }}>伤害</span>
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
            比较本场数据，不作综合能力评级。
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
        六轴相对值 · 非能力评分
        <br />
        DPM = 英雄伤害 / 本场分钟数
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
        谁打出了最多伤害
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
        <Tag color={color}>全场英雄伤害第一</Tag>
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
          <span>TOP 05 / 英雄伤害</span>
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
          不含建筑伤害 · 输出量不等于全部贡献
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
    winnerPlayer = focus[m.winner === "radiant" ? 0 : 1],
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
        VICTORY
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
        <Tag color={color}>FINAL / 本局胜者</Tag>
        <div
          style={{
            fontSize: fit(f.winner, 1000, 101),
            fontWeight: 900,
            lineHeight: 1.16,
            marginTop: 21,
          }}
        >
          {f.winner}
        </div>
        <div
          style={{ width: 83, height: 5, background: color, margin: "34px 0" }}
        />
        <div style={{ display: "flex", gap: 55, marginTop: 37 }}>
          {[
            ["比赛用时", matchDuration(m.duration)],
            ["英雄击杀", m.radiantScore + " : " + m.direScore],
            ["全场最高伤害", compact(f.top.damage)],
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
        <span style={{ fontFamily: mono }}>opendota.com/matches/{m.id}</span>
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
  const Component = [Intro, Economy, RadarScene, Damage, Outro][props.index];
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
            MATCHCUT / DOTA 2
          </span>
        </div>
        <span style={{ fontFamily: mono, fontSize: 18, color: p.dim }}>
          MATCH {m.id}{" "}
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
          OPENDOTA{" "}
          <span style={{ marginLeft: 17 }}>
            单局数据 · {m.date.slice(0, 10)}
          </span>
        </span>
        <div style={{ display: "flex", gap: 25 }}>
          {SCENES.map((scene, i) => (
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
