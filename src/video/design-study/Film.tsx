import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import "@fontsource/orbitron/latin-700.css";
import { axisValue, matchDuration, radar, type PlayerData } from "../../domain";
import { studyMatch as match, studyPair as pair } from "./model";

const c = {
  background: "#151617",
  ink: "#f1f0ec",
  dim: "#999b9e",
  line: "#383a3b",
  gold: "#d7bd78",
  red: "#ef6574",
};
const body = 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif';
const numeric = '"Barlow Condensed", Arial, sans-serif';
const identity = "Orbitron, Arial, sans-serif";
const asset = (path: string) => staticFile(path.replace(/^\//, ""));
const ease = (frame: number, start: number, duration = 24) =>
  interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
const axes = radar(match, pair, 3);
const color = (side: number) => (side === 0 ? c.gold : c.red);
const point = (index: number, radius: number) => {
  const angle = -Math.PI / 2 + (index * Math.PI) / 3;
  return [960 + Math.cos(angle) * radius, 558 + Math.sin(angle) * radius];
};
const polygon = (radii: number[]) =>
  radii.map((radius, i) => point(i, radius).join(",")).join(" ");

function Portrait({ player, side }: { player: PlayerData; side: number }) {
  const frame = useCurrentFrame();
  const transition = ease(frame, 132, 32);
  const reveal = ease(frame, 5 + side * 5, 30);
  const faker = side === 1;
  const left = faker ? 1340 + 100 * transition : 160 - 100 * transition;
  return (
    <div
      style={{
        position: "absolute",
        left,
        top: 278,
        width: 420,
        textAlign: "center",
        opacity: reveal,
        transform: `translateY(${(1 - reveal) * 18}px)`,
      }}
    >
      <div
        style={{
          height: 42,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 15,
        }}
      >
        <Img
          src={asset((faker ? match.direLogo : match.radiantLogo)!)}
          style={{ width: 56, height: 38, objectFit: "contain" }}
        />
        <span style={{ fontSize: 23, fontWeight: 600 }}>
          {faker ? match.dire : match.radiant}
        </span>
        <span style={{ color: c.dim, fontFamily: numeric, fontSize: 24 }}>
          MID
        </span>
      </div>
      <div
        style={{
          position: "relative",
          marginTop: 24,
          height: 408,
          overflow: "hidden",
          maskImage: "linear-gradient(to bottom, black 73%, transparent 93%)",
        }}
      >
        <Img
          src={asset(player.playerArtwork!)}
          style={{
            position: "absolute",
            width: faker ? 578 : 408,
            maxWidth: "none",
            left: faker ? -79 : 6,
            top: faker ? -70 : 0,
            filter: "saturate(0.72)",
          }}
        />
      </div>
      <div
        style={{
          marginTop: -6,
          position: "relative",
          fontFamily: identity,
          fontSize: 52,
          fontWeight: 700,
          lineHeight: 1.3,
        }}
      >
        {player.name}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          marginTop: 12,
        }}
      >
        <Img
          src={asset(player.image)}
          style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 2 }}
        />
        <span style={{ fontSize: 20, color: c.dim }}>{player.hero}</span>
        <span
          style={{ width: 1, height: 20, background: c.line, margin: "0 4px" }}
        />
        <span style={{ fontFamily: numeric, fontSize: 32, color: color(side) }}>
          {player.kills} <span style={{ color: c.dim }}>/</span> {player.deaths}{" "}
          <span style={{ color: c.dim }}>/</span> {player.assists}
        </span>
      </div>
    </div>
  );
}

