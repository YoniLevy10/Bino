import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import {
  AmbientBackground,
  AnimatedCursor,
  BrowserFrame,
  Caption,
} from "../components";
import { appConfig } from "../app-config";

/** Real ticket drawer — assign worker from live OpsBrain demo. */
export const S3_Assign: React.FC = () => {
  const { brand } = appConfig;
  const frame = useCurrentFrame();
  const badge = interpolate(frame, [90, 110], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      dir="rtl"
    >
      <AmbientBackground brand={brand} variant="light" />
      <div className="relative z-10" style={{ marginBottom: 72 }}>
        <BrowserFrame url="app.bino / tickets" delay={3} scale={0.78}>
          <div style={{ width: 1440, height: 900, position: "relative" }}>
            <Img
              src={staticFile("real/ticket-detail.png")}
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
                insetInlineStart: 48,
                bottom: 56,
                opacity: badge,
                transform: `translateY(${(1 - badge) * 16}px)`,
                padding: "14px 22px",
                borderRadius: 12,
                background: brand.primary,
                color: "#fff",
                fontSize: 18,
                fontWeight: 700,
                boxShadow: "0 12px 32px rgba(0,102,255,0.35)",
              }}
            >
              שויך: יוסי תחזוקה · תקלה #201
            </div>
          </div>
        </BrowserFrame>
        <AnimatedCursor
          keyframes={[
            { frame: 30, x: 1080, y: 240 },
            { frame: 65, x: 1180, y: 420, click: true },
            { frame: 105, x: 1180, y: 500 },
            { frame: 145, x: 1120, y: 720, click: true },
          ]}
        />
      </div>
      <Caption
        text="שיוך חכם — מ־48 דק׳ ל־12"
        delay={8}
        maxWidth={1200}
        fontSize={40}
      />
    </div>
  );
};
