import { Composition, Folder } from "remotion";
import { GoRemoteTeaser } from "./GoRemoteTeaser";
import { DURATIONS, TOTAL } from "./timeline";
import { FlowScene } from "./scenes/FlowScene";
import { HandoffScene } from "./scenes/HandoffScene";
import { PairScene } from "./scenes/PairScene";
import { SessionScene } from "./scenes/SessionScene";
import { MontageScene } from "./scenes/MontageScene";
import { LocalScene } from "./scenes/LocalScene";
import { BrandScene } from "./scenes/BrandScene";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="GoRemoteTeaser" component={GoRemoteTeaser} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
      <Folder name="Scenes">
        <Composition id="Flow" component={FlowScene} durationInFrames={DURATIONS.flow} fps={30} width={1920} height={1080} />
        <Composition id="Handoff" component={HandoffScene} durationInFrames={DURATIONS.handoff} fps={30} width={1920} height={1080} />
        <Composition id="Pair" component={PairScene} durationInFrames={DURATIONS.pair} fps={30} width={1920} height={1080} />
        <Composition id="Session" component={SessionScene} durationInFrames={DURATIONS.session} fps={30} width={1920} height={1080} />
        <Composition id="Montage" component={MontageScene} durationInFrames={DURATIONS.montage} fps={30} width={1920} height={1080} />
        <Composition id="Local" component={LocalScene} durationInFrames={DURATIONS.local} fps={30} width={1920} height={1080} />
        <Composition id="Brand" component={BrandScene} durationInFrames={DURATIONS.brand} fps={30} width={1920} height={1080} />
      </Folder>
    </>
  );
};
