import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AmbientBackground, Caption } from "../components";
import { appConfig } from "../app-config";

const METRICS = [
  { label: "זמן עד שיוך", value: "12 דק׳", delta: "−75%" },
  { label: "זמן עד פתרון", value: "14 שעות", delta: "−61%" },
  { label: "תקלות חוזרות", value: "11%", delta: "מ־28%" },
  { label: "בלי התערבות מנהל", value: "67%", delta: "מ־22%" },
] as const;

/** Prove savings to the management company. */
export const S4_Proof: React.FC = () => {
  const { brand } = appConfig;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleEnter = spring({
    frame,
    fps,
    delay: 0,
    config: { mass: 0.8, damping: 14, stiffness: 120 },
  });

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden"
      dir="rtl"
    >
      <AmbientBackground brand={brand} variant="deep" />
      <div
        className="relative z-10 flex flex-col items-center gap-10"
        style={{ marginBottom: 80 }}
      >
        <div
          style={{
            opacity: titleEnter,
            transform: `translateY(${(1 - titleEnter) * 18}px)`,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 48,
              fontWeight: 800,
              color: brand.textPrimary,
              letterSpacing: "-0.02em",
            }}
          >
            מוכיחים כמה זמן וכסף נחסכו
          </div>
          <div
            style={{
              marginTop: 12,
              fontSize: 24,
              color: brand.textSecondary,
              fontWeight: 500,
            }}
          >
            מדדי כוכב צפוני לחברת הניהול · נתוני דוגמה
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 240px)",
            gap: 20,
          }}
        >
          {METRICS.map((m, i) => {
            const enter = spring({
              frame,
              fps,
              delay: 10 + i * 8,
              config: { mass: 0.9, damping: 14, stiffness: 110 },
            });
            const pulse = interpolate(
              Math.sin((frame + i * 12) * 0.06),
              [-1, 1],
              [0.98, 1.02],
            );
            return (
              <div
                key={m.label}
                style={{
                  opacity: enter,
                  transform: `translateY(${(1 - enter) * 28}px) scale(${pulse})`,
                  background: brand.surface,
                  borderRadius: 16,
                  padding: "28px 22px",
                  border: `1px solid rgba(11,18,32,0.08)`,
                  boxShadow: "0 12px 36px rgba(11,18,32,0.08)",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: brand.textSecondary,
                    marginBottom: 12,
                    minHeight: 40,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {m.label}
                </div>
                <div
                  style={{
                    fontSize: 40,
                    fontWeight: 800,
                    color: brand.primary,
                    letterSpacing: "-0.03em",
                  }}
                >
                  {m.value}
                </div>
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 16,
                    fontWeight: 700,
                    color: brand.success,
                  }}
                >
                  {m.delta}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <Caption
        text="67% מהתקלות — בלי מנהל"
        delay={20}
        maxWidth={1200}
        fontSize={40}
      />
    </div>
  );
};
