import type { CSSProperties } from "react";
import { Img, staticFile } from "remotion";

// LPL's published missing-player silhouette, bundled for offline rendering.
// Keep its transparent outline; only lift the black slightly for dark themes.
export function PlayerPlaceholder({
  name,
  compact = false,
  inVideo = false,
  style,
}: {
  name: string;
  compact?: boolean;
  inVideo?: boolean;
  style?: CSSProperties;
}) {
  const Image = inVideo ? Img : "img";
  return (
    <Image
      data-player-placeholder
      src={staticFile("assets/placeholders/player.png")}
      alt={`${name}：暂无选手照片`}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "contain",
        objectPosition: compact ? "center" : "center bottom",
        filter: "brightness(0) invert(0.28)",
        ...style,
      }}
    />
  );
}
