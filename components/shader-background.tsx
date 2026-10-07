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

// Quintic-interpolated smooth 3D noise (zero facet artifacts)
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  // Quintic Hermite interpolant for C2 continuity
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

  return mix(
    mix(
      mix(hash3(i + vec3(0.0, 0.0, 0.0)), hash3(i + vec3(1.0, 0.0, 0.0)), u.x),
      mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), u.x),
      u.y
    ),
    mix(
      mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), u.x),
      mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), u.x),
      u.y
    ),
    u.z
  );
}

float fbm3(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise3(p);
    p = p * 2.04 + vec3(1.3, 2.7, 4.1);
    a *= 0.5;
  }
  return v;
}

void main() {
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float t = uTime * 0.15;

  // Sphere center: gently offset on desktop to frame the hero layout, centered on mobile
  vec2 center = vec2(aspect > 1.2 ? 0.08 * aspect : 0.0, 0.0);
  vec2 sp = p - center;
  float dist = length(sp);

  // Large, unmistakable 3D sphere: radius 0.38 (76% of viewport height)
  float baseRadius = 0.38;

  // Gentle organic boundary breathing
  float angle = atan(sp.y, sp.x);
  float boundaryWobble = 0.010 * sin(angle * 3.0 + t * 0.8)
                       + 0.006 * cos(angle * 5.0 - t * 0.6);
  float effectiveRadius = baseRadius + boundaryWobble;

  // Soft anti-aliased edge mask: outside the sphere silhouette is strictly 0.0
  float sphereMask = smoothstep(effectiveRadius + 0.015, effectiveRadius - 0.015, dist);

  // --- 3D Spherical Geometry ---
  float normDist = clamp(dist / effectiveRadius, 0.0, 1.0);
  float z = sqrt(max(1.0 - normDist * normDist, 0.0));
  vec2 dir = dist > 0.0001 ? (sp / dist) : vec2(0.0);
  vec3 normal = normalize(vec3(dir * normDist, z));

  // Rotate surface coordinates in 3D around Y and tilted X axis
  float rotY = t * 0.26;
  vec3 rotN;
  rotN.x = normal.x * cos(rotY) - normal.z * sin(rotY);
  rotN.y = normal.y;
  rotN.z = normal.x * sin(rotY) + normal.z * cos(rotY);

  float tiltX = 0.36;
  vec3 tiltedN;
  tiltedN.x = rotN.x;
  tiltedN.y = rotN.y * cos(tiltX) - rotN.z * sin(tiltX);
  tiltedN.z = rotN.y * sin(tiltX) + rotN.z * cos(tiltX);

  // Domain-warped 3D flow across the curved sphere surface (butter-smooth)
  vec3 sphereCoord = tiltedN * 1.5;
  vec3 warp = vec3(
    fbm3(sphereCoord + vec3(t * 0.10, 0.0, 0.0)),
    fbm3(sphereCoord + vec3(0.0, t * 0.12, 1.4)),
    fbm3(sphereCoord + vec3(1.2, 0.0, -t * 0.08))
  );
  float fluid = fbm3(sphereCoord + warp * 0.45 + vec3(0.0, -t * 0.16, t * 0.12));

  // --- 3D Physical Lighting ---
  vec3 lightDir = normalize(vec3(0.55, 0.65, 0.80));
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfDir = normalize(lightDir + viewDir);

  float diff = max(dot(normal, lightDir), 0.0);
  float ambient = 0.36;
  float lighting = ambient + (1.0 - ambient) * diff;

  float spec = pow(max(dot(normal, halfDir), 0.0), 28.0);
  float fresnel = pow(1.0 - max(normal.z, 0.0), 2.5);

  // --- Palette: Authentic ShaderGradient Blues ---
  vec3 deepNavy = vec3(0.027, 0.094, 0.169);  // #07182b
  vec3 oceanBlue = vec3(0.118, 0.435, 0.663); // #1e6fa9
  vec3 brandBlue = vec3(0.008, 0.325, 0.769); // #0253c4
  vec3 crestAzure = vec3(0.26, 0.62, 0.98);   // #429efa

  // Gradient surface mix
  vec3 surfaceColor = mix(deepNavy, oceanBlue, smoothstep(0.20, 0.58, fluid));
  surfaceColor = mix(surfaceColor, brandBlue, smoothstep(0.46, 0.84, fluid));
  surfaceColor = mix(surfaceColor, crestAzure, smoothstep(0.74, 1.0, fluid) * 0.45);

  // --- Dark Mode: Pure pitch-black canvas (#000000) + glowing 3D sphere ---
  vec3 litSphereDark = surfaceColor * lighting;
  litSphereDark += crestAzure * (spec * 0.40);
  litSphereDark += oceanBlue * (fresnel * 0.48);

  vec3 darkBase = vec3(0.0, 0.0, 0.0);
  vec3 darkColor = mix(darkBase, litSphereDark, sphereMask * uReveal);

  // --- Light Mode: Pure white canvas (#ffffff) + same signature blue 3D sphere ---
  vec3 lightBase = vec3(1.0, 1.0, 1.0);
  vec3 litSphereLight = mix(
    vec3(0.90, 0.95, 1.0),
    mix(oceanBlue, brandBlue, smoothstep(0.30, 0.75, fluid)),
    smoothstep(0.12, 0.68, fluid)
  );
  litSphereLight = mix(litSphereLight, deepNavy, smoothstep(0.68, 0.95, fluid) * 0.45);
  litSphereLight = litSphereLight * (0.62 + 0.38 * diff);
  litSphereLight += vec3(0.40, 0.70, 1.0) * (spec * 0.35);
  litSphereLight += oceanBlue * (fresnel * 0.35);

  vec3 lightColor = mix(lightBase, litSphereLight, sphereMask * uReveal);

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
