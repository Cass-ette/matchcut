import React from "react";
import {
  Bomb,
  Castle,
  Coins,
  Crosshair,
  Eye,
  EyeOff,
  Flag,
  Handshake,
  HeartPulse,
  Radar,
  ShieldCheck,
  Skull,
  Sparkles,
  Sprout,
  Swords,
  Target,
  Timer,
  Trophy,
  Users,
  Zap,
} from "lucide-react";

// Decorative vectors stay sharp in previews and at every export resolution.
// Labels remain visible; unfamiliar objective silhouettes never replace text.
const metrics = {
  总经济: Coins,
  分均经济: Coins,
  经济差: Coins,
  经济走势: Coins,
  摧毁防御塔: Castle,
  建筑伤害: Castle,
  击杀: Swords,
  总击杀: Swords,
  最多击杀: Swords,
  助攻: Handshake,
  死亡: Skull,
  伤害: Zap,
  最高伤害: Zap,
  分均伤害: Zap,
  ADR: Zap,
  分均经验: Sparkles,
  分均补刀: Sprout,
  参团率: Users,
  参战率: Users,
  视野得分: Eye,
  插眼: Eye,
  观察守卫: Eye,
  排眼: EyeOff,
  真眼购买: Radar,
  岗哨守卫: Radar,
  眩晕时长: Timer,
  英雄治疗: HeartPulse,
  KAST: ShieldCheck,
  爆头率: Crosshair,
  首杀: Target,
  道具伤害: Bomb,
  比赛用时: Timer,
  回合比分: Flag,
  系列赛比分: Trophy,
} as const;

export function StatIcon({
  label,
  size = 24,
  color = "currentColor",
  ...props
}: {
  label: string;
  size?: number;
  color?: string;
} & React.SVGProps<SVGSVGElement>) {
  const shared = {
    width: size,
    height: size,
    color,
    "aria-hidden": true as const,
    focusable: false,
    "data-stat-icon": label,
    ...props,
  };
  if (label === "小龙" || label === "大龙") {
    const dragon = label === "小龙";
    return (
      <svg
        {...shared}
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {dragon ? (
          <>
            <path
              d="M22 4 19 10 25 13 28 18 22 20 19 27 11 28 5 23 9 18 5 12 12 14 14 8 18 10Z"
              fill="currentColor"
              fillOpacity=".13"
            />
            <path d="m12 14 6 2 4 4M9 18l5 3-3 7m11-8 5-2M14 8l-1-5 6 7" />
            <path d="m21 14 2 1" strokeWidth="2.6" />
          </>
        ) : (
          <>
            <path
              d="m6 4 5 6 5-7 5 7 5-6-2 12 3 6-7 6h-8l-7-6 3-6Z"
              fill="currentColor"
              fillOpacity=".13"
            />
            <path d="m10 14 3 2m9-2-3 2M9 21l4 3 3-3 3 3 4-3m-10 3 1 5m5-5-1 5M16 10v6" />
          </>
        )}
      </svg>
    );
  }
  const Icon = metrics[label as keyof typeof metrics];
  return Icon ? <Icon {...shared} strokeWidth={1.75} /> : null;
}

export function StatLabel({
  label,
  size = 22,
  color,
}: {
  label: string;
  size?: number;
  color?: string;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
      <StatIcon
        label={label}
        size={size}
        color={color}
        style={{ flexShrink: 0 }}
      />
      <span>{label}</span>
    </span>
  );
}