function Opening() {
  const frame = useCurrentFrame();
  const reveal = ease(frame, 14, 28);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: 1 - ease(frame, 126, 18),
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 145,
          fontSize: 51,
          fontWeight: 600,
        }}
      >
        2024 LCK 春季赛决赛
      </div>
      <div
        style={{
          position: "absolute",
          right: 80,
          top: 160,
          fontFamily: numeric,
          fontSize: 32,
          color: c.dim,
        }}
      >
        GAME 01
      </div>
      <div
        style={{
          position: "absolute",
          top: 326,
          left: 620,
          width: 680,
          textAlign: "center",
          opacity: reveal,
          transform: `translateY(${(1 - reveal) * 16}px)`,
        }}
      >
        <div style={{ fontFamily: numeric, fontSize: 26, color: c.dim }}>
          GEN.G <span style={{ margin: "0 18px" }}>vs</span> T1
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 36,
            marginTop: 8,
            fontFamily: numeric,
            lineHeight: 1,
            fontSize: 186,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span style={{ color: c.gold }}>{match.radiantScore}</span>
          <span style={{ fontSize: 74, color: "#656768", paddingBottom: 16 }}>
            :
          </span>
          <span>{match.direScore}</span>
        </div>
        <div style={{ fontSize: 20, color: c.dim, marginTop: 23 }}>
          击杀比分 <span style={{ margin: "0 14px", color: c.line }}>/</span>{" "}
          {matchDuration(match.duration)}
        </div>
        <div
          style={{
            width: 320,
            height: 1,
            background: c.line,
            margin: "34px auto 27px",
          }}
        />
        <div style={{ fontSize: 29, fontWeight: 500 }}>
          <span style={{ color: c.gold }}>Gen.G</span> 先下一城
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          top: 933,
          display: "flex",
          alignItems: "center",
          gap: 28,
          opacity: ease(frame, 65, 24),
        }}
      >
        <span style={{ color: c.dim, fontSize: 20 }}>本局焦点</span>
        <span style={{ width: 44, height: 2, background: c.gold }} />
        <span style={{ fontSize: 27 }}>中路对位</span>
        <span style={{ fontFamily: identity, fontSize: 23, marginLeft: 12 }}>
          Chovy{" "}
          <span style={{ color: c.dim, fontFamily: body, margin: "0 12px" }}>
            vs
          </span>{" "}
          Faker
        </span>
      </div>
    </div>
  );
}

const labelPositions = [
  [960, 270],
  [1264, 409],
  [1264, 659],
  [960, 823],
  [656, 659],
  [656, 409],
];

