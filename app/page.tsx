"use client";

import { useEffect, useRef, useState } from "react";
import LiquidChrome from "./components/LiquidChrome";

const PALETTES = ["mercury", "ember", "glacier", "amethyst"];

export default function Page() {
  const [palette, setPalette] = useState(0);
  const [hintVisible, setHintVisible] = useState(true);
  const hasInteracted = useRef(false);

  useEffect(() => {
    function dismissHint() {
      if (hasInteracted.current) return;
      hasInteracted.current = true;
      setHintVisible(false);
    }
    window.addEventListener("pointermove", dismissHint, { once: true });
    window.addEventListener("pointerdown", dismissHint, { once: true });
    const t = setTimeout(dismissHint, 5000);
    return () => clearTimeout(t);
  }, []);

  return (
    <main style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <LiquidChrome paletteIndex={palette} />

      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "clamp(20px, 4vw, 48px)",
          pointerEvents: "none",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
          color: "#fff",
          mixBlendMode: "difference",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(18px, 2.4vw, 26px)",
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            Liquid Chrome
          </h1>
          <span style={{ fontSize: 12, opacity: 0.7, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Dodo Payments
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              opacity: hintVisible ? 0.75 : 0,
              transition: "opacity 0.8s ease",
              maxWidth: 260,
              lineHeight: 1.5,
            }}
          >
            Move to stir the surface. Click and hold to pull. Click a swatch to change the metal.
          </p>

          <div style={{ display: "flex", gap: 10, pointerEvents: "auto" }}>
            {PALETTES.map((name, i) => (
              <button
                key={name}
                onClick={() => setPalette(i)}
                aria-label={`Switch to ${name} palette`}
                title={name}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  border: palette === i ? "2px solid #fff" : "1px solid rgba(255,255,255,0.4)",
                  background: "transparent",
                  cursor: "pointer",
                  padding: 0,
                  transform: palette === i ? "scale(1.25)" : "scale(1)",
                  transition: "transform 0.25s ease, border 0.25s ease",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
