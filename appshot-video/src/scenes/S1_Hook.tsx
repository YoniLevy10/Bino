import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AmbientBackground, AppIcon, Caption } from "../components";
import { appConfig } from "../app-config";

/** Hook: not another ticketing system — operational memory. */
export const S1_Hook: React.FC = () => {
  const { brand } = appConfig;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Visible at frame 0 (thumbnail rule) — spring only for subtle lift, not fade-from-black
  const lift = spring({
    frame,
    fps,
    delay: 0,
    config: { mass: 0.8, damping: 14, stiffness: 120 },
  });
  const sub = spring({
    frame,
    fps,
    delay: 8,
    config: { mass: 0.8, damping: 14, stiffness: 100 },
  });
  const subOpacity = interpolate(sub, [0, 1], [0.35, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      dir="rtl"
    >
      <AmbientBackground brand={brand} variant="dark" />
      <div
        className="relative z-10 flex flex-col items-center gap-8"
        style={{
          opacity: 1,
          transform: `translateY(${(1 - lift) * 18}px)`,
        }}
      >
        <AppIcon
          src={appConfig.app.icon}
          size={88}
          glow
          glowColor={`${brand.primary}66`}
        />
        <div
          style={{
            width: 980,
            padding: "36px 48px",
            borderRadius: 20,
            background: "rgba(11, 18, 32, 0.92)",
            border: "1px solid rgba(255,255,255,0.12)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 52,
              fontWeight: 800,
              color: "#FFFFFF",
              letterSpacing: "-0.02em",
              lineHeight: 1.25,
            }}
          >
            לא עוד מערכת תקלות.
          </div>
          <div
            style={{
              marginTop: 18,
              fontSize: 28,
              fontWeight: 500,
              color: "rgba(255,255,255,0.72)",
              opacity: subOpacity,
              transform: `translateY(${(1 - sub) * 10}px)`,
            }}
          >
            BINO בונה זיכרון תפעולי חכם לכל בניין.
          </div>
        </div>
      </div>
      <Caption
        text="לומדת. מחליטה. מוכיחה חיסכון."
        delay={14}
        maxWidth={1200}
        fontSize={40}
      />
    </div>
  );
};