function Radar() {
  const frame = useCurrentFrame();
  const visible = ease(frame, 148, 25);
  const shapeA = ease(frame, 184, 38);
  const shapeB = ease(frame, 213, 38);
  const highlight =
    frame >= 315 && frame < 474 ? 4 : frame >= 486 && frame < 636 ? 5 : -1;
  const revealLine = ease(frame, 168, 22);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: visible }}>
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 146,
          display: "flex",
          gap: 26,
          alignItems: "baseline",
        }}
      >
        <span style={{ fontSize: 51, fontWeight: 600 }}>中路对位</span>
        <span style={{ fontFamily: numeric, fontSize: 27, color: c.dim }}>
          MID LANE
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          right: 80,
          top: 153,
          display: "flex",
          gap: 21,
          alignItems: "center",
          fontSize: 21,
        }}
      >
        <span style={{ color: c.gold }}>Gen.G</span>
        <span style={{ fontFamily: numeric, fontSize: 35 }}>24 : 10</span>
        <span style={{ color: c.red }}>T1</span>
        <span style={{ color: c.line }}>|</span>
        <span style={{ color: c.dim }}>G1</span>
      </div>
      <svg
        width="1920"
        height="1080"
        style={{ position: "absolute", inset: 0 }}
      >
        {[0.25, 0.5, 0.75, 1].map((scale) => (
          <polygon
            key={scale}
            points={polygon(Array(6).fill(226 * scale))}
            fill="none"
            stroke={scale === 1 ? "#515354" : "#353738"}
            strokeWidth={scale === 1 ? 1.6 : 1}
            opacity={revealLine}
          />
        ))}
        {axes.map((_, i) => {
          const [x, y] = point(i, 226);
          return (
            <line
              key={i}
              x1="960"
              y1="558"
              x2={x}
              y2={y}
              stroke={i === highlight ? c.ink : "#353738"}
              strokeWidth={i === highlight ? 2 : 1}
              opacity={revealLine}
            />
          );
        })}
        {(["ar", "br"] as const).map((key, side) => {
          const progress = side === 0 ? shapeA : shapeB;
          return (
            <g key={key} opacity={progress}>
              <polygon
                points={polygon(
                  axes.map((axis) => (axis[key] ?? 0) * 226 * progress),
                )}
                fill={color(side)}
                fillOpacity={0.095}
                stroke={color(side)}
                strokeWidth={3}
                strokeLinejoin="round"
              />
              {axes.map((axis, i) => {
                const [x, y] = point(i, (axis[key] ?? 0) * 226 * progress);
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r={i === highlight ? 7 : 4}
                    fill={color(side)}
                    stroke={c.background}
                    strokeWidth={2}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
      {axes.map((axis, i) => (
        <div
          key={axis.label}
          style={{
            position: "absolute",
            left: labelPositions[i][0] - 90,
            top: labelPositions[i][1] - 27,
            width: 180,
            textAlign: "center",
            opacity: ease(frame, 163 + i * 3, 20),
          }}
        >
          <div
            style={{
              color: highlight === i ? c.ink : c.dim,
              fontSize: 22,
              fontWeight: highlight === i ? 600 : 400,
            }}
          >
            {axis.label}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 13,
              marginTop: 5,
              fontFamily: numeric,
              fontSize: 32,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span style={{ color: c.gold, opacity: shapeA }}>
              {axis.unit === " CS"
                ? axis.a?.toFixed(1)
                : axisValue(axis.a, axis.unit)}
            </span>
            <span style={{ width: 1, height: 17, background: "#555759" }} />
            <span style={{ color: c.red, opacity: shapeB }}>
              {axis.unit === " CS"
                ? axis.b?.toFixed(1)
                : axisValue(axis.b, axis.unit)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Finding() {
  const frame = useCurrentFrame();
  const stage = frame < 315 ? 0 : frame < 480 ? 1 : frame < 645 ? 2 : 3;
  const start = [248, 315, 480, 645][stage];
  const alpha = ease(frame, start, 15);
  const damageLead = ((axes[4].a! / axes[4].b! - 1) * 100).toFixed(1);
  const participationLead = (axes[5].b! - axes[5].a!).toFixed(1);
  const note = [
    ["本局表现", "Gen.G 拿下首局，聚焦中路表现", "CHOVY / FAKER"],
    ["分均伤害", "Chovy 分均伤害领先", `+${damageLead}%`],
    ["参团率", "Faker 参与了全队九成击杀", `+${participationLead}`],
    ["对位观察", "Chovy 输出更高，Faker 参团率更高", "GAME 01"],
  ][stage];
  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        right: 80,
        top: 916,
        borderTop: `1px solid ${c.line}`,
        paddingTop: 22,
        opacity: alpha,
        transform: `translateY(${(1 - alpha) * 8}px)`,
        display: "flex",
        alignItems: "center",
        gap: 29,
      }}
    >
      <span
        style={{
          width: 4,
          height: 42,
          background: stage === 2 ? c.red : c.gold,
        }}
      />
      <span style={{ color: c.dim, width: 140, fontSize: 23 }}>{note[0]}</span>
      <span style={{ fontSize: 32, fontWeight: 500 }}>{note[1]}</span>
      <span
        style={{
          marginLeft: "auto",
          fontFamily: numeric,
          fontSize: stage === 1 || stage === 2 ? 54 : 28,
          color: stage === 2 ? c.red : stage === 1 ? c.gold : c.dim,
        }}
      >
        {note[2]}
        {stage === 2 && (
          <span style={{ fontFamily: body, fontSize: 23, marginLeft: 12 }}>
            个百分点
          </span>
        )}
      </span>
    </div>
  );
}

export function DesignStudy() {
  const frame = useCurrentFrame();
  const [handle] = useState(() => delayRender("Loading study fonts"));
  useEffect(() => {
    Promise.all([
      document.fonts.load('600 60px "Barlow Condensed"'),
      document.fonts.load("700 52px Orbitron"),
    ])
      .then(() => continueRender(handle))
      .catch(cancelRender);
  }, [handle]);
  return (
    <AbsoluteFill
      style={{
        background: c.background,
        color: c.ink,
        fontFamily: body,
        letterSpacing: 0,
        overflow: "hidden",
      }}
    >
      <style>{`@font-face { font-family: "Barlow Condensed"; src: url("${asset("assets/fonts/barlow-condensed-semibold.woff2")}") format("woff2"); font-style: normal; font-weight: 600; font-display: block; }`}</style>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          height: 5,
          width: 960,
          background: c.gold,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          height: 5,
          width: 960,
          background: c.red,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          top: 44,
          height: 52,
          borderBottom: `1px solid ${c.line}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <span style={{ fontFamily: numeric, fontSize: 27 }}>MATCHCUT</span>
          <span style={{ width: 1, height: 19, background: c.line }} />
          <span style={{ fontSize: 19, color: c.dim }}>赛后雷达</span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 24,
            fontFamily: numeric,
            fontSize: 24,
            color: c.dim,
          }}
        >
          <span>LCK / SPRING FINAL</span>
          <span>2024.04.14</span>
        </div>
      </div>
      <Opening />
      <Radar />
      {pair.map((player, side) => (
        <Portrait key={player.slot} player={player} side={side} />
      ))}
      {frame >= 248 && <Finding />}
      <div
        style={{
          position: "absolute",
          bottom: 27,
          left: 80,
          right: 80,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 16,
          color: "#858789",
        }}
      >
        <span>
          数据：Oracle's Elixir
          <span style={{ marginLeft: 24 }}>定妆照为现有资料图</span>
        </span>
        <span style={{ opacity: ease(frame, 170, 20) }}>
          各轴以两人较高值为满轴 · 非能力评分
        </span>
      </div>
    </AbsoluteFill>
  );
}
