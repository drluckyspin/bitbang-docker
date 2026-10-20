/**
 * Scene 7: an intentionally generic comparison. A cloud-hosted agent needs a copy of the repo on a remote
 * server; go-remote's workspace and repo remain inside the developer's own Mac. No product is named.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { ease, progress } from "../lib/anim";
import { fonts, stage } from "../theme";
import { SCENES } from "../timeline";

const Folder: React.FC<{ color: string }> = ({ color }) => (
  <svg width={138} height={106} viewBox="0 0 138 106">
    <path d="M8 22a9 9 0 0 1 9-9h34l10 10h60a9 9 0 0 1 9 9v62a9 9 0 0 1-9 9H17a9 9 0 0 1-9-9Z" fill={color} opacity={0.85} />
    <path d="M8 41h122v53a9 9 0 0 1-9 9H17a9 9 0 0 1-9-9Z" fill="#A9D9FF" opacity={0.38} />
  </svg>
);

const Server: React.FC = () => (
  <svg width={164} height={150} viewBox="0 0 164 150">
    {[18, 58, 98].map((y) => (
      <g key={y}>
        <rect x={18} y={y} width={128} height={30} rx={8} fill="rgba(245,245,247,0.1)" stroke="rgba(245,245,247,0.42)" strokeWidth={2} />
        <circle cx={38} cy={y + 15} r={4} fill="#F4B04A" />
        <path d={`M54 ${y + 15}h54`} stroke="rgba(245,245,247,0.45)" strokeWidth={3} strokeLinecap="round" />
      </g>
    ))}
  </svg>
);

const LocalMac: React.FC = () => (
  <div style={{ width: 470, height: 288, borderRadius: 26, border: "2px dashed rgba(125,226,195,0.55)", background: "rgba(125,226,195,0.04)", position: "relative" }}>
    <div style={{ position: "absolute", left: 22, top: -15, padding: "5px 12px", borderRadius: 999, background: "#101114", fontSize: 18, fontWeight: 700 }}>Your Mac</div>
    <div style={{ position: "absolute", left: 48, top: 72, width: 138, height: 122, border: "2px solid rgba(125,226,195,0.85)", borderRadius: 18, display: "grid", placeItems: "center", color: stage.mint, fontSize: 40 }}>▢</div>
    <div style={{ position: "absolute", right: 48, top: 72 }}><Folder color="#4D9EEA" /></div>
    <div style={{ position: "absolute", left: 40, right: 40, bottom: 26, textAlign: "center", fontSize: 22, color: "rgba(245,245,247,0.74)" }}>container + repo stay here</div>
  </div>
);

export const ContrastScene: React.FC = () => {
  const frame = useCurrentFrame();
  const cloud = progress(frame, 12, 28, ease.out);
  const local = progress(frame, 72, 28, ease.out);
  const strike = progress(frame, 128, 20, ease.inOut);
  return (
    <AbsoluteFill>
      <Backdrop at={SCENES.contrast.from} />
      <div style={{ position: "absolute", left: 100, top: 310, width: 820, opacity: cloud, translate: `${(1 - cloud) * -50}px 0`, fontFamily: fonts.sans }}>
        <div style={{ color: "rgba(245,245,247,0.62)", fontSize: 26, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 42 }}>Cloud agents</div>
        <div style={{ display: "flex", alignItems: "center", gap: 64 }}>
          <Folder color="#637991" />
          <div style={{ fontSize: 70, color: "rgba(245,245,247,0.45)" }}>→</div>
          <Server />
        </div>
        <div style={{ marginTop: 34, fontSize: 32, color: "rgba(245,245,247,0.72)" }}>Your repo, on someone else&apos;s servers</div>
        <div style={{ position: "absolute", left: 0, top: 96, width: 630, height: 5, background: stage.coral, rotate: `${-8 * strike}deg`, transformOrigin: "0 50%", opacity: strike }} />
      </div>
      <div style={{ position: "absolute", right: 90, top: 310, width: 560, opacity: local, translate: `${(1 - local) * 50}px 0`, fontFamily: fonts.sans }}>
        <div style={{ color: stage.mint, fontSize: 26, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 42 }}>Go Remote</div>
        <LocalMac />
      </div>
    </AbsoluteFill>
  );
};
