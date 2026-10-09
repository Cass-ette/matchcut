import type { CSSProperties } from "react";

// Transparent vectors keep the silhouette crisp at 4K and let artwork glows
// follow the person instead of lighting up a rectangular image boundary.
export function PlayerPlaceholder({
  name,
  compact = false,
  style,
}: {
  name: string;
  compact?: boolean;
  style?: CSSProperties;
}) {
  return (
    <svg
      data-player-placeholder
      role="img"
      aria-label={`${name}：暂无选手照片`}
      viewBox={compact ? "0 0 320 245" : "0 0 320 360"}
      fill="none"
      style={{ display: "block", width: "100%", height: "100%", ...style }}
    >
      <path
        d="M130 151h60v33l59 24c19 8 30 22 34 44l15 108H22l15-108c4-22 15-36 34-44l59-24z"
        fill="#19212d"
        stroke="#536174"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="m113 191 47 31 47-31-17-7h-60z"
        fill="#0c1119"
        stroke="#536174"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M105 91c-4-44 17-67 55-67s59 23 55 67l-4 43c-3 28-24 47-51 47s-48-19-51-47z"
        fill="#111720"
        stroke="#536174"
        strokeWidth="2"
      />
      <path
        d="M144 88c0-11 7-18 18-18 10 0 17 6 17 16 0 15-19 17-19 30"
        stroke="#a9b5c7"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <circle cx="160" cy="138" r="5" fill="#a9b5c7" />
      <path
        d="m84 248-8 110m160-110 8 110"
        stroke="#344153"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
