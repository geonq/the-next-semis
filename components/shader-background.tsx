"use client";

import { useEffect, useRef } from "react";

const VERTEX_SHADER_SOURCE = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uReveal;
uniform float uTheme; // 1.0 = dark, 0.0 = light
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p = p * 2.02 + vec2(17.1, 9.2);
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float t = uTime * 0.06;

  vec2 warped = p;
  warped += 0.11 * vec2(
    sin(p.y * 3.4 + t * 1.3),
    cos(p.x * 2.8 - t * 0.9)
  );

  float broad = fbm(warped * 2.3 + vec2(t * 0.72, -t * 0.34));
  float detail = fbm(warped * 4.6 + vec2(-t * 0.42, t * 0.24));
  float sweep = 0.5 + 0.5 * sin(
    p.x * 2.25 - p.y * 3.6 + broad * 2.4 + t * 1.8
  );
  float ribbon = smoothstep(0.62, 0.9, sweep) * smoothstep(0.26, 0.9, detail);
  float cloud = smoothstep(0.43, 0.82, broad);
  float pulse = 0.58 + 0.42 * sin(t * 1.25 + detail * 5.0);
  float falloff = 0.72 + 0.28 * smoothstep(0.0, 0.75, 1.0 - length(p));

  // --- Dark Mode ---
  // Blank canvas is strictly #000000 (RGB: 0, 0, 0)
  vec3 darkBase = vec3(0.0, 0.0, 0.0);
  vec3 darkNavy = vec3(0.027, 0.094, 0.169);  // #07182b (ShaderGradient deep navy)
  vec3 darkOcean = vec3(0.118, 0.435, 0.663); // #1e6fa9 (ShaderGradient vibrant ocean)
  vec3 darkBrand = vec3(0.015, 0.35, 0.82);   // #0253c4 (The Next Semis brand accent)

  float darkIntensity = uReveal * falloff * (0.35 * cloud + 0.60 * ribbon * pulse);
  vec3 darkWave = mix(darkNavy * 2.0, mix(darkOcean, darkBrand, sweep), clamp(ribbon * 1.5, 0.0, 1.0));
  vec3 darkColor = darkBase + darkWave * darkIntensity;
  darkColor += vec3(0.03, 0.12, 0.28) * (uReveal * pow(max(detail - 0.38, 0.0), 1.6));
  darkColor += vec3(0.003, 0.006, 0.012) * noise(vUv * uResolution * 0.24 + uTime * 0.018);

  // --- Light Mode ---
  // Blank canvas is #f0f6ff
  vec3 lightBase = vec3(0.941, 0.965, 1.0);
  vec3 lightAzure = vec3(0.855, 0.914, 0.988);   // #dbebfc (soft azure wave)
  vec3 lightCerulean = vec3(0.722, 0.831, 0.969);// #b8d4f7 (cerulean ribbon stream)

  float lightIntensity = uReveal * falloff * (0.45 * cloud + 0.55 * ribbon * pulse);
  vec3 lightWave = mix(lightAzure, lightCerulean, sweep);
  vec3 lightColor = mix(lightBase, lightWave, clamp(lightIntensity * 0.75, 0.0, 1.0));
  lightColor -= vec3(0.012, 0.016, 0.024) * (uReveal * pow(max(detail - 0.40, 0.0), 1.6));

  vec3 finalColor = mix(lightColor, darkColor, uTheme);
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
  if (!vertexShader || !fragmentShader) {
    if (vertexShader) gl.deleteShader(vertexShader);
    if (fragmentShader) gl.deleteShader(fragmentShader);
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

export function ShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl =
      canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        powerPreference: "low-power",
        premultipliedAlpha: false,
        stencil: false
      }) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);

    const applyFallback = () => {
      const isLight = document.documentElement.dataset.theme === "light";
      canvas.style.background = isLight
        ? "radial-gradient(ellipse at 68% 30%, rgba(184, 212, 247, 0.45), transparent 48%), #f0f6ff"
        : "radial-gradient(ellipse at 68% 30%, rgba(2, 83, 196, 0.25), transparent 48%), radial-gradient(ellipse at 22% 76%, rgba(7, 24, 43, 0.4), transparent 52%), #000000";
    };

    if (!gl) {
      applyFallback();
      return;
    }

    const program = createProgram(gl);
    if (!program) {
      applyFallback();
      return;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const positionLoc = gl.getAttribLocation(program, "aPosition");
    const resolutionLoc = gl.getUniformLocation(program, "uResolution");
    const timeLoc = gl.getUniformLocation(program, "uTime");
    const revealLoc = gl.getUniformLocation(program, "uReveal");
    const themeLoc = gl.getUniformLocation(program, "uTheme");

    let animationFrameId = 0;
    let isDisposed = false;
    const startedAt = performance.now();

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let prefersReducedMotion = motionQuery.matches;

    let targetTheme = document.documentElement.dataset.theme === "light" ? 0.0 : 1.0;
    let currentTheme = targetTheme;

    function resize() {
      if (!canvas || !gl) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.floor(window.innerWidth * dpr));
      const height = Math.max(1, Math.floor(window.innerHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    }

    function render(now: number) {
      if (isDisposed || !gl || !program || !canvas) return;
      resize();

      let elapsed: number;
      let revealAmount: number;

      if (prefersReducedMotion) {
        elapsed = 10.0;
        revealAmount = 1.0;
      } else {
        elapsed = Math.max(0, (now - startedAt) / 1000);
        revealAmount = Math.max(0, Math.min(1, elapsed / 1.2));
        revealAmount = revealAmount * revealAmount * (3.0 - 2.0 * revealAmount);
      }

      const themeDiff = targetTheme - currentTheme;
      if (Math.abs(themeDiff) > 0.001) {
        currentTheme += themeDiff * 0.08;
      } else {
        currentTheme = targetTheme;
      }

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(positionLoc);
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

      gl.uniform2f(resolutionLoc, canvas.width, canvas.height);
      gl.uniform1f(timeLoc, elapsed);
      gl.uniform1f(revealLoc, revealAmount);
      gl.uniform1f(themeLoc, currentTheme);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      const isThemeTransitioning = Math.abs(targetTheme - currentTheme) > 0.001;

      if ((!prefersReducedMotion || isThemeTransitioning) && !document.hidden) {
        animationFrameId = requestAnimationFrame(render);
      }
    }

    const themeObserver = new MutationObserver(() => {
      const isLight = document.documentElement.dataset.theme === "light";
      targetTheme = isLight ? 0.0 : 1.0;
      if (prefersReducedMotion) {
        currentTheme = targetTheme;
      }
      if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(render);
      }
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"]
    });

    function onVisibilityChange() {
      if (document.hidden) {
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = 0;
        }
      } else if (!prefersReducedMotion && !animationFrameId) {
        animationFrameId = requestAnimationFrame(render);
      }
    }

    function onMotionChange(e: MediaQueryListEvent) {
      prefersReducedMotion = e.matches;
      if (prefersReducedMotion) {
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = 0;
        }
        render(performance.now());
      } else if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(render);
      }
    }

    function onContextLost(e: Event) {
      e.preventDefault();
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
      }
    }

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibilityChange);
    motionQuery.addEventListener("change", onMotionChange);
    canvas.addEventListener("webglcontextlost", onContextLost);

    resize();
    animationFrameId = requestAnimationFrame(render);

    return () => {
      isDisposed = true;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      themeObserver.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      motionQuery.removeEventListener("change", onMotionChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);

      if (gl) {
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
      }
    };
  }, []);

  return (
    <div className="shader-background" aria-hidden="true" role="presentation">
      <canvas ref={canvasRef} aria-hidden="true" tabIndex={-1} />
    </div>
  );
}
