import { Img, staticFile } from "remotion";
import {
  AmbientBackground,
  AnimatedCursor,
  BrowserFrame,
  Caption,
} from "../components";
import { appConfig } from "../app-config";

/** Real dashboard — operational memory in the live product. */
export const S2_Memory: React.FC = () => {
  const { brand } = appConfig;

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      dir="rtl"
    >
      <AmbientBackground brand={brand} variant="medium" />
      <div className="relative z-10" style={{ marginBottom: 72 }}>
        <BrowserFrame url="app.bino / dashboard" delay={4} scale={0.78}>
          <div style={{ width: 1440, height: 900, position: "relative" }}>
            <Img
              src={staticFile("real/dashboard.png")}
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
            { frame: 35, x: 920, y: 260 },
            { frame: 70, x: 780, y: 380, click: true },
            { frame: 115, x: 980, y: 520 },
            { frame: 155, x: 860, y: 580, click: true },
          ]}
        />
      </div>
      <Caption
        text="היסטוריה ← שיפוט שניתן לשימוש מחדש"
        delay={10}
        maxWidth={1200}
        fontSize={38}
      />
    </div>
  );
};
