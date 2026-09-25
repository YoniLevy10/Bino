import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AmbientBackground, AppIcon, Caption } from "../components";
import { appConfig } from "../app-config";

/** Closing CTA — WhatsApp demo booking. */
export const S5_CTA: React.FC = () => {
  const { brand } = appConfig;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoEnter = spring({
    frame,
    fps,
    delay: 0,
    config: { mass: 0.8, damping: 14, stiffness: 120 },
  });
  const buttonEnter = spring({
    frame,
    fps,
    delay: 18,
    config: { mass: 1.1, damping: 14, stiffness: 90 },
  });
  const pulse = interpolate(Math.sin(frame * 0.08), [-1, 1], [0.96, 1.04]);

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden"
      dir="rtl"
    >
      <AmbientBackground brand={brand} variant="dark" />
      <div
        className="relative z-10 flex flex-col items-center gap-7"
        style={{
          opacity: logoEnter,
          transform: `translateY(${(1 - logoEnter) * 20}px)`,
          marginBottom: 48,
        }}
      >
        <AppIcon
          src={appConfig.app.icon}
          size={96}
          glow
          glowColor={`${brand.primary}55`}
        />
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: "#FFFFFF",
            letterSpacing: "0.04em",
          }}
        >
          BINO
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 500,
            color: "rgba(255,255,255,0.7)",
          }}
        >
          זיכרון תפעולי חכם לבניינים
        </div>
        <div
          style={{
            opacity: buttonEnter,
            transform: `scale(${pulse})`,
            marginTop: 12,
            padding: "18px 52px",
            borderRadius: 14,
            background: brand.primary,
            fontSize: 24,
            fontWeight: 700,
            color: "#FFFFFF",
            boxShadow: "0 16px 40px rgba(0,102,255,0.4)",
          }}
        >
          לתיאום הדגמה בוואטסאפ
        </div>
        <div
          style={{
            fontSize: 20,
            color: "rgba(255,255,255,0.55)",
            fontWeight: 500,
          }}
        >
          {appConfig.app.url}
        </div>
      </div>
      <Caption
        text="BINO — מחליטים, מונעים, מוכיחים"
        delay={28}
        maxWidth={1200}
        fontSize={38}
      />
    </div>
  );
};
