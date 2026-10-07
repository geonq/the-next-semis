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
  float t = uTime * 0.16;

  vec2 warped = p;
  warped += 0.20 * vec2(
    sin(p.y * 3.2 + t * 1.5),
    cos(p.x * 2.6 - t * 1.2)
  );

  float broad = fbm(warped * 2.2 + vec2(t * 0.40, -t * 0.22));
  float detail = fbm(warped * 4.4 + vec2(-t * 0.30, t * 0.26));
  float sweep = 0.5 + 0.5 * sin(
    p.x * 2.2 - p.y * 3.2 + broad * 2.8 + t * 1.6
  );

  // Wispy organic wave filaments emerging out of the void
  float cloud = pow(smoothstep(0.58, 0.88, broad), 2.4);
  float ribbon = pow(smoothstep(0.70, 0.95, sweep) * smoothstep(0.36, 0.85, detail), 2.0);
  float pulse = 0.65 + 0.35 * sin(t * 1.8 + detail * 4.0);
  float falloff = 0.70 + 0.30 * smoothstep(0.0, 0.80, 1.0 - length(p));

  // Wave mask: 0 over ~80% of canvas, leaving vast majority strictly black / white
  float waveMask = clamp(0.28 * cloud + 0.72 * ribbon * pulse, 0.0, 1.0) * falloff * uReveal;

  // Shared signature blue waves (from geonq personal site & brand palette)
  vec3 subtleNavy = vec3(0.012, 0.045, 0.11);
  vec3 subtleOcean = vec3(0.035, 0.14, 0.29);
  vec3 subtleCrest = vec3(0.065, 0.24, 0.48);

  // --- Dark Mode: Pure pitch-black void (#000000) with subtle blue wave filaments ---
  vec3 darkWave = mix(subtleNavy, mix(subtleOcean, subtleCrest, sweep), ribbon);
  vec3 darkBase = vec3(0.0, 0.0, 0.0);
  vec3 darkColor = darkBase + darkWave * waveMask;
  darkColor += vec3(0.015, 0.05, 0.10) * (waveMask * pow(max(detail - 0.42, 0.0), 2.0));

  // --- Light Mode: Pure white base (#ffffff) with the same blue waves ---
  vec3 lightBase = vec3(1.0, 1.0, 1.0);
  vec3 brandAccent = vec3(0.01, 0.30, 0.75);
  vec3 lightWave = mix(darkWave * 2.2, brandAccent, sweep * 0.4);

  vec3 lightColor = mix(lightBase, lightWave, clamp(waveMask * 0.75, 0.0, 1.0));
  lightColor = mix(lightColor, brandAccent, clamp(waveMask * pow(max(detail - 0.42, 0.0), 2.0) * 0.5, 0.0, 1.0));

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
        ? "radial-gradient(ellipse at 68% 30%, rgba(184, 212, 247, 0.45), transparent 48%), #ffffff"
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
