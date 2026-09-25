import { spring, useCurrentFrame, useVideoConfig } from "remotion";

export const Caption: React.FC<{
  text: string;
  delay?: number;
  fontSize?: number;
  maxWidth?: number;
  dir?: "ltr" | "rtl";
}> = ({ text, delay = 0, fontSize = 44, maxWidth = 820, dir = "rtl" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const containerEnter = spring({
    frame,
    fps,
    delay,
    config: { mass: 0.8, damping: 14, stiffness: 100 },
  });

  const words = text.split(" ");

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-50 flex justify-center pb-36"
      style={{
        opacity: containerEnter,
        transform: `translateY(${(1 - containerEnter) * 15}px)`,
      }}
    >
      <div
        className="rounded-2xl px-10 py-5"
        style={{
          background: "rgba(11, 18, 32, 0.88)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.12)",
          maxWidth,
        }}
      >
        <p
          className="text-center font-semibold leading-tight text-white"
          dir={dir}
          style={{ fontSize }}
        >
          {words.map((word, i) => {
            const wordEnter = spring({
              frame,
              fps,
              delay: delay + 3 + i * 1.5,
              config: { mass: 0.3, damping: 12, stiffness: 150 },
            });

            return (
              <span
                key={i}
                className="inline-block"
                style={{
                  opacity: wordEnter,
                  transform: `translateY(${(1 - wordEnter) * 8}px)`,
                  marginInlineEnd: "0.3em",
                }}
              >
                {word}
              </span>
            );
          })}
        </p>
      </div>
    </div>
  );
};
