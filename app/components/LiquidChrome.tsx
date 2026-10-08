"use client";

import { useEffect, useRef } from "react";

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;      // smoothed, normalized -1..1, aspect corrected
uniform vec2 u_mouseVel;   // smoothed velocity
uniform float u_pressure;  // 0..1, held pointer strength
uniform vec4 u_ripples[8]; // x, y (aspect corrected), startTime, active(1/0)
uniform float u_paletteIndex;
uniform float u_grainSeed;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * noise(p);
    p *= 2.02;
    amp *= 0.55;
  }
  return v;
}

vec3 palette(float t, float idx) {
  vec3 a, b, c, d;
  if (idx < 0.5) {
    a = vec3(0.55, 0.52, 0.5); b = vec3(0.45, 0.45, 0.45);
    c = vec3(1.0, 1.0, 1.0); d = vec3(0.0, 0.1, 0.2);
  } else if (idx < 1.5) {
    a = vec3(0.6, 0.3, 0.2); b = vec3(0.4, 0.3, 0.3);
    c = vec3(1.0, 0.8, 0.5); d = vec3(0.1, 0.3, 0.4);
  } else if (idx < 2.5) {
    a = vec3(0.1, 0.2, 0.3); b = vec3(0.3, 0.4, 0.5);
    c = vec3(0.6, 1.0, 0.9); d = vec3(0.3, 0.5, 0.6);
  } else {
    a = vec3(0.3, 0.1, 0.3); b = vec3(0.4, 0.2, 0.4);
    c = vec3(0.8, 0.6, 1.0); d = vec3(0.0, 0.2, 0.5);
  }
  return a + b * cos(6.28318 * (c * t + d));
}

void main() {
  vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
  float aspect = u_resolution.x / u_resolution.y;
  uv.x *= aspect;

  vec2 p = uv;

  // attraction / warp field around the cursor, liquid-metal pull
  vec2 toMouse = p - u_mouse;
  float dist = length(toMouse);
  float pull = (0.22 + u_pressure * 0.35) / (dist * dist + 0.05);
  vec2 warp = normalize(toMouse + 1e-5) * pull * 0.14;

  // velocity-based drag streaks
  warp += u_mouseVel * 0.6 * smoothstep(0.9, 0.0, dist);

  // ripples
  for (int i = 0; i < 8; i++) {
    vec4 r = u_ripples[i];
    if (r.w < 0.5) continue;
    float age = u_time - r.z;
    if (age < 0.0 || age > 2.4) continue;
    float d = length(p - r.xy);
    float ring = sin(d * 28.0 - age * 9.0) * exp(-age * 1.6) * exp(-d * 2.2);
    vec2 dir = normalize(p - r.xy + 1e-5);
    warp += dir * ring * 0.045;
  }

  vec2 flowP = p - warp;
  float n = fbm(flowP * 1.6 + vec2(0.0, u_time * 0.06));
  float n2 = fbm(flowP * 3.1 - vec2(u_time * 0.04, 0.0) + 4.2);
  float field = n * 0.65 + n2 * 0.35;

  // chromatic aberration near the cursor / fast motion
  float ab = smoothstep(0.9, 0.0, dist) * 0.012 + length(u_mouseVel) * 0.02;
  float rC = fbm((flowP + vec2(ab, 0.0)) * 1.6 + vec2(0.0, u_time * 0.06));
  float bC = fbm((flowP - vec2(ab, 0.0)) * 1.6 + vec2(0.0, u_time * 0.06));

  vec3 base = palette(field, u_paletteIndex);
  base.r = mix(base.r, palette(rC, u_paletteIndex).r, 0.9);
  base.b = mix(base.b, palette(bC, u_paletteIndex).b, 0.9);

  // specular sheen to sell the "liquid metal" feel
  float sheen = pow(max(0.0, 1.0 - abs(field - 0.6) * 3.2), 3.0);
  base += sheen * 0.35;

  // vignette
  float vig = smoothstep(1.35, 0.3, length(uv) / max(aspect, 1.0));
  base *= mix(0.55, 1.0, vig);

  // film grain / dither
  float grain = hash(gl_FragCoord.xy + u_grainSeed) - 0.5;
  base += grain * 0.035;

  gl_FragColor = vec4(base, 1.0);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "shader compile error");
  }
  return shader;
}

