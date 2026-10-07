"use client";

import { useEffect, useRef, useState } from "react";

const VERT_SRC = `#version 300 es
in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const MAX_BLOBS = 16;

const FRAG_SRC = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform int uBlobCount;
uniform vec3 uBlobs[${MAX_BLOBS}]; // xy = px position, z = radius
uniform sampler2D uTextTex;

out vec4 outColor;

const vec3 BG = vec3(0.035, 0.04, 0.036);
const vec3 TEXT_DIM = vec3(0.30, 0.34, 0.30);
const vec3 INK = vec3(0.30, 0.55, 0.20);
const vec3 RIM = vec3(0.88, 1.0, 0.55);

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float field(vec2 p) {
  float d = 1e5;
  for (int i = 0; i < ${MAX_BLOBS}; i++) {
    if (i >= uBlobCount) break;
    vec3 b = uBlobs[i];
    float di = length(p - b.xy) - b.z;
    d = smin(d, di, max(b.z * 0.55, 8.0));
  }
  return d;
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = fc / uResolution;

  float d = field(fc);

  float e = 1.0;
  float dx = field(fc + vec2(e, 0.0)) - field(fc - vec2(e, 0.0));
  float dy = field(fc + vec2(0.0, e)) - field(fc - vec2(0.0, e));
  vec2 grad = vec2(dx, dy) / (2.0 * e);
  float gradLen = length(grad) + 1e-5;
  vec2 normal = grad / gradLen;

  vec2 p = (fc - 0.5 * uResolution) / uResolution.y + 0.5;
  vec2 textUv = vec2(p.x, 1.0 - p.y);
  vec3 baseText = texture(uTextTex, textUv).rgb * TEXT_DIM;

  float depth = clamp(-d, 0.0, 70.0);
  vec2 refractUv = textUv + normal * (depth / uResolution.y) * 0.22;
  vec3 lensText = texture(uTextTex, refractUv).rgb * RIM * 1.1;

  float inside = 1.0 - smoothstep(-2.0, 2.0, d);

  vec3 col = BG;
  col = mix(col, baseText, 1.0);

  vec3 liquid = mix(INK * 0.55, INK * 0.85 + lensText, clamp(depth / 70.0, 0.0, 1.0));
  col = mix(col, liquid, inside);

  float rim = 1.0 - smoothstep(0.0, 3.0, abs(d));
  col += RIM * rim * 0.9;

  float vig = smoothstep(1.1, 0.35, length(uv - 0.5));
  col *= mix(0.72, 1.0, vig);

  float grain = (hash(fc + fract(uTime) * 97.0) - 0.5) * 0.035;
  col += grain;

  outColor = vec4(col, 1.0);
}
`;

type Blob = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  baseR: number;
  phase: number;
  speed: number;
};

type Burst = {
  x: number;
  y: number;
  r: number;
  t: number;
};

function compileShader(gl: WebGL2RenderingContext, type: number, src: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error("Shader compile error: " + info);
  }
  return shader;
}

