import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { SceneWrap } from "./components";
import { appConfig } from "./app-config";
import { S1_Hook } from "./scenes/S1_Hook";
import { S2_Memory } from "./scenes/S2_Memory";
import { S3_Assign } from "./scenes/S3_Assign";
import { S4_Proof } from "./scenes/S4_Proof";
import { S5_CTA } from "./scenes/S5_CTA";

const scenes = [
  { component: S1_Hook, duration: 150 }, // 5s
  { component: S2_Memory, duration: 240 }, // 8s
  { component: S3_Assign, duration: 240 }, // 8s
  { component: S4_Proof, duration: 210 }, // 7s
  { component: S5_CTA, duration: 150 }, // 5s
] as const;

export const TOTAL_DURATION = scenes.reduce((sum, s) => sum + s.duration, 0);

export const ProductDemo: React.FC = () => {
  let offset = 0;
  return (
    <AbsoluteFill style={{ background: "#0B1220" }}>
      {appConfig.video.backgroundMusic && (
        <Audio
          src={staticFile(appConfig.video.backgroundMusic)}
          volume={appConfig.video.backgroundMusicVolume ?? 0.3}
        />
      )}
      {scenes.map(({ component: Scene, duration }, i) => {
        const from = offset;
        offset += duration;
        const isFirst = i === 0;
        const isLast = i === scenes.length - 1;
        return (
          <Sequence key={i} from={from} durationInFrames={duration}>
            <SceneWrap
              durationInFrames={duration}
              fadeIn={!isFirst}
              fadeOut={!isLast}
            >
              <Scene />
            </SceneWrap>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