const RIPPLE_SLOTS = 8;

export default function LiquidChrome({ paletteIndex }: { paletteIndex: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paletteRef = useRef(paletteIndex);
  paletteRef.current = paletteIndex;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl", { antialias: true, alpha: false });
    if (!gl) return;

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "program link error");
    }
    gl.useProgram(program);

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    const posLoc = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "u_resolution");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uMouse = gl.getUniformLocation(program, "u_mouse");
    const uMouseVel = gl.getUniformLocation(program, "u_mouseVel");
    const uPressure = gl.getUniformLocation(program, "u_pressure");
    const uRipples = gl.getUniformLocation(program, "u_ripples");
    const uPalette = gl.getUniformLocation(program, "u_paletteIndex");
    const uGrainSeed = gl.getUniformLocation(program, "u_grainSeed");

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    function resize() {
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl!.viewport(0, 0, w, h);
      }
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const mouse = { x: 0, y: 0 };
    const mouseSmooth = { x: 0, y: 0 };
    const mouseVel = { x: 0, y: 0 };
    let pressure = 0;
    let targetPressure = 0;

    function aspectCorrected(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect();
      const nx = (clientX - rect.left) / rect.width;
      const ny = (clientY - rect.top) / rect.height;
      const aspect = rect.width / rect.height;
      return { x: (nx * 2 - 1) * aspect, y: -(ny * 2 - 1) };
    }

    const ripples: { x: number; y: number; start: number; active: boolean }[] =
      Array.from({ length: RIPPLE_SLOTS }, () => ({ x: 0, y: 0, start: 0, active: false }));
    let rippleCursor = 0;
    let startTime = performance.now();

    function spawnRipple(x: number, y: number) {
      const slot = ripples[rippleCursor];
      slot.x = x;
      slot.y = y;
      slot.start = (performance.now() - startTime) / 1000;
      slot.active = true;
      rippleCursor = (rippleCursor + 1) % RIPPLE_SLOTS;
    }

    function onMove(e: PointerEvent) {
      const p = aspectCorrected(e.clientX, e.clientY);
      mouse.x = p.x;
      mouse.y = p.y;
    }
    function onDown(e: PointerEvent) {
      targetPressure = 1;
      const p = aspectCorrected(e.clientX, e.clientY);
      spawnRipple(p.x, p.y);
    }
    function onUp() {
      targetPressure = 0;
    }
    function onLeave() {
      targetPressure = 0;
    }

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);

    let raf = 0;
    function frame() {
      resize();
      const now = (performance.now() - startTime) / 1000;

      mouseVel.x = (mouse.x - mouseSmooth.x) * 0.12;
      mouseVel.y = (mouse.y - mouseSmooth.y) * 0.12;
      mouseSmooth.x += (mouse.x - mouseSmooth.x) * 0.08;
      mouseSmooth.y += (mouse.y - mouseSmooth.y) * 0.08;
      pressure += (targetPressure - pressure) * 0.06;

      gl!.uniform2f(uRes, canvas.width, canvas.height);
      gl!.uniform1f(uTime, now);
      gl!.uniform2f(uMouse, mouseSmooth.x, mouseSmooth.y);
      gl!.uniform2f(uMouseVel, mouseVel.x, mouseVel.y);
      gl!.uniform1f(uPressure, pressure);
      gl!.uniform1f(uPalette, paletteRef.current);
      gl!.uniform1f(uGrainSeed, Math.random() * 1000);

      const flat = new Float32Array(RIPPLE_SLOTS * 4);
      ripples.forEach((r, i) => {
        flat[i * 4 + 0] = r.x;
        flat[i * 4 + 1] = r.y;
        flat[i * 4 + 2] = r.start;
        flat[i * 4 + 3] = r.active ? 1 : 0;
        if (r.active && now - r.start > 2.4) r.active = false;
      });
      gl!.uniform4fv(uRipples, flat);

      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    function onVisibility() {
      if (document.hidden) cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(frame);
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", display: "block", touchAction: "none" }}
    />
  );
}
