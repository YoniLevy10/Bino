import { Composition } from "remotion";
import { ProductDemo, TOTAL_DURATION } from "./ProductDemo";
import { appConfig } from "./app-config";
import "./styles.css";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="ProductDemo"
    component={ProductDemo}
    durationInFrames={TOTAL_DURATION}
    fps={appConfig.video.fps}
    width={appConfig.video.width}
    height={appConfig.video.height}
  />
);
