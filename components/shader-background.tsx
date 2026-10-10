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
            {...{
              type: "waterPlane",
              shader: "defaults",
              animate: "on",
              uSpeed: 0.05,
              uStrength: 1.2,
              uDensity: 1.2,
              uFrequency: 0,
              uAmplitude: 0,
              positionX: 0,
              positionY: 0,
              positionZ: 0,
              rotationX: 45,
              rotationY: 0,
              rotationZ: -45,
              cAzimuthAngle: 180,
              cPolarAngle: 80,
              cDistance: 3.6,
              cameraZoom: 1,
              color1: isLight ? "#ffffff" : "#000000",
              color2: isLight ? "#bfdbfe" : "#60a5fa",
              color3: isLight ? "#ffffff" : "#000000",
              brightness: isLight ? 1.05 : 0.8,
              grain: "off",
              lightType: "3d",
              envPreset: "city",
              reflection: 0.1,
              wireframe: false,
            }}
          />
        </ShaderGradientCanvas>
      ) : null}
    </div>
  );
}
