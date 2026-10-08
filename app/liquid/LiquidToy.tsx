"use client";

import { useEffect, useRef, useState } from "react";
import { VERT, FRAG } from "./shaders";

type Blob = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  leader?: boolean;
};

const MAX_BLOBS = 40;
const GRAVITY = 1400;
const DAMPING = 0.985;

function compileShader(gl: WebGLRenderingContext, type: number, src: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "shader compile error");
  }
  return shader;
}

export default function LiquidToy() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showHint, setShowHint] = useState(true);
  const [count, setCount] = useState(1);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl", { antialias: true, alpha: false })!;
    if (!gl) return;

    const program = gl.createProgram()!;
    gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "link error");
    }
    gl.useProgram(program);

    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, "uResolution");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uCount = gl.getUniformLocation(program, "uCount");
    const uBlobs = gl.getUniformLocation(program, "uBlobs");
    const uMouse = gl.getUniformLocation(program, "uMouse");

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener("resize", resize);

    const pointer = { x: width / 2, y: height / 2, active: false };
    const leader: Blob = { x: width / 2, y: height / 2, vx: 0, vy: 0, r: 46, leader: true };
    const blobs: Blob[] = [leader];

    function toGL(x: number, y: number) {
      return [x * dpr, (height - y) * dpr];
    }

    function spawn(x: number, y: number, burst = true) {
      if (blobs.length >= MAX_BLOBS) blobs.splice(1, 1);
      const angle = Math.random() * Math.PI * 2;
      const speed = burst ? 180 + Math.random() * 260 : 0;
      blobs.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 120,
        r: 14 + Math.random() * 16,
      });
      setCount(blobs.length);
    }

    function onMove(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = true;
      setShowHint(false);
    }
    function onDown(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      spawn(e.clientX - rect.left, e.clientY - rect.top);
      setShowHint(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space") {
        e.preventDefault();
        for (let i = 0; i < 6; i++) {
          spawn(
            pointer.x + (Math.random() - 0.5) * 40,
            pointer.y + (Math.random() - 0.5) * 40
          );
        }
        setShowHint(false);
      }
    }

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);

    let raf = 0;
    let last = performance.now();
    const flat = new Float32Array(MAX_BLOBS * 3);

    function step(now: number) {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;

      // leader follows pointer magnetically
      const dxp = pointer.x - leader.x;
      const dyp = pointer.y - leader.y;
      leader.x += dxp * Math.min(dt * 9, 1);
      leader.y += dyp * Math.min(dt * 9, 1);

      for (let i = 1; i < blobs.length; i++) {
        const b = blobs[i];
        b.vy += GRAVITY * dt;
        b.vx *= DAMPING;
        b.vy *= DAMPING;
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        // attraction toward leader (liquid cohesion) when close
        const dx = leader.x - b.x;
        const dy = leader.y - b.y;
        const dist = Math.hypot(dx, dy) || 1;
        const pull = Math.max(0, 1 - dist / 420) * 60;
        b.vx += (dx / dist) * pull * dt;
        b.vy += (dy / dist) * pull * dt;

        // floor & walls
        const floor = height - b.r;
        if (b.y > floor) {
          b.y = floor;
          b.vy *= -0.45;
          b.vx *= 0.9;
        }
        if (b.x < b.r) {
          b.x = b.r;
          b.vx *= -0.5;
        }
        if (b.x > width - b.r) {
          b.x = width - b.r;
          b.vx *= -0.5;
        }

        // absorb into leader when merged deeply -> shrink leader growth, respawn as fresh droplet occasionally
        if (dist < leader.r * 0.35 && blobs.length > 10) {
          blobs.splice(i, 1);
          leader.r = Math.min(leader.r + 0.6, 90);
          i--;
        }
      }

      leader.r += (46 - leader.r) * dt * 0.3;

      let n = Math.min(blobs.length, MAX_BLOBS);
      for (let i = 0; i < n; i++) {
        const b = blobs[i];
        const [gx, gy] = toGL(b.x, b.y);
        flat[i * 3] = gx;
        flat[i * 3 + 1] = gy;
        flat[i * 3 + 2] = b.r * dpr;
      }

      gl.useProgram(program);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, now / 1000);
      gl.uniform1i(uCount, n);
      gl.uniform3fv(uBlobs, flat);
      gl.uniform2f(uMouse, pointer.x * dpr, (height - pointer.y) * dpr);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        overflow: "hidden",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }} />

      <div
        style={{
          position: "absolute",
          top: 24,
          left: 28,
          color: "#d7ffb0",
          letterSpacing: "0.12em",
          fontSize: 12,
          textTransform: "uppercase",
          opacity: 0.85,
          pointerEvents: "none",
        }}
      >
        Dodo &middot; Liquid Ledger
      </div>

      <div
        style={{
          position: "absolute",
          top: 24,
          right: 28,
          color: "#8fe000",
          fontSize: 12,
          letterSpacing: "0.08em",
          opacity: 0.6,
          pointerEvents: "none",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count.toString().padStart(2, "0")} droplets
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 26,
          left: "50%",
          transform: "translateX(-50%)",
          color: "#cfe8b0",
          fontSize: 13,
          opacity: showHint ? 0.75 : 0,
          transition: "opacity 0.8s ease",
          pointerEvents: "none",
          textAlign: "center",
        }}
      >
        move to lead the liquid &middot; click to mint a droplet &middot; space for a burst
      </div>
    </div>
  );
}
