/**
 * Scene 3: the phone rises in front of the laptop, its camera finds the QR code, and one tap pairs it over
 * BitBang. The link draws from the container to the phone and herdr's chat opens, still empty: the session
 * scene pours the conversation into it.
 */
import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Beam } from "../components/Connection";
import { Phone, PhoneAt, type PhonePose } from "../components/Phone";
import { CameraScreen, ConnectScreen, HerdrChatScreen } from "../components/screens";
import { ClaudeMark } from "../components/herdr";
import { Workspace } from "../components/Workspace";
import { PROJECT } from "../data/session";
import { Camera } from "../lib/motion";
import { cameraAt, ease, keyframed, progress, springAt, type Cam } from "../lib/anim";
import { HERO_PHONE, PAIR_CAMERA, containerOnScreen, phoneLinkPoint } from "../layout";
import { DURATIONS, SCENES, sinceHandoff } from "../timeline";
import { LaptopAt } from "./HandoffScene";

const END = DURATIONS.pair - 1;

const camKeys: ReadonlyArray<readonly [number, Cam]> = [
  [0, { x: 1080, y: 645, s: 1.18 }],
  [36, PAIR_CAMERA],
  [END, { ...PAIR_CAMERA, x: PAIR_CAMERA.x + 12 }],
];

const phoneKeys: ReadonlyArray<readonly [number, PhonePose]> = [
  [0, { x: 1580, y: 1560, s: 0.94, r: -14 }],
  [6, { x: 1580, y: 1560, s: 0.94, r: -14 }],
  [36, { x: 1436, y: 612, s: 0.94, r: -6 }],
  [72, { x: 1430, y: 606, s: 0.94, r: -5 }],
  [102, HERO_PHONE],
  [END, HERO_PHONE],
];

export const P = { lock: 40, pill: 46, tap: 58, connect: 64, beam: 68, paired: 86, chat: 100 };

export const PairScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cam = cameraAt(frame, camKeys);
  const pose = keyframed(frame, phoneKeys);
  const previous = keyframed(frame - 1, phoneKeys);

  const lock = springAt(frame, fps, P.lock, { damping: 14, stiffness: 170 });
  const pill = springAt(frame, fps, P.pill, { damping: 16 });
  const tap = frame >= P.tap ? Math.sin(Math.min(1, (frame - P.tap) / 8) * Math.PI) : 0;
  const toConnect = progress(frame, P.connect, 6);
  const paired = springAt(frame, fps, P.paired, { damping: 14 });
  const toChat = progress(frame, P.chat, 8);
  const beamDraw = progress(frame, P.beam, 26, ease.inOut);

  const container = containerOnScreen(cam);
  const phoneEdge = phoneLinkPoint(pose);

  return (
    <AbsoluteFill>
      <Backdrop at={SCENES.pair.from} />
      <Camera cam={cam} previous={cameraAt(frame - 1, camKeys)}>
        <LaptopAt>
          <Sequence from={-sinceHandoff("pair")} layout="none">
            <Workspace />
          </Sequence>
        </LaptopAt>
      </Camera>
      {beamDraw > 0 ? <Beam from={container} to={phoneEdge} lift={190} draw={beamDraw} frame={frame} /> : null}
      <PhoneAt pose={pose} previous={previous}>
        <Phone statusBar="light" homeIndicator={frame < P.chat ? "light" : "dark"}>
          {toChat < 1 ? (
            <div style={{ position: "absolute", inset: 0, opacity: 1 - toChat }}>
              {toConnect < 1 ? (
                <div style={{ position: "absolute", inset: 0, opacity: 1 - toConnect }}>
                  <CameraScreen frame={frame} lock={lock} pill={pill} tap={tap} title={`${PROJECT}.png`} />
                </div>
              ) : null}
              {toConnect > 0 ? (
                <div style={{ position: "absolute", inset: 0, opacity: toConnect }}>
                  <ConnectScreen frame={frame} paired={paired} />
                </div>
              ) : null}
            </div>
          ) : null}
          {toChat > 0 ? (
            <div style={{ position: "absolute", inset: 0, opacity: toChat, scale: String(0.98 + toChat * 0.02) }}>
              <HerdrChatScreen
                frame={frame}
                items={[]}
                title="Rate limit the upload API"
                composer=""
                caret={false}
                mark={<ClaudeMark size={20} />}
              />
            </div>
          ) : null}
        </Phone>
      </PhoneAt>
    </AbsoluteFill>
  );
};
