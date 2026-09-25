import { Img, staticFile } from "remotion";
import {
  AmbientBackground,
  AnimatedCursor,
  BrowserFrame,
  Caption,
} from "../components";
import { appConfig } from "../app-config";

/** Building ops memory — learn from ticket history. */
export const S2_Memory: React.FC = () => {
  const { brand } = appConfig;

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      dir="rtl"
    >
      <AmbientBackground brand={brand} variant="medium" />
      <div className="relative z-10" style={{ marginBottom: 72 }}>
        <BrowserFrame url="bino.app/dashboard" delay={4} scale={0.82}>
          <div style={{ width: 1440, height: 810, position: "relative" }}>
            <Img
              src={staticFile("ops-memory.png")}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "top center",
              }}
            />
            <div
              style={{
                position: "absolute",
                insetInlineStart: 28,
                top: 24,
                padding: "10px 16px",
                borderRadius: 10,
                background: "rgba(11,18,32,0.88)",
                color: "#fff",
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              זיכרון תפעולי · הרצל 12
            </div>
          </div>
        </BrowserFrame>
        <AnimatedCursor
          keyframes={[
            { frame: 40, x: 980, y: 220 },
            { frame: 75, x: 720, y: 340, click: true },
            { frame: 120, x: 860, y: 480 },
            { frame: 160, x: 640, y: 520, click: true },
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
