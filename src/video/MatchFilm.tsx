import React, { createContext, useContext, useEffect, useState } from "react";
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
import { comparisonStats, playerShares, playerStats } from "../player-stats";
import { teamInitials } from "../media";
import { StatIcon, StatLabel } from "../StatIcon";
import { PlayerPlaceholder } from "../PlayerPlaceholder";
import { type InventoryItem, type PlayerInventory } from "../items";
import {
  MatchData,
  PlayerData,
  sceneNames,
  sceneSlots,
  csMapIcon,
  isSupport,
  gameScope,
  gameTitle,
  rankedPlayers,
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
  mvpFor,
  num,
  radar,
  sortedDamage,
  totalFrames,
  bgmVolume,
} from "../domain";

// Orbitron supplies Latin lettering; use the bundled Chinese face before any
// system fallback in every video text style, including new tables and labels.
const font = '"Arial", "ZCOOL QingKe HuangYou", "PingFang SC", sans-serif';
const display =
  '"Orbitron", "ZCOOL QingKe HuangYou", "Arial Black", "PingFang SC", sans-serif';
const heading = display;
const mono = '"SF Mono", "Menlo", "ZCOOL QingKe HuangYou", monospace';
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
// Orbitron's wide letterforms need more room than the body font.
const fitDisplay = (text: string, max: number, base: number) =>
  fit(text, max * 0.78, base);
