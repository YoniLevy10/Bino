import { Img, staticFile } from "remotion";
import {
  AmbientBackground,
  AnimatedCursor,
  BrowserFrame,
  Caption,
} from "../components";
import { appConfig } from "../app-config";

/** Real summary — prove ops performance from live system. */
export const S4_Proof: React.FC = () => {
  const { brand } = appConfig;

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      dir="rtl"
    >
      <AmbientBackground brand={brand} variant="deep" />
      <div className="relative z-10" style={{ marginBottom: 72 }}>
        <BrowserFrame url="app.bino / summary" delay={3} scale={0.78}>
          <div style={{ width: 1440, height: 900, position: "relative" }}>
            <Img
              src={staticFile("real/summary.png")}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "top center",
              }}
            />
          </div>
        </BrowserFrame>
        <AnimatedCursor
          keyframes={[
            { frame: 35, x: 700, y: 280 },
            { frame: 75, x: 880, y: 360, click: true },
            { frame: 120, x: 760, y: 480 },
            { frame: 160, x: 960, y: 540, click: true },
          ]}
        />
      </div>
      <Caption
        text="67% מהתקלות — בלי מנהל"
        delay={12}
        maxWidth={1200}
        fontSize={40}
      />
    </div>
  );
};
