import React from "react";
import { Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { bgmDisplayText, type BgmTrack, type Settings } from "../domain";

export function MusicBadge({
  track,
  settings,
  color,
  ink,
  muted,
  opacity,
}: {
  track: BgmTrack;
  settings: NonNullable<Settings["bgm"]>;
  color: string;
  ink: string;
  muted: string;
  opacity: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { title, artist } = bgmDisplayText(track, settings);
  return (
    <div
      data-bgm-badge
      style={{
        display: "flex",
        alignItems: "center",
        gap: 13,
        width: 400,
        minWidth: 180,
        flexShrink: 1,
        letterSpacing: 0,
        opacity,
      }}
    >
      <div
        data-bgm-record
        style={{
          position: "relative",
          width: 58,
          height: 58,
          flexShrink: 0,
          borderRadius: "50%",
          overflow: "hidden",
          border: "1px solid #ffffff30",
          background:
            "repeating-radial-gradient(circle, #11141b 0px, #11141b 2px, #292d35 3px, #11141b 4px)",
          transform: `rotate(${(frame / fps / 12) * 360}deg)`,
        }}
      >
        {track.cover ? (
          <Img
            src={staticFile(track.cover.replace(/^\//, ""))}
            style={{
              position: "absolute",
              inset: 5,
              width: 46,
              height: 46,
              objectFit: "cover",
              borderRadius: "50%",
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 17,
              borderRadius: "50%",
              background: color,
              border: "3px solid #ffffff25",
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background:
              "conic-gradient(from 30deg, transparent 0deg, #ffffff25 55deg, transparent 95deg, transparent 180deg, #ffffff18 230deg, transparent 270deg)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 25,
            top: 25,
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#090c12",
            boxShadow: "0 0 0 2px #ffffff70",
          }}
        />
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          data-bgm-title
          style={{
            color: ink,
            fontSize: 19,
            fontWeight: 700,
            lineHeight: "25px",
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>
        <div
          style={{
            color: muted,
            fontSize: 14,
            lineHeight: "21px",
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
        >
          <span style={{ color, fontSize: 11, letterSpacing: 2 }}>BGM</span>
          {artist && <span style={{ marginLeft: 10 }}>{artist}</span>}
        </div>
      </div>
    </div>
  );
}
