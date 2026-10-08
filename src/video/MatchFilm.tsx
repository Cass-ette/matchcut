import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import {
  Caption,
  FPS,
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

const font = 'Inter, "Arial", "PingFang SC", "Microsoft YaHei", sans-serif';
const mono = '"SF Mono", "Menlo", monospace';
export const palettes = {
  ember: {
    bg: "#101719",
    panel: "#192326",
    ink: "#f5f1e9",
    dim: "#8b9b9e",
    line: "#304044",
  },
  glacier: {
    bg: "#0d1e2b",
    panel: "#162c3b",
    ink: "#f1f7fa",
    dim: "#87a9ba",
    line: "#2e4757",
  },
  paper: {
    bg: "#f2eee5",
    panel: "#e7e1d6",
    ink: "#172522",
    dim: "#6e7e75",
    line: "#c9cfc5",
  },
};
type Ctx = VideoProps & { index: number };
const kStyle: React.CSSProperties = {
  fontFamily: mono,
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
};
function Portrait({ p, size = 90 }: { p: PlayerData; size?: number }) {
  return (
    <Img
      src={staticFile(p.image.slice(1))}
      style={{
        width: size,
        height: size,
        objectFit: "cover",
        borderRadius: 16,
      }}
    />
  );
}
function Heading({
  eyebrow,
  title,
  subtitle,
  props,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  props: Ctx;
}) {
  const p = palettes[props.settings.theme];
  return (
    <div style={{ marginBottom: 38 }}>
      <div
        style={{
          fontSize: 23,
          letterSpacing: 5,
          color: props.settings.accent,
          marginBottom: 24,
          fontFamily: mono,
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          fontSize: 70,
          fontWeight: 750,
          letterSpacing: -2,
          lineHeight: 1.18,
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{ fontSize: 26, color: p.dim, marginTop: 22, lineHeight: 1.6 }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}
function Intro(props: Ctx) {
  const { match: m, settings: s } = props;
  const p = palettes[s.theme];
  const f = useCurrentFrame();
  const open = interpolate(f, [0, 28], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const teams = [
    {
      name: m.radiant,
      side: "radiant",
      score: m.radiantScore,
      color: s.accent,
    },
    { name: m.dire, side: "dire", score: m.direScore, color: s.secondary },
  ];
  return (
    <div style={{ paddingTop: 8 }}>
      <div
        style={{
          fontSize: 24,
          letterSpacing: 4,
          color: p.dim,
          fontFamily: mono,
          marginBottom: 30,
        }}
      >
        DOTA 2 / POST-MATCH REPORT
      </div>
      <div
        style={{
          fontSize: 82,
          fontWeight: 800,
          lineHeight: 1.2,
          letterSpacing: -3,
          maxWidth: 900,
          minHeight: 198,
          transform: "translateY(" + (1 - open) * 30 + "px)",
          opacity: open,
        }}
      >
        {s.headline}
      </div>
      <div
        style={{
          display: "flex",
          gap: 18,
          alignItems: "center",
          marginTop: 25,
          marginBottom: 50,
        }}
      >
        <span style={{ height: 3, width: 55, background: s.accent }} />
        <span style={{ fontSize: 25, color: p.dim }}>{m.league}</span>
      </div>
      <div
        style={{
          background: p.panel,
          borderRadius: 28,
          padding: "28px 36px 35px",
          border: "1px solid " + p.line,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 20,
            letterSpacing: 2,
            color: p.dim,
            marginBottom: 24,
          }}
        >
          <span>FINAL · 单局赛果</span>
          <span style={kStyle}>{matchDuration(m.duration)}</span>
        </div>
        {teams.map((t, i) => (
          <React.Fragment key={t.side}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 20,
                padding: "28px 0",
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: mono,
                    fontSize: 20,
                    color: t.color,
                    marginBottom: 14,
                  }}
                >
                  {t.side === "radiant" ? "RADIANT / 天辉" : "DIRE / 夜魇"}
                  {m.winner === t.side ? "  ·  VICTORY" : ""}
                </div>
                <div
                  style={{
                    fontSize: 54,
                    fontWeight: 750,
                    maxWidth: 610,
                    overflowWrap: "anywhere",
                  }}
                >
                  {t.name}
                </div>
              </div>
              <div
                style={{
                  ...kStyle,
                  fontSize: 125,
                  lineHeight: 1,
                  color: t.color,
                }}
              >
                {Math.round(t.score * open)}
              </div>
            </div>
            {i === 0 && <div style={{ height: 1, background: p.line }} />}
          </React.Fragment>
        ))}
        <div style={{ fontSize: 19, color: p.dim, marginTop: 20 }}>
          比分表示英雄击杀数 · 胜负以比赛结果为准
        </div>
      </div>
      <div style={{ marginTop: 48, display: "flex", gap: 7 }}>
        {m.players.map((player) => (
          <div
            key={player.slot}
            style={{
              flex: 1,
              borderBottom:
                "3px solid " +
                (player.side === "radiant" ? s.accent : s.secondary),
              paddingBottom: 10,
              marginLeft: player.slot === 128 ? 14 : 0,
            }}
          >
            <Img
              src={staticFile(player.image.slice(1))}
              style={{
                width: "100%",
                height: 62,
                objectFit: "cover",
                borderRadius: 6,
              }}
            />
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 22,
          fontSize: 23,
          color: p.dim,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>经济走势 / 选手对比 / 伤害排行</span>
        <span>01—05</span>
      </div>
    </div>
  );
}
function Economy(props: Ctx) {
  const { match: m, settings: s } = props;
  const p = palettes[s.theme];
  const f = useCurrentFrame();
  const progress = interpolate(
    f,
    [15, Math.min(props.segments[1].frames - 50, 200)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const { max, min, final } = facts(m);
  const cap =
    Math.ceil(Math.max(...m.gold.map((x) => Math.abs(x.value)), 1000) / 2000) *
    2000;
  const w = 940,
    h = 630,
    left = 70,
    right = 880,
    top = 48,
    bottom = 555;
  const cy = (top + bottom) / 2;
  const x = (minute: number) =>
    left + (minute / Math.max(1, final.minute)) * (right - left);
  const y = (v: number) => cy - ((v / cap) * (bottom - top)) / 2;
  const line = m.gold
    .map((v, i) => (i ? "L" : "M") + x(v.minute) + "," + y(v.value))
    .join(" ");
  const cursor =
    m.gold[
      Math.min(m.gold.length - 1, Math.floor(progress * (m.gold.length - 1)))
    ];
  return (
    <>
      <Heading
        eyebrow="02 / THE MOMENTUM"
        title="优势，如何流动？"
        subtitle="逐分钟经济差 · 正值为天辉领先，负值为夜魇领先"
        props={props}
      />
      <div style={{ display: "flex", gap: 25, marginBottom: 26 }}>
        {[
          { v: Math.max(0, max.value), t: m.radiant, c: s.accent },
          { v: Math.max(0, -min.value), t: m.dire, c: s.secondary },
        ].map((a) => (
          <div
            key={a.t}
            style={{
              background: p.panel,
              borderRadius: 20,
              padding: "28px 32px",
              flex: 1,
              borderTop: "3px solid " + a.c,
            }}
          >
            <div style={{ fontSize: 23, color: p.dim }}>{a.t} · 最大领先</div>
            <div style={{ fontSize: 68, marginTop: 12, color: a.c, ...kStyle }}>
              {compact(a.v)}
            </div>
          </div>
        ))}
      </div>
      <svg
        width="940"
        height="630"
        viewBox={"0 0 " + w + " " + h}
        style={{ overflow: "visible" }}
      >
        <defs>
          <clipPath id="chart-progress">
            <rect x="0" y="0" width={x(cursor.minute) + 2} height={h} />
          </clipPath>
          <clipPath id="positive">
            <rect x="0" y="0" width={w} height={cy} />
          </clipPath>
          <clipPath id="negative">
            <rect x="0" y={cy} width={w} height={h} />
          </clipPath>
        </defs>
        {[-1, -0.5, 0, 0.5, 1].map((v) => (
          <g key={v}>
            <line
              x1={left}
              x2={right}
              y1={y(v * cap)}
              y2={y(v * cap)}
              stroke={p.line}
              strokeWidth={v === 0 ? 2 : 1}
              strokeDasharray={v === 0 ? "" : "5 9"}
            />
            <text
              x={left - 12}
              y={y(v * cap) + 7}
              textAnchor="end"
              fill={p.dim}
              fontFamily={mono}
              fontSize="18"
            >
              {v === 0 ? "0" : compact(v * cap)}
            </text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <text
            key={v}
            x={left + v * (right - left)}
            y={bottom + 44}
            textAnchor="middle"
            fill={p.dim}
            fontFamily={mono}
            fontSize="20"
          >
            {Math.round(v * final.minute)}′
          </text>
        ))}
        <g clipPath="url(#chart-progress)">
          <path
            d={
              line +
              " L" +
              x(final.minute) +
              "," +
              cy +
              " L" +
              left +
              "," +
              cy +
              " Z"
            }
            fill={s.accent}
            opacity=".14"
            clipPath="url(#positive)"
          />
          <path
            d={
              line +
              " L" +
              x(final.minute) +
              "," +
              cy +
              " L" +
              left +
              "," +
              cy +
              " Z"
            }
            fill={s.secondary}
            opacity=".14"
            clipPath="url(#negative)"
          />
          <path
            d={line}
            fill="none"
            stroke={s.accent}
            strokeWidth="6"
            strokeLinejoin="round"
            clipPath="url(#positive)"
          />
          <path
            d={line}
            fill="none"
            stroke={s.secondary}
            strokeWidth="6"
            strokeLinejoin="round"
            clipPath="url(#negative)"
          />
        </g>
        <line
          x1={x(cursor.minute)}
          x2={x(cursor.minute)}
          y1={top}
          y2={bottom}
          stroke={p.ink}
          opacity=".18"
          strokeDasharray="5 8"
        />
        <circle
          cx={x(cursor.minute)}
          cy={y(cursor.value)}
          r="9"
          fill={cursor.value >= 0 ? s.accent : s.secondary}
        />
      </svg>
      <div
        style={{
          borderLeft: "4px solid " + s.accent,
          padding: "8px 0 8px 25px",
          marginTop: 10,
        }}
      >
        <div style={{ fontSize: 37, fontWeight: 700 }}>
          第 {cursor.minute} 分钟{" "}
          <span
            style={{
              color: cursor.value >= 0 ? s.accent : s.secondary,
              ...kStyle,
            }}
          >
            {cursor.value >= 0 ? "+" : ""}
            {num(cursor.value)}
          </span>
        </div>
        <div style={{ fontSize: 24, color: p.dim, marginTop: 14 }}>
          以分钟采样呈现走势，不推断具体团战过程。
        </div>
      </div>
    </>
  );
}
function RadarScene(props: Ctx) {
  const { match: m, settings: s } = props;
  const p = palettes[s.theme];
  const [a, b] = getFocus(m);
  const axes = radar(m);
  const f = useCurrentFrame();
  const growth = interpolate(f, [12, 55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const point = (i: number, ratio: number) => [
    470 + Math.sin((i * Math.PI) / 3) * 252 * ratio,
    335 - Math.cos((i * Math.PI) / 3) * 252 * ratio,
  ];
  const polygon = (values: number[]) =>
    values.map((v, i) => point(i, v).join(",")).join(" ");
  return (
    <>
      <Heading
        eyebrow="03 / PLAYER SPOTLIGHT"
        title="两种输出，一张雷达"
        subtitle="选择双方英雄伤害最高的选手，比较本场实际数据"
        props={props}
      />
      <div style={{ display: "flex", gap: 24 }}>
        {[a, b].map((player, i) => (
          <div
            key={player.slot}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 20,
              background: p.panel,
              padding: 22,
              borderRadius: 20,
              borderBottom: "3px solid " + (i ? s.secondary : s.accent),
            }}
          >
            <Portrait p={player} size={88} />
            <div>
              <div
                style={{
                  fontSize: 39,
                  fontWeight: 750,
                  color: i ? s.secondary : s.accent,
                }}
              >
                {player.name}
              </div>
              <div style={{ fontSize: 21, color: p.dim, marginTop: 8 }}>
                {player.hero}
              </div>
            </div>
          </div>
        ))}
      </div>
      <svg width="940" height="670" viewBox="0 0 940 670">
        {[0.25, 0.5, 0.75, 1].map((r) => (
          <polygon
            key={r}
            points={polygon(Array(6).fill(r))}
            fill="none"
            stroke={p.line}
            strokeWidth="2"
          />
        ))}
        {axes.map((v, i) => (
          <g key={v.label}>
            <line
              x1="470"
              y1="335"
              x2={point(i, 1)[0]}
              y2={point(i, 1)[1]}
              stroke={p.line}
            />
            <text
              x={point(i, 1.24)[0]}
              y={point(i, 1.14)[1] + 8}
              fill={p.dim}
              fontSize="25"
              fontFamily={font}
              textAnchor="middle"
            >
              {v.label}
            </text>
          </g>
        ))}
        <polygon
          points={polygon(axes.map((x) => x.br * growth))}
          fill={s.secondary}
          fillOpacity=".16"
          stroke={s.secondary}
          strokeWidth="5"
        />
        <polygon
          points={polygon(axes.map((x) => x.ar * growth))}
          fill={s.accent}
          fillOpacity=".18"
          stroke={s.accent}
          strokeWidth="5"
        />
        {axes.map((v, i) => (
          <g key={i}>
            <circle
              cx={point(i, v.ar * growth)[0]}
              cy={point(i, v.ar * growth)[1]}
              r="6"
              fill={s.accent}
            />
            <circle
              cx={point(i, v.br * growth)[0]}
              cy={point(i, v.br * growth)[1]}
              r="6"
              fill={s.secondary}
            />
          </g>
        ))}
      </svg>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 18,
          marginTop: -12,
        }}
      >
        {axes.map((axis) => (
          <div
            key={axis.label}
            style={{
              padding: "17px 21px",
              background: p.panel,
              borderRadius: 12,
            }}
          >
            <div style={{ fontSize: 20, color: p.dim, marginBottom: 11 }}>
              {axis.label}
            </div>
            <div style={{ fontSize: 27, ...kStyle }}>
              <span style={{ color: s.accent }}>{num(axis.a)}</span>
              <span style={{ color: p.dim, fontSize: 20 }}> / </span>
              <span style={{ color: s.secondary }}>{num(axis.b)}</span>
            </div>
          </div>
        ))}
      </div>
      <div
        style={{ fontSize: 23, lineHeight: 1.7, color: p.dim, marginTop: 24 }}
      >
        每轴以两人较高值为 100%，不是综合能力评分。
        <br />
        每分钟伤害 = 英雄总伤害 ÷ 全局分钟数。
      </div>
    </>
  );
}
function DamageScene(props: Ctx) {
  const { match: m, settings: s } = props;
  const p = palettes[s.theme];
  const f = useCurrentFrame();
  const players = sortedDamage(m).slice(0, 5);
  const cap = players[0].damage || 1;
  return (
    <>
      <Heading
        eyebrow="04 / DAMAGE LEADERS"
        title="谁打出了最多伤害？"
        subtitle="全场英雄伤害前五 · 累计值，不含建筑伤害"
        props={props}
      />
      {players.map((player, i) => {
        const value = interpolate(f, [10 + i * 8, 45 + i * 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        });
        const color = player.side === "radiant" ? s.accent : s.secondary;
        return (
          <div
            key={player.slot}
            style={{
              marginTop: 24,
              padding: "22px 25px",
              background: p.panel,
              borderRadius: 18,
              opacity: value,
              transform: "translateX(" + (1 - value) * 30 + "px)",
            }}
          >
            <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
              <div style={{ ...kStyle, fontSize: 25, color: p.dim, width: 26 }}>
                {String(i + 1).padStart(2, "0")}
              </div>
              <Portrait p={player} size={75} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 34, fontWeight: 700 }}>
                  {player.name}
                </div>
                <div style={{ fontSize: 20, color: p.dim, marginTop: 7 }}>
                  {m[player.side]} · {player.hero}
                </div>
              </div>
              <div style={{ fontSize: 43, ...kStyle, color }}>
                {num(player.damage * value)}
              </div>
            </div>
            <div
              style={{
                margin: "18px 0 0 46px",
                height: 9,
                borderRadius: 5,
                background: p.line,
              }}
            >
              <div
                style={{
                  width: (player.damage / cap) * value * 100 + "%",
                  background: color,
                  borderRadius: 5,
                  height: "100%",
                }}
              />
            </div>
          </div>
        );
      })}
      <div
        style={{ fontSize: 25, color: p.dim, lineHeight: 1.7, marginTop: 35 }}
      >
        输出量是比赛的一个侧面。
        <br />
        职责、控制和关键决策，同样影响胜负。
      </div>
    </>
  );
}
function Outro(props: Ctx) {
  const { match: m, settings: s } = props;
  const p = palettes[s.theme];
  const stat = facts(m);
  const color = m.winner === "radiant" ? s.accent : s.secondary;
  return (
    <>
      <div
        style={{
          fontSize: 23,
          letterSpacing: 5,
          color,
          fontFamily: mono,
          marginTop: 24,
        }}
      >
        05 / THE FINAL WORD
      </div>
      <div style={{ fontSize: 29, color: p.dim, marginTop: 75 }}>本局胜者</div>
      <div
        style={{
          fontSize: 100,
          fontWeight: 800,
          lineHeight: 1.1,
          marginTop: 24,
          overflowWrap: "anywhere",
          color,
        }}
      >
        {stat.winner}
      </div>
      <div
        style={{ fontSize: 180, ...kStyle, marginTop: 40, lineHeight: 1.15 }}
      >
        {m.radiantScore}
        <span style={{ color: p.dim, fontSize: 100 }}> : </span>
        {m.direScore}
      </div>
      <div style={{ fontSize: 25, color: p.dim, marginTop: 16 }}>
        天辉 / 夜魇人头 · {matchDuration(m.duration)} · 单局结果
      </div>
      <div style={{ height: 1, background: p.line, margin: "58px 0" }} />
      <div
        style={{
          fontSize: 53,
          fontWeight: 700,
          lineHeight: 1.55,
          maxWidth: 870,
        }}
      >
        {s.outro}
      </div>
      <div
        style={{
          padding: 30,
          background: p.panel,
          borderRadius: 20,
          marginTop: 60,
        }}
      >
        <div style={{ fontSize: 22, color: p.dim, lineHeight: 1.8 }}>
          数据：OpenDota / Dota 2<br />
          比赛编号：{m.id}
          <br />
          雷达仅比较本场两名选手；不代表综合能力。
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, marginTop: 38 }}>
        {s.brand}
      </div>
    </>
  );
}
const sections = [Intro, Economy, RadarScene, DamageScene, Outro];
function FilmScene(props: Ctx) {
  const frame = useCurrentFrame();
  const p = palettes[props.settings.theme];
  const duration = props.segments[props.index].frames;
  const opacity = interpolate(
    frame,
    [0, 12, duration - 10, duration],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const Section = sections[props.index];
  return (
    <AbsoluteFill
      style={{ opacity, padding: "245px 70px 235px", color: p.ink }}
    >
      <Section {...props} />
    </AbsoluteFill>
  );
}
function Subtitles({
  captions,
  color,
}: {
  captions: Caption[];
  color: string;
}) {
  const f = useCurrentFrame();
  const c = captions.find((x) => f >= x.start && f < x.end);
  if (!c) return null;
  return (
    <div
      style={{
        position: "absolute",
        bottom: 158,
        left: 60,
        right: 60,
        textAlign: "center",
      }}
    >
      <span
        style={{
          display: "inline-block",
          maxWidth: "100%",
          fontSize: 34,
          lineHeight: 1.6,
          padding: "12px 25px",
          background: "#071015e8",
          borderRadius: 12,
          color: "#fff",
          borderBottom: "2px solid " + color,
        }}
      >
        {c.text}
      </span>
    </div>
  );
}
export function MatchFilm(props: VideoProps) {
  const { settings: s, match: m, segments } = props;
  const p = palettes[s.theme];
  const f = useCurrentFrame();
  const duration = totalFrames(segments);
  let from = 0;
  const starts = segments.map((x) => {
    const n = from;
    from += x.frames;
    return n;
  });
  const current = Math.max(
    0,
    starts.findLastIndex((x) => x <= f),
  );
  return (
    <AbsoluteFill
      style={{
        fontFamily: font,
        backgroundColor: p.bg,
        color: p.ink,
        overflow: "hidden",
      }}
    >
      <svg
        width="1080"
        height="1920"
        style={{
          position: "absolute",
          opacity: s.theme === "paper" ? 0.25 : 0.14,
        }}
      >
        <defs>
          <pattern
            id="bg-grid"
            width="90"
            height="90"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 90 0 L 0 0 0 90"
              fill="none"
              stroke={p.dim}
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="1080" height="1920" fill="url(#bg-grid)" />
      </svg>
      <div
        style={{
          position: "absolute",
          width: 230,
          height: 7,
          top: 0,
          left: 70,
          background: s.accent,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 76,
          left: 70,
          right: 70,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 33, letterSpacing: -1 }}>
          MATCH<span style={{ color: s.accent }}>CUT</span>
          <span
            style={{
              fontSize: 22,
              color: p.dim,
              fontWeight: 400,
              marginLeft: 24,
            }}
          >
            {s.brand}
          </span>
        </div>
        <span style={{ fontSize: 22, color: p.dim, fontFamily: mono }}>
          {new Date(m.date).toISOString().slice(0, 10)}
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          top: 155,
          left: 70,
          right: 70,
          display: "flex",
          gap: 10,
        }}
      >
        {segments.map((seg, i) => (
          <div
            key={i}
            style={{
              height: 4,
              background: p.line,
              flex: seg.frames,
              overflow: "hidden",
              borderRadius: 3,
            }}
          >
            <div
              style={{
                height: "100%",
                background: s.accent,
                width:
                  Math.max(0, Math.min(1, (f - starts[i]) / seg.frames)) * 100 +
                  "%",
              }}
            />
          </div>
        ))}
      </div>
      {segments.map((seg, i) => (
        <Sequence
          key={i}
          from={starts[i]}
          durationInFrames={seg.frames}
          premountFor={30}
        >
          <FilmScene {...props} index={i} />
        </Sequence>
      ))}
      {s.captions && <Subtitles captions={props.captions} color={s.accent} />}
      <div
        style={{
          position: "absolute",
          bottom: 73,
          left: 70,
          right: 70,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 20,
          color: p.dim,
          fontFamily: mono,
        }}
      >
        <span>
          {String(current + 1).padStart(2, "0")} / {SCENES[current]}
        </span>
        <span>OPENDOTA · #{m.id}</span>
      </div>
    </AbsoluteFill>
  );
}