function makeTextTexture(gl: WebGL2RenderingContext, text: string, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fontSize = Math.min(width, height) * 0.16;
  ctx.font = `800 ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(text, width / 2, height / 2);

  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}

export default function LiquidInk() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hintVisible, setHintVisible] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl2", { antialias: false })!;
    if (!gl) return;

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("Program link error: " + gl.getProgramInfoLog(program));
    }
    gl.useProgram(program);

    const quad = new Float32Array([-1, -1, 3, -1, -1, 3]);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, "uResolution");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uBlobCount = gl.getUniformLocation(program, "uBlobCount");
    const uBlobs = gl.getUniformLocation(program, "uBlobs");
    const uTextTex = gl.getUniformLocation(program, "uTextTex");

    let textTex = makeTextTexture(gl, "DODO", 1024, 1024);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textTex);
    gl.uniform1i(uTextTex, 0);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    function resize() {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener("resize", resize);

    const ambientCount = 5;
    const ambient: Blob[] = Array.from({ length: ambientCount }).map((_, i) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: 0,
      vy: 0,
      r: 40 + Math.random() * 30,
      baseR: 40 + Math.random() * 30,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.4,
    }));

    const cursor = { x: width / 2, y: height / 2, tx: width / 2, ty: height / 2, r: 54, targetR: 54 };
    let pointerActive = false;
    let pressStart = 0;
    let downPos = { x: 0, y: 0 };
    let hasMoved = false;

    const bursts: Burst[] = [];

    function clientToCanvas(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function onPointerMove(e: PointerEvent) {
      const p = clientToCanvas(e.clientX, e.clientY);
      cursor.tx = p.x;
      cursor.ty = p.y;
      pointerActive = true;
      hasMoved = true;
      setHintVisible(false);
    }

    function onPointerDown(e: PointerEvent) {
      const p = clientToCanvas(e.clientX, e.clientY);
      downPos = p;
      pressStart = performance.now();
      cursor.tx = p.x;
      cursor.ty = p.y;
      setHintVisible(false);
    }

    function onPointerUp(e: PointerEvent) {
      const p = clientToCanvas(e.clientX, e.clientY);
      const held = performance.now() - pressStart;
      const dist = Math.hypot(p.x - downPos.x, p.y - downPos.y);
      if (dist < 12) {
        bursts.push({ x: p.x, y: p.y, r: 10, t: 0 });
      }
      cursor.targetR = 54;
      void held;
    }

    function onPointerLeave() {
      pointerActive = false;
    }

    canvas.style.touchAction = "none";
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);

    let raf = 0;
    let last = performance.now();
    const start = last;

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = (now - start) / 1000;

      cursor.x += (cursor.tx - cursor.x) * Math.min(dt * 10, 1);
      cursor.y += (cursor.ty - cursor.y) * Math.min(dt * 10, 1);

      if (pointerActive) {
        const held = (now - pressStart) / 1000;
        cursor.targetR = 54 + Math.min(held, 1.2) * 46;
      }
      cursor.r += (cursor.targetR - cursor.r) * Math.min(dt * 6, 1);

      for (const b of ambient) {
        const nx = Math.sin(t * b.speed + b.phase) * 0.6 + Math.sin(t * b.speed * 0.37 + b.phase * 1.7) * 0.4;
        const ny = Math.cos(t * b.speed * 0.8 + b.phase * 1.3) * 0.6 + Math.sin(t * b.speed * 0.5 + b.phase) * 0.4;
        b.vx += nx * 18 * dt;
        b.vy += ny * 18 * dt;

        const dxc = cursor.x - b.x;
        const dyc = cursor.y - b.y;
        const dc = Math.hypot(dxc, dyc) + 1e-3;
        if (dc < 260) {
          b.vx += (dxc / dc) * 14 * dt;
          b.vy += (dyc / dc) * 14 * dt;
        }

        b.vx *= 0.96;
        b.vy *= 0.96;
        b.x += b.vx;
        b.y += b.vy;

        const margin = b.baseR;
        if (b.x < margin) { b.x = margin; b.vx *= -0.5; }
        if (b.x > width - margin) { b.x = width - margin; b.vx *= -0.5; }
        if (b.y < margin) { b.y = margin; b.vy *= -0.5; }
        if (b.y > height - margin) { b.y = height - margin; b.vy *= -0.5; }

        b.r = b.baseR + Math.sin(t * 1.3 + b.phase) * 6;
      }

      for (let i = bursts.length - 1; i >= 0; i--) {
        const burst = bursts[i];
        burst.t += dt;
        const life = 1.1;
        if (burst.t > life) {
          bursts.splice(i, 1);
          continue;
        }
        const p = burst.t / life;
        const grow = 1 - Math.pow(1 - Math.min(p / 0.35, 1), 3);
        const shrink = p > 0.35 ? Math.max(0, 1 - (p - 0.35) / 0.65) : 1;
        burst.r = 18 + grow * 70 * shrink;
      }

      const data: number[] = [];
      data.push(cursor.x * dpr, (height - cursor.y) * dpr, cursor.r * dpr);
      for (const b of ambient) data.push(b.x * dpr, (height - b.y) * dpr, b.r * dpr);
      for (const burst of bursts) data.push(burst.x * dpr, (height - burst.y) * dpr, burst.r * dpr);

      const count = Math.min(data.length / 3, MAX_BLOBS);
      const flat = new Float32Array(MAX_BLOBS * 3);
      flat.set(data.slice(0, MAX_BLOBS * 3));

      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform1i(uBlobCount, count);
      gl.uniform3fv(uBlobs, flat);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      gl.deleteTexture(textTex);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(vbo);
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", cursor: "none" }} />
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "8%",
          transform: "translateX(-50%)",
          color: "rgba(220, 255, 180, 0.55)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: 13,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          pointerEvents: "none",
          opacity: hintVisible ? 1 : 0,
          transition: "opacity 0.8s ease",
        }}
      >
        move · hold to grow · click to drop ink
      </div>
    </div>
  );
}