const asset = (path: string) => staticFile(path.replace(/^\//, ""));
const PlayerVisualContext = createContext(false);
const teamColor = (p: PlayerData, s: VideoProps["settings"]) =>
  p.side === "radiant" ? s.accent : s.secondary;
function Inventory({
  inventory,
  palette,
  compact = false,
  narrow = false,
}: {
  inventory: PlayerInventory;
  palette: typeof palettes.ember;
  compact?: boolean;
  narrow?: boolean;
}) {
  const width = narrow
    ? inventory.layout === "list"
      ? 36
      : 32
    : inventory.layout === "list"
      ? compact
        ? 42
        : 54
      : compact
        ? 58
        : 76;
  const height =
    inventory.layout === "list" ? width : narrow ? 32 : compact ? 42 : 55;
  const slot = (item: InventoryItem | null, key: string) => (
    <div
      key={key}
      data-item-slot
      data-item-id={item?.id}
      title={item?.name || "空装备栏"}
      style={{
        width,
        height,
        boxSizing: "border-box",
        border: "1px solid " + palette.line,
        background: palette.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {item?.image ? (
        <Img
          src={asset(item.image)}
          alt={item.name}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      ) : item ? (
        <span
          style={{
            fontFamily: mono,
            fontSize: compact ? 12 : 15,
            color: palette.dim,
          }}
        >
          #{item.id}
        </span>
      ) : null}
      {item?.count && item.count > 1 && (
        <span
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            padding: "1px 4px",
            background: "#080a10e6",
            fontSize: compact ? 12 : 15,
            color: "white",
            lineHeight: 1.1,
          }}
        >
          ×{item.count}
        </span>
      )}
    </div>
  );
  const group = (
    label: string | undefined,
    items: (InventoryItem | null)[],
    key: string,
  ) => (
    <div key={key} data-inventory-group={key} style={{ flexShrink: 0 }}>
      {label && (
        <div
          style={{
            fontSize: compact ? 15 : 18,
            color: palette.dim,
            lineHeight: 1,
            marginBottom: 10,
          }}
        >
          {label}
        </div>
      )}
      <div style={{ display: "flex", gap: narrow ? 3 : compact ? 5 : 8 }}>
        {items.map((item, n) => slot(item, `${key}-${n}`))}
      </div>
    </div>
  );
  return (
    <div
      data-player-inventory
      data-inventory-layout={inventory.layout || "slots"}
      style={{
        display: "flex",
        gap: narrow ? 8 : compact ? 18 : 24,
        alignItems: "flex-start",
      }}
    >
      {group(
        inventory.layout === "list" ? undefined : "最终装备",
        inventory.main,
        "main",
      )}
      {inventory.neutral && group("中立", [inventory.neutral], "neutral")}
      {inventory.enhancement &&
        group("附魔", [inventory.enhancement], "enhancement")}
    </div>
  );
}
function Loadout({
  player,
  palette,
  compact = false,
}: {
  player: PlayerData;
  palette: typeof palettes.ember;
  compact?: boolean;
}) {
  const loadout = player.lolLoadout;
  if (!loadout?.runes && !loadout?.spells?.some(Boolean)) return null;
  const size = compact ? 22 : 32;
  const icon = (
    entry: { id: number; name: string; image?: string } | null,
    key: string,
    spell = false,
  ) => (
    <div
      key={key}
      title={entry?.name}
      data-loadout-icon
      style={{
        width: size,
        height: size,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexShrink: 0,
        borderRadius: spell ? 3 : "50%",
        background: spell ? palette.panel : undefined,
        overflow: "hidden",
      }}
    >
      {entry?.image ? (
        <Img
          src={asset(entry.image)}
          alt={entry.name}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      ) : (
        <span style={{ fontSize: compact ? 8 : 11, color: palette.dim }}>
          {entry ? "#" + entry.id : "—"}
        </span>
      )}
    </div>
  );
  return (
    <div
      data-player-loadout
      style={{ display: "flex", gap: compact ? 3 : 7, alignItems: "center" }}
    >
      {loadout.spells?.some(Boolean) && (
        <div
          style={{
            display: "flex",
            gap: 4,
            paddingRight: compact ? 5 : 12,
            borderRight: "1px solid " + palette.line,
          }}
        >
          {loadout.spells.map((s, i) => icon(s, "spell" + i, true))}
        </div>
      )}
      {loadout.runes && (
        <>
          {icon(loadout.runes.primary, "primary")}
          {loadout.runes.perks
            .slice(0, 4)
            .map((r, i) => icon(r, "primary" + i))}
          {icon(loadout.runes.secondary, "secondary")}
          {loadout.runes.perks.slice(4).map((r, i) => icon(r, "secondary" + i))}
        </>
      )}
    </div>
  );
}
function FullStats({
  match,
  player,
  palette,
}: {
  match: VideoProps["match"];
  player: PlayerData;
  palette: typeof palettes.ember;
}) {
  return (
    <div
      data-full-player-stats
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4,minmax(0,1fr))",
        gap: "6px 18px",
      }}
    >
      {playerStats(match, player).map((stat) => (
        <div
          key={stat.label}
          style={{
            minWidth: 0,
            borderTop: "1px solid " + palette.line,
            paddingTop: 3,
          }}
        >
          <div
            data-stat-label
            style={{ fontSize: 16, lineHeight: "17px", color: palette.dim }}
          >
            {stat.label}
          </div>
          <div
            style={{
              fontFamily: display,
              fontSize: 19,
              fontWeight: 700,
              lineHeight: "22px",
              whiteSpace: "nowrap",
            }}
          >
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}
function Portrait({
  p,
  width = 96,
  height = 62,
}: {
  p: PlayerData;
  width?: number;
  height?: number;
}) {
  const photo = useContext(PlayerVisualContext);
  const image = photo ? p.playerImage || p.playerArtwork : p.image;
  if (!photo && p.champions)
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
  if (!image && photo)
    return (
      <PlayerPlaceholder
        name={p.name}
        compact
        inVideo
        style={{ width, height }}
      />
    );
  if (!image)
    return (
      <div
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#c4d0e415",
          borderBottom: "2px solid #c4d0e450",
          fontFamily: display,
          fontSize: Math.min(30, height * 0.38),
          fontWeight: 900,
        }}
      >
        {teamInitials(p.name)}
      </div>
    );
  return (
    <Img
      data-player-photo={photo || undefined}
      src={asset(image)}
      style={{
        width,
        height,
        objectFit: "cover",
        objectPosition: photo ? "center 20%" : "center",
      }}
    />
  );
}
function ComparisonPortrait({
  player,
  game,
  color,
}: {
  player: PlayerData;
  game: MatchData["game"];
  color: string;
}) {
  const photo = useContext(PlayerVisualContext);
  const hero = game !== "cs2" && !player.champions;
  const heroIcon = (size: number) => (
    <Img
      data-comparison-hero
      src={asset(player.image)}
      alt={player.hero}
      title={player.hero}
      style={{
        width: size,
        height: size,
        objectFit: "cover",
        display: "block",
      }}
    />
  );
  return (
    <div
      data-comparison-portrait
      style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}
    >
      {hero && !photo ? (
        heroIcon(64)
      ) : (
        <Portrait p={player} width={64} height={64} />
      )}
      {hero && photo && (
        <div
          style={{
            position: "absolute",
            right: -5,
            bottom: -4,
            border: "2px solid " + color,
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          {heroIcon(28)}
        </div>
      )}
    </div>
  );
}
function ComparisonValue({
  value,
  ratio,
  color,
  line,
  right = false,
}: {
  value: string;
  ratio?: number;
  color: string;
  line: string;
  right?: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        minWidth: 0,
        height: 30,
        textAlign: right ? "right" : "left",
      }}
    >
      <span
        style={{
          fontFamily: display,
          fontWeight: 700,
          fontSize: 21,
          lineHeight: "23px",
          color,
        }}
      >
        {value}
      </span>
      {ratio !== undefined && (
        <div
          data-comparison-track
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 6,
            background: line + "80",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            data-comparison-bar
            data-ratio={ratio}
            style={{
              position: "absolute",
              height: "100%",
              width: `${ratio * 100}%`,
              ...(right ? { left: 0 } : { right: 0 }),
              background: color + "b0",
              borderRadius: 2,
            }}
          />
        </div>
      )}
    </div>
  );
}
function HeroArt({ p, style }: { p: PlayerData; style?: React.CSSProperties }) {
  const photo = useContext(PlayerVisualContext);
  const image = photo ? p.playerImage : p.image;
  const artwork = photo ? p.playerArtwork : p.artwork;
  // Mask the image before the outer filter draws its glow. Applying both to
  // the image clips the glow at the rectangular mask bounds.
  const { maskImage, ...frameStyle } = style || {};
  return (
    <div
      data-player-art
      style={{
        width: 700,
        height: 660,
        overflow: "visible",
        ...frameStyle,
      }}
    >
      {image || artwork ? (
        <Img
          data-hero-art
          data-player-photo={photo || undefined}
          src={asset(artwork || image!)}
          style={{
            display: "block",
            width: "100%",
            // Keep a photo's mask on its actual bottom edge, including square
            // headshots that do not fill the taller artwork frame.
            height: photo ? "auto" : "100%",
            maxHeight: "100%",
            objectFit: artwork || photo ? "contain" : "cover",
            objectPosition: photo ? "center top" : "center",
            maskImage,
          }}
        />
      ) : photo ? (
        <PlayerPlaceholder name={p.name} inVideo style={{ maskImage }} />
      ) : (
        <div
          data-hero-art
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            maskImage,
          }}
        >
          <div
            style={{
              fontFamily: display,
              fontSize: 148,
              fontWeight: 900,
              color: "#e9d9b5",
              textShadow: "0 0 60px #f6c45344",
            }}
          >
            {teamInitials(p.name)}
          </div>
        </div>
      )}
    </div>
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
        fontFamily: display,
        letterSpacing: 1.5,
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
          fontFamily: heading,
          fontWeight: 900,
          marginTop: 12,
          letterSpacing: 1,
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
                fontFamily: display,
                fontSize: fitDisplay(winner, 250, 30),
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
  const op = enter(f, 0, 32);
  return (
    <AbsoluteFill>
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
          {gameTitle(m)} · POST MATCH
          {m.series
            ? " · SERIES RECAP"
            : m.game === "lol" && m.gameNumber
              ? " · GAME " + m.gameNumber
              : ""}
        </Tag>
        <div
          style={{
            fontFamily: heading,
            fontSize: fitDisplay(s.headline, 1190, 67),
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
          top: 282,
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
                  ? `系列赛比分 · ${m.series.games.length} 局`
                  : `${m.cs ? "回合" : "击杀"} · ${matchDuration(m.duration)}`}
              </div>
            </div>
          ) : (
            (() => {
              const side = i === 0 ? "radiant" : "dire";
              const color = i === 0 ? s.accent : s.secondary;
              const winner = m.winner === side;
              const logo = m[`${side}Logo`];
              return (
                <div key={i} style={{ zIndex: 1 }}>
                  <div
                    data-team-logo={side}
                    style={{
                      width: 260,
                      height: 148,
                      margin: "0 auto 12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: op,
                      transform: `translateY(${(1 - op) * 24}px)`,
                      filter: `drop-shadow(0 0 28px ${color}35)`,
                    }}
                  >
                    {logo ? (
                      <Img
                        src={asset(logo)}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                          filter: "drop-shadow(0 0 1px #ffffffb0)",
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          ...digits,
                          fontSize: 90,
                          color,
                          letterSpacing: 0,
                        }}
                      >
                        {teamInitials(m[side])}
                      </span>
                    )}
                  </div>
                  <Tag color={color}>
                    {m.series || m.cs
                      ? "TEAM"
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
                      fontFamily: display,
                      fontSize: fitDisplay(m[side], 450, 44),
                      fontWeight: 900,
                      margin: "10px 0 14px",
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
                      ? `${m.series.wins[side]} WIN${m.series.wins[side] === 1 ? "" : "S"}`
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
                    {m.cs || s.playerVisual === "photo" ? (
                      <Portrait p={player} width={142} height={80} />
                    ) : (
                      <Img
                        src={asset(player.image)}
                        style={{
                          width: "100%",
                          height: 80,
                          objectFit: "cover",
                          borderBottom: "3px solid " + teamColor(player, s),
                        }}
                      />
                    )}
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
        {m.cs && csMapIcon(m.cs.map) && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: -10,
            }}
          >
            <Img
              src={asset(csMapIcon(m.cs.map)!)}
              style={{ width: 48, height: 48, objectFit: "contain" }}
            />
            {m.cs.map.toUpperCase()}
          </span>
        )}
        <span style={{ fontFamily: mono }}>{m.date.slice(0, 10)}</span>
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
        <StatLabel label="经济走势" size={46} color="#e5ba63" />
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
        <Tag color={p.dim}>
          <StatIcon
            label="总经济"
            size={22}
            color={s.accent}
            style={{ verticalAlign: "middle", marginRight: 10 }}
          />
          {m.radiant} · 最大领先
        </Tag>
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
        <Tag color={p.dim}>
          <StatIcon
            label="总经济"
            size={22}
            color={s.secondary}
            style={{ verticalAlign: "middle", marginRight: 10 }}
          />
          {m.dire} · 最大领先
        </Tag>
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
        <Tag color={p.dim}>
          {f.final.minute.toFixed(0)} 分钟 ·{" "}
          <StatLabel label="经济差" color="#e5ba63" />
        </Tag>
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
            <StatIcon
              label={label}
              size={25}
              color={p.dim}
              x={x - 12.5}
              y={y - 62}
            />
            <text
              x={x}
              y={y - 8}
              data-stat-label
              fill={p.dim}
              fontFamily={font}
              fontSize="24"
              fontWeight="700"
            >
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
        资源对比
      </Title>
      <div style={{ position: "absolute", left: 100, right: 100, top: 290 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 220px 1fr",
            alignItems: "center",
            gap: 30,
            fontWeight: 900,
            marginBottom: 22,
          }}
        >
          {(["radiant", null, "dire"] as const).map((side) => {
            if (!side)
              return (
                <span
                  key="scope"
                  style={{ fontSize: 20, color: p.dim, textAlign: "center" }}
                >
                  {m.series ? `${m.series.games.length} 局合计` : gameScope(m)}
                </span>
              );
            const left = side === "radiant";
            const logo = m[`${side}Logo`];
            const color = left ? s.accent : s.secondary;
            return (
              <div
                key={side}
                style={{
                  display: "flex",
                  flexDirection: left ? "row" : "row-reverse",
                  alignItems: "center",
                  gap: 20,
                  minWidth: 0,
                  color,
                  textAlign: left ? "left" : "right",
                }}
              >
                <div
                  data-team-logo={side}
                  style={{
                    width: 64,
                    height: 64,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {logo ? (
                    <Img
                      src={asset(logo)}
                      alt={`${m[side]} 队标`}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        filter: "drop-shadow(0 0 1px #ffffffb0)",
                      }}
                    />
                  ) : (
                    <span style={{ ...digits, fontSize: 22 }}>
                      {teamInitials(m[side])}
                    </span>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: display,
                      fontSize: fitDisplay(m[side], 600, 36),
                      lineHeight: 1.15,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {m[side]}
                  </div>
                  <div style={{ fontSize: 14, letterSpacing: 2, marginTop: 8 }}>
                    {m.series ? "TEAM" : left ? "BLUE" : "RED"}
                  </div>
                </div>
              </div>
            );
          })}
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
                  fontFamily: font,
                  fontWeight: 700,
                  fontSize: 26,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 13,
                }}
              >
                <StatIcon
                  label={item.label}
                  size={36}
                  color={
                    item.label === "总经济"
                      ? "#e5ba63"
                      : item.label === "小龙"
                        ? "#72d4bf"
                        : item.label === "大龙"
                          ? "#bc9bea"
                          : "#93bddd"
                  }
                  style={{ flexShrink: 0 }}
                />
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
  const kda = `${player.kills} / ${player.deaths} / ${player.assists}`;
  const shares = playerShares(m, player);
  const inventory =
    !m.series && m.game !== "cs2" ? player.inventory : undefined;
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
          {m.cs ? "02" : "03"} /{" "}
          {comparison.rank
            ? "K / D / A RANK " + comparison.rank
            : comparison.position
              ? m.cs
                ? "ROLE DUEL"
                : m.game === "lol"
                  ? ["TOP", "JUNGLE", "MID", "BOT", "SUPPORT"][
                      comparison.position - 1
                    ]
                  : "POSITION " + String(comparison.position).padStart(2, "0")
              : "DAMAGE DUEL"}
        </Tag>
        <span style={{ fontSize: 26, fontWeight: 700, color: p.ink }}>
          {comparison.label}
          {comparison.position ? "对位" : ""}
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
        {[focus[0].name, focus[1].name, "正面对比"].map((name, i) => (
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
              fontFamily: display,
              fontWeight: 700,
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
              left: 1415,
              top: 211,
              width: 420,
              height: m.series ? 360 : 270,
              opacity: 0.94,
              filter:
                s.effects === "arena"
                  ? "drop-shadow(0 0 25px " + color + "80)"
                  : undefined,
              transform: "translateX(" + (1 - enter(local, 0, 36)) * 65 + "px)",
              maskImage: "linear-gradient(to bottom,#000 88%,transparent 100%)",
            }}
          />
          <div
            data-player-identity
            style={{ position: "absolute", left: 1105, width: 280, top: 236 }}
          >
            <div
              style={{
                color,
                fontFamily: display,
                fontSize: fitDisplay(m[player.side], 280, 20),
                fontWeight: 700,
                lineHeight: 1.4,
                overflowWrap: "anywhere",
              }}
            >
              {m[player.side]}
            </div>
            <div
              data-player-name
              style={{
                ...digits,
                fontSize: fit(player.name, 250, 64),
                marginTop: 20,
                lineHeight: 1.2,
                overflowWrap: "anywhere",
                textShadow:
                  s.effects === "arena"
                    ? "0 0 18px " + color + "aa, 0 0 60px " + color + "70"
                    : "0 0 35px " + color + "70",
              }}
            >
              {player.name}
            </div>
            <div
              style={{
                fontSize: 20,
                lineHeight: 1.5,
                color: p.dim,
                marginTop: 18,
                overflowWrap: "anywhere",
              }}
            >
              {player.hero}
            </div>
            {player.champions && (
              <div
                style={{
                  marginTop: 30,
                  display: "grid",
                  gridTemplateColumns: `repeat(${player.champions.length > 6 ? 3 : 2}, minmax(0, 1fr))`,
                  gap: "14px 10px",
                }}
              >
                {player.champions.map((c) => (
                  <div
                    key={c.hero}
                    style={{
                      minWidth: 0,
                      display: "flex",
                      gap: 7,
                      alignItems: "center",
                    }}
                  >
                    <Img
                      src={asset(c.image)}
                      style={{
                        width: player.champions!.length > 6 ? 26 : 38,
                        height: player.champions!.length > 6 ? 26 : 38,
                        objectFit: "cover",
                        flexShrink: 0,
                      }}
                    />
                    <div
                      style={{
                        minWidth: 0,
                        fontSize: 13,
                        lineHeight: 1.4,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {c.hero}
                      <div style={{ color: p.dim }}>×{c.games}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {!m.series && m.game === "lol" && (
            <div
              style={{ position: "absolute", left: 1105, right: 85, top: 488 }}
            >
              <Loadout player={player} palette={p} />
            </div>
          )}
          {inventory && (
            <div
              style={{ position: "absolute", left: 1105, right: 85, top: 530 }}
            >
              <Inventory inventory={inventory} palette={p} />
            </div>
          )}
          <div
            data-player-stats
            style={{
              position: "absolute",
              top: 622,
              left: 1105,
              right: 85,
              boxSizing: "border-box",
              background:
                "linear-gradient(90deg," + p.bg + "f0," + p.bg + "66)",
              padding: "14px 26px 16px",
              borderTop: "2px solid " + color,
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
              columnGap: 28,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <Tag color={p.dim}>
                <span
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  <StatIcon label="击杀" size={21} />K /{" "}
                  <StatIcon label="死亡" size={21} />D /{" "}
                  <StatIcon label="助攻" size={21} />A
                </span>
              </Tag>
              <div
                data-player-kda
                style={{
                  fontFamily: display,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  fontSize: fitDisplay(kda, 300, 42),
                  lineHeight: "50px",
                  whiteSpace: "nowrap",
                  marginTop: 12,
                }}
              >
                {player.kills}
                <span style={{ color: p.dim }}> / {player.deaths} / </span>
                {player.assists}
              </div>
            </div>
            <div
              style={{
                minWidth: 0,
                borderLeft: "1px solid " + p.line,
                paddingLeft: 28,
              }}
            >
              <Tag color={p.dim}>
                {support
                  ? m.game === "lol"
                    ? "参团率"
                    : "参战率"
                  : "伤害占比"}
              </Tag>
              <div
                style={{
                  ...digits,
                  color,
                  fontSize: 46,
                  lineHeight: "50px",
                  marginTop: 12,
                }}
              >
                {support
                  ? axisValue(participation(m, player), "%")
                  : axisValue(shares.damage, "%")}
              </div>
            </div>
          </div>
          <div
            style={{ position: "absolute", top: 750, left: 1105, right: 85 }}
          >
            <FullStats match={m} player={player} palette={p} />
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
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}
          >
            {focus.map((pl) => (
              <div
                key={pl.slot}
                data-player-comparison
                style={{
                  minWidth: 0,
                  borderTop: "3px solid " + teamColor(pl, s),
                  paddingTop: 15,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <ComparisonPortrait
                    player={pl}
                    game={m.game}
                    color={teamColor(pl, s)}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: display,
                        fontWeight: 900,
                        fontSize: fit(pl.name, 230, 29),
                        color: teamColor(pl, s),
                      }}
                    >
                      {pl.name}
                    </div>
                    {pl.champions && (
                      <div style={{ fontSize: 16, color: p.dim, marginTop: 6 }}>
                        {pl.hero}
                      </div>
                    )}
                  </div>
                </div>
                {!m.series && m.game === "lol" && (
                  <div style={{ marginTop: 14 }}>
                    <Loadout player={pl} palette={p} compact />
                  </div>
                )}
                {!m.series && m.game !== "cs2" && pl.inventory && (
                  <div style={{ marginTop: 14 }}>
                    <Inventory
                      inventory={pl.inventory}
                      palette={p}
                      compact
                      narrow
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div
            data-full-comparison
            style={{ marginTop: 22, borderTop: "1px solid " + p.line }}
          >
            {comparisonStats(m, focus).map((stat) => (
              <div
                key={stat.label}
                data-comparison-stats
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0,1fr) 150px minmax(0,1fr)",
                  alignItems: "center",
                  minHeight: 31,
                  borderBottom: "1px solid " + p.line + "70",
                }}
              >
                <ComparisonValue
                  value={stat.a}
                  ratio={stat.bars?.a}
                  color={s.accent}
                  line={p.line}
                />
                <span
                  data-stat-label
                  style={{ fontSize: 20, textAlign: "center", color: p.dim }}
                >
                  {stat.label}
                </span>
                <ComparisonValue
                  value={stat.b}
                  ratio={stat.bars?.b}
                  color={s.secondary}
                  line={p.line}
                  right
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
}
function Damage(props: Ctx) {
  const { match: m, settings: s } = props;
  const p = palettes[s.theme],
    frame = useCurrentFrame(),
    ranking = rankedPlayers(m),
    portraitCandidates = ranking.filter((player) => {
      if (m.game === "cs2") return true;
      const assigned = assignedPositions(m, s).find(
        (entry) => entry.player.slot === player.slot,
      );
      return !isSupport(m, assigned?.position);
    }),
    trailing = props.index === 5,
    players = trailing ? ranking.slice(-5) : ranking.slice(0, 5),
    leader = trailing
      ? (portraitCandidates.at(-1) ?? players.at(-1))
      : players[0];
  if (!leader) return <AbsoluteFill />;
  const color = teamColor(leader, s);
  return (
    <AbsoluteFill>
      <Title
        en={
          m.cs
            ? "03 / FRAG LEADERS"
            : trailing
              ? "05 / DAMAGE RANKING"
              : "04 / DAMAGE LEADERS"
        }
        props={props}
      >
        {m.cs ? "击杀排行" : trailing ? "伤害后五" : "伤害前五"}
      </Title>
      <HeroArt
        p={leader}
        style={{
          position: "absolute",
          left: 85,
          top: 258,
          width: 610,
          height: 410,
          opacity: 0.94,
          maskImage: "linear-gradient(to bottom,#000 88%,transparent 100%)",
        }}
      />
      <div
        data-damage-identity
        data-damage-leader-slot={leader.slot}
        style={{ position: "absolute", top: 690, left: 85, width: 610 }}
      >
        <Tag color={color}>
          {m.cs
            ? "全场击杀第一"
            : trailing
              ? "本场伤害"
              : m.series
                ? "系列赛伤害第一"
                : "全场伤害第一"}
        </Tag>
        <div
          style={{
            ...digits,
            fontSize: fit(leader.name, 600, 64),
            margin: "14px 0 18px",
          }}
        >
          {leader.name}
        </div>
        <div style={{ ...digits, fontSize: 76, color }}>
          {m.cs
            ? `${leader.kills} / ${leader.deaths} / ${leader.assists}`
            : num(leader.damage)}
        </div>
        <div style={{ fontSize: 20, color: p.dim, marginTop: 16 }}>
          {m[leader.side]} · {m.cs ? "K / D / A" : leader.hero}
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
          <span>
            {trailing ? "BOTTOM 5" : "TOP 5"} /{" "}
            {m.cs ? "击杀" : m.series ? "总伤害" : "英雄伤害"}
          </span>
          <span>
            {m.cs
              ? "K / D / A"
              : m.game === "lol"
                ? "CHAMPION DAMAGE"
                : "HERO DAMAGE"}
          </span>
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
                {String(ranking.indexOf(pl) + 1).padStart(2, "0")}
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
                      fontFamily: display,
                      fontSize: fitDisplay(pl.name, 400, 26),
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
                    {m.cs
                      ? `${num(pl.kills * progress)} / ${pl.deaths} / ${pl.assists}`
                      : num(pl.damage * progress)}
                  </span>
                </div>
                <div style={{ height: 8, background: p.line }}>
                  <div
                    style={{
                      height: "100%",
                      width:
                        (m.cs
                          ? ranking[0].kills
                            ? (pl.kills / ranking[0].kills) * progress * 100
                            : 0
                          : ranking[0].damage
                            ? (pl.damage / ranking[0].damage) * progress * 100
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
      </div>
    </AbsoluteFill>
  );
}
function MvpScene(props: Ctx) {
  const { match: m, settings: s } = props;
  const selection = mvpFor(m, s);
  if (!selection) return <AbsoluteFill />;
  const p = palettes[s.theme];
  const { player, kind } = selection;
  const color = teamColor(player, s);
  const label =
    kind === "official"
      ? `官方 MVP · ${selection.sourceName}`
      : kind === "manual"
        ? "手动选择"
        : "伤害最高";
  const shares = playerShares(m, player);
  return (
    <AbsoluteFill>
      <Title en="06 / MATCH MVP" props={props}>
        本局 MVP
      </Title>
      <div
        style={{
          position: "absolute",
          left: 84,
          top: 252,
          width: 710,
          height: 650,
          overflow: "visible",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -22,
            left: 0,
            fontFamily: display,
            fontWeight: 900,
            fontSize: 290,
            lineHeight: 1,
            color: color + "12",
            letterSpacing: 4,
          }}
        >
          MVP
        </div>
        <HeroArt
          p={player}
          style={{
            position: "absolute",
            left: 30,
            top: 50,
            width: 680,
            height: 570,
            opacity: 0.98,
            filter: "drop-shadow(0 0 34px " + color + "55)",
            maskImage: "linear-gradient(to bottom,#000 84%,transparent 100%)",
          }}
        />
      </div>
      <div
        data-mvp-identity
        style={{ position: "absolute", left: 900, right: 88, top: 292 }}
      >
        <Tag color={color}>{label}</Tag>
        <div
          data-mvp-name
          style={{
            ...digits,
            fontSize: fitDisplay(player.name, 860, 92),
            marginTop: 18,
            whiteSpace: "nowrap",
          }}
        >
          {player.name}
        </div>
        <div style={{ color: p.dim, fontSize: 26, marginTop: 14 }}>
          {m[player.side]} · {player.hero}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 22,
            marginTop: 70,
          }}
        >
          {[
            {
              label: "K / D / A",
              value: `${player.kills} / ${player.deaths} / ${player.assists}`,
            },
            {
              label: m.series ? "总伤害" : "英雄伤害",
              value: num(player.damage),
            },
            {
              label: "伤害占比",
              value: axisValue(shares.damage, "%"),
            },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{ borderTop: "2px solid " + color, paddingTop: 15 }}
            >
              <Tag color={p.dim}>{stat.label}</Tag>
              <div
                style={{
                  ...digits,
                  color,
                  fontSize: fitDisplay(stat.value, 220, 36),
                  marginTop: 11,
                  whiteSpace: "nowrap",
                }}
              >
                {stat.value}
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 58,
            paddingTop: 22,
            borderTop: "1px solid " + p.line,
          }}
        >
          <FullStats match={m} player={player} palette={p} />
        </div>
        {!m.series && m.game === "lol" && (
          <div style={{ marginTop: 28 }}>
            <Loadout player={player} palette={p} />
          </div>
        )}
        {!m.series && m.game !== "cs2" && player.inventory && (
          <div style={{ marginTop: 28 }}>
            <Inventory inventory={player.inventory} palette={p} compact />
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}
function Outro(props: Ctx) {
  const { match: m, settings: s } = props;
  const p = palettes[s.theme],
    f = facts(m),
    focus = getFocus(m),
    winnerPlayer = m.cs
      ? rankedPlayers(m).find((p) => p.side === m.winner)!
      : m.winner
        ? focus[m.winner === "radiant" ? 0 : 1]
        : f.top,
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
          letterSpacing: 0,
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
        <Tag color={color}>{m.series ? "系列赛战报" : "WINNER / 获胜战队"}</Tag>
        <div
          style={{
            fontFamily: display,
            fontSize: fitDisplay(
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
              m.cs ? "回合比分" : m.series ? "总击杀" : "击杀",
              m.radiantScore + " : " + m.direScore,
            ],
            [
              m.cs ? "最多击杀" : "最高伤害",
              m.cs ? String(f.top.kills) : compact(f.top.damage),
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <Tag color={p.dim}>
                <StatLabel label={label} color={color} />
              </Tag>
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
        <span style={{ fontFamily: mono }}>{m.date.slice(0, 10)}</span>
      </div>
    </AbsoluteFill>
  );
}
function FilmScene(props: Ctx) {
  const frame = useCurrentFrame();
  const length =
    props.segments.find(
      (segment, index) => (segment.sceneIndex ?? index) === props.index,
    )?.frames ?? 0;
  const opacity = Math.min(
    enter(frame, 0, 10),
    interpolate(frame, [length - 8, length - 1], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const Component =
    {
      0: Intro,
      1: props.match.game === "lol" ? TeamResources : Economy,
      2: RadarScene,
      3: Damage,
      4: Outro,
      5: Damage,
      6: MvpScene,
    }[props.index] ?? Outro;
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
      document.fonts.load(
        '400 54px "ZCOOL QingKe HuangYou"',
        "资源对比赛后雷达",
      ),
    ])
      .then(() => continueRender(fontHandle))
      .catch(cancelRender);
  }, [fontHandle]);
  const frame = useCurrentFrame();
  const { segments } = props;
  const total = totalFrames(segments);
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
  const segment = segments[index];
  const chapter = props.chapters?.[segment.chapterIndex ?? 0];
  const local = chapter ?? props;
  const { match: m, settings: s } = local;
  const p = palettes[s.theme];
  const sceneIndex = segment.sceneIndex ?? index;
  const slots = chapter?.slots ?? sceneSlots(m, s);
  const scope =
    chapter?.key === "opening"
      ? "完整战报"
      : m.series
        ? "系列赛累计"
        : gameScope(m);
  const gameResult =
    chapter && !m.series && m.winner
      ? ` · ${m[m.winner]} 胜 · ${m.winner === "radiant" ? m.radiantScore : m.direScore} : ${m.winner === "radiant" ? m.direScore : m.radiantScore} · ${matchDuration(m.duration)}`
      : "";
  const caption = props.captions.find((c) => frame >= c.start && frame < c.end);
  return (
    <PlayerVisualContext.Provider
      value={m.game === "cs2" || s.playerVisual === "photo"}
    >
      <AbsoluteFill
        data-match-film
        data-film-chapter={chapter?.key}
        data-film-match={m.id}
        data-film-scene={sceneIndex}
        style={{ fontFamily: font, color: p.ink, overflow: "hidden" }}
      >
        <style>{`
          @font-face {
            font-family: "ZCOOL QingKe HuangYou";
            src: url("${asset("assets/fonts/zcool-qingke-huangyou.woff2")}") format("woff2");
            font-style: normal;
            font-weight: 100 900;
            font-display: block;
          }
        `}</style>
        <Background {...local} />
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
        {segments.map(
          (seg, i) =>
            seg.frames > 0 && (
              <Sequence key={i} from={starts[i]} durationInFrames={seg.frames}>
                <FilmScene
                  {...(props.chapters?.[seg.chapterIndex ?? 0] ?? props)}
                  index={seg.sceneIndex ?? i}
                />
              </Sequence>
            ),
        )}
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
            <span
              style={{
                fontFamily: display,
                fontWeight: 900,
                fontSize: 25,
                letterSpacing: 2,
              }}
            >
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
              {gameTitle(m)}
            </span>
          </div>
          <span
            data-film-scope
            style={{
              fontSize: fit(m.league + scope + gameResult, 820, 20),
              color: p.dim,
            }}
          >
            {m.league}
            <span style={{ marginLeft: 26, color: s.accent }}>
              {scope}
              {gameResult}
            </span>
          </span>
        </div>
        {s.captions && caption && (
          <div
            data-film-caption
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
            {gameScope(m)}
            {m.date ? " · " + m.date.slice(0, 10) : ""}
          </span>
          <div style={{ display: "flex", gap: 25 }}>
            {slots.map((slot, i) => (
              <span
                key={slot}
                style={{
                  color: slot === sceneIndex ? p.ink : p.dim,
                  opacity: slot === sceneIndex ? 1 : 0.55,
                }}
              >
                <span
                  style={{
                    color: slot === sceneIndex ? s.accent : undefined,
                    fontFamily: mono,
                    marginRight: 8,
                  }}
                >
                  0{i + 1}
                </span>
                {sceneNames(m, s)[sceneSlots(m, s).indexOf(slot)]}
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
    </PlayerVisualContext.Provider>
  );
}
