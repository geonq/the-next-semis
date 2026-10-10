"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const ShaderGradientCanvas = dynamic(
  () => import("@shadergradient/react").then((mod) => mod.ShaderGradientCanvas),
  { ssr: false }
);

const ShaderGradient = dynamic(
  () => import("@shadergradient/react").then((mod) => mod.ShaderGradient),
  { ssr: false }
);

export function ShaderBackground() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const updateTheme = () => {
      const isLight = document.documentElement.dataset.theme === "light";
      setTheme(isLight ? "light" : "dark");
    };
    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  const isLight = theme === "light";

  return (
    <div className="shader-background" aria-hidden="true" role="presentation">
      {mounted ? (
        <ShaderGradientCanvas
          lazyLoad={false}
          pixelDensity={1}
          pointerEvents="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        >
          <ShaderGradient
            control="props"
            shader="defaults"
            type="plane"
            animate="on"
            uSpeed={0.06}
            uStrength={0.45}
            uDensity={0.6}
            uFrequency={3.5}
            uAmplitude={0.18}
            positionX={0}
            positionY={0}
            positionZ={0}
            rotationX={0}
            rotationY={0}
            rotationZ={0}
            cAzimuthAngle={180}
            cPolarAngle={90}
            cDistance={2.8}
            cameraZoom={1}
            color1={isLight ? "#ffffff" : "#000000"}
            color2={isLight ? "#dbeaff" : "#3b82f6"}
            color3={isLight ? "#ffffff" : "#000000"}
            brightness={isLight ? 1.05 : 0.95}
            grain="off"
            lightType="3d"
            envPreset="city"
            reflection={0.1}
            wireframe={false}
          />
        </ShaderGradientCanvas>
      ) : null}
    </div>
  );
}
