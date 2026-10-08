import * as THREE from 'three';
import gsap from 'gsap';
import { VERT, SIM_FRAG, DRAW_FRAG } from './shaders';
import { PALETTES, type PaletteKey } from './palettes';

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c: RGB) => `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;

const FIELD = 512;

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  textCanvas: HTMLCanvasElement;
  onTheme: (paper: string, ink: string) => void;
  onFirstTouch: () => void;
}

export class SmudgeEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private mesh: THREE.Mesh;
  private simMat: THREE.ShaderMaterial;
  private drawMat: THREE.ShaderMaterial;
  private fields: THREE.WebGLRenderTarget[];
  private read = 0;

  private textTex: THREE.CanvasTexture;
  private tctx: CanvasRenderingContext2D;
  private text = 'DODO';
  private texW = 1024;

  private ptr = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, inside: false, down: false, radius: 0.08, strength: 0.5 };
  private intro = { t: 0, on: true };
  private colors: { paper: RGB; ink: RGB };
  private kick = 0;
  private seed = 0;
  private jelly = 0.72;
  private dotsCss = 11;

  private dpr = 1;
  private cssW = 1;
  private cssH = 1;
  private raf = 0;
  private last = 0;
  private awakeUntil = 0;
  private disposed = false;
  private tweens: gsap.core.Tween[] = [];
  private cleanup: Array<() => void> = [];

  constructor(private o: EngineOptions) {
    const { canvas, textCanvas } = o;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.dpr);

    const p = PALETTES.acid;
    this.colors = { paper: hex(p.paper), ink: hex(p.ink) };

    this.tctx = textCanvas.getContext('2d')!;
    this.textTex = new THREE.CanvasTexture(textCanvas);
    this.textTex.minFilter = THREE.LinearMipmapLinearFilter;
    this.textTex.magFilter = THREE.LinearFilter;
    this.textTex.generateMipmaps = true;

    const geo = new THREE.PlaneGeometry(2, 2);
    this.simMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: SIM_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uPrev: { value: null },
        uP0: { value: new THREE.Vector2() },
        uP1: { value: new THREE.Vector2() },
        uAspect: { value: 1 },
        uRadius: { value: 0.08 },
        uStrength: { value: 0.5 },
        uDt: { value: 0.016 },
        uK: { value: 45 },
        uC: { value: 6 },
        uKick: { value: 0 },
        uSeed: { value: 0 },
        uActive: { value: 0 },
        uSnap: { value: 0.00005 },
      },
    });
    this.drawMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: DRAW_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTex: { value: this.textTex },
        uField: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uCell: { value: 11 },
        uTexW: { value: 1024 },
        uPaper: { value: new THREE.Vector3() },
        uInk: { value: new THREE.Vector3() },
      },
    });
    this.mesh = new THREE.Mesh(geo, this.drawMat);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    this.fields = [0, 1].map(() => new THREE.WebGLRenderTarget(FIELD, FIELD, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    }));
    const grey = new THREE.Color(0.5, 0.5, 0.5);
    this.fields.forEach((t) => { this.renderer.setRenderTarget(t); this.renderer.setClearColor(grey, 0.5); this.renderer.clear(); });
    this.renderer.setRenderTarget(null);

    this.resize();
    this.renderText();
    this.syncColors();
    this.bind();

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.kick = 1;
    this.seed = 3.1;
    if (reduce) this.intro.on = false;
    this.wake(6000);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------- public API ----------
  setText(text: string) {
    this.text = text;
    this.renderText();
    this.kick = 1;
    this.seed = Math.random() * 100;
    this.wake();
  }

  setDots(px: number) { this.dotsCss = px; this.wake(); }
  setJelly(v: number) { this.jelly = v; this.kick = Math.max(this.kick, 0.5); this.wake(); }

  setPalette(key: PaletteKey) {
    const p = PALETTES[key];
    const from = { paper: [...this.colors.paper] as RGB, ink: [...this.colors.ink] as RGB };
    const to = { paper: hex(p.paper), ink: hex(p.ink) };
    const k = { t: 0 };
    this.kick = Math.max(this.kick, 0.6);
    this.seed = Math.random() * 100;
    this.tweens.push(gsap.to(k, {
      t: 1, duration: 0.8, ease: 'power2.inOut',
      onUpdate: () => {
        this.colors = { paper: mix3(from.paper, to.paper, k.t), ink: mix3(from.ink, to.ink, k.t) };
        this.syncColors();
        this.wake(300);
      },
    }));
  }

  save() {
    this.renderDisplay();
    this.renderer.domElement.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `jelly-${(this.text.trim() || 'blank').replace(/\W+/g, '-').toLowerCase()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach((fn) => fn());
    this.tweens.forEach((t) => t.kill());
    this.fields.forEach((t) => t.dispose());
    this.simMat.dispose();
    this.drawMat.dispose();
    this.mesh.geometry.dispose();
    this.textTex.dispose();
    this.renderer.dispose();
  }

  // ---------- setup ----------
  private bind() {
    const { canvas } = this.o;
    const toUv = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height };
    };
    const userTouched = () => {
      if (this.intro.on) this.intro.on = false;
      this.o.onFirstTouch();
      this.wake();
    };
    const enter = (e: PointerEvent) => {
      this.ptr.inside = true;
      const p = toUv(e);
      this.ptr.x = p.x; this.ptr.y = p.y;
      this.ptr.px = this.ptr.x; this.ptr.py = this.ptr.y;
    };
    const move = (e: PointerEvent) => {
      if (!this.ptr.inside) enter(e);
      const p = toUv(e);
      this.ptr.x = p.x; this.ptr.y = p.y;
      userTouched();
    };
    const down = (e: PointerEvent) => {
      enter(e);
      this.ptr.down = true;
      canvas.setPointerCapture(e.pointerId);
      userTouched();
    };
    const up = (e: PointerEvent) => {
      this.ptr.down = false;
      if (e.pointerType !== 'mouse') this.ptr.inside = false;
      this.wake();
    };
    const leave = () => { if (!this.ptr.down) this.ptr.inside = false; };

    canvas.addEventListener('pointerenter', enter);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', leave);

    let t: ReturnType<typeof setTimeout>;
    const onResize = () => { clearTimeout(t); t = setTimeout(() => { this.resize(); this.renderText(); }, 80); };
    window.addEventListener('resize', onResize);

    this.cleanup.push(() => {
      canvas.removeEventListener('pointerenter', enter);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('pointerleave', leave);
      window.removeEventListener('resize', onResize);
      clearTimeout(t);
    });
  }

  private resize() {
    this.cssW = window.innerWidth;
    this.cssH = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.cssW, this.cssH, false);
    this.wake();
  }

  private renderText() {
    const W = Math.min(2048, Math.max(512, Math.round(this.cssW * this.dpr)));
    const H = Math.max(256, Math.round(W * this.cssH / Math.max(this.cssW, 1)));
    const canvas = this.o.textCanvas;
    canvas.width = W;
    canvas.height = H;
    this.texW = W;

    const ctx = this.tctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const lines = this.text.trim().split(/\s+/).filter(Boolean).slice(0, 4);
    if (lines.length) {
      const family = '"Archivo Black", "Arial Black", Impact, sans-serif';
      ctx.font = `100px ${family}`;
      const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const lh = 0.95;
      const size = Math.min(
        (W * 0.84) / widest * 100,
        (H * 0.6) / (lines.length * lh + 0.1),
        H * 0.62,
      );
      ctx.font = `${size}px ${family}`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const cap = size * 0.72;
      const block = size * lh * (lines.length - 1) + cap;
      const y0 = H / 2 - block / 2 + cap;
      lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * size * lh));
    }

    this.textTex.needsUpdate = true;
    this.drawMat.uniforms.uTexW.value = this.texW;
  }

  private syncColors() {
    const u = this.drawMat.uniforms;
    u.uPaper.value.set(...this.colors.paper);
    u.uInk.value.set(...this.colors.ink);
    this.o.onTheme(css(this.colors.paper), css(this.colors.ink));
  }

  // ---------- loop ----------
  private wake(ms = 4000) { this.awakeUntil = Math.max(this.awakeUntil, performance.now() + ms); }

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min((now - this.last) / 1000, 1 / 30);
    this.last = now;
    if (now > this.awakeUntil) return; // idle: the field has settled, stop burning GPU

    this.simulate(dt);
    this.renderDisplay();
  };

  private simulate(dt: number) {
    let x = this.ptr.x;
    let y = this.ptr.y;
    let active = this.ptr.inside;
    let radius = 0.08;
    let strength = 0.5;

    if (this.intro.on) {
      this.intro.t += dt;
      if (this.intro.t > 2.4) this.intro.on = false;
      const t = this.intro.t;
      const fade = Math.min(1, t * 3) * Math.min(1, (2.4 - t) * 3);
      x = 0.5 + 0.3 * Math.sin(t * 2.4) * fade;
      y = 0.5 + 0.1 * Math.sin(t * 3.7 + 1.0) * fade;
      active = t > 0.15;
      radius = 0.12; strength = 0.8;
      if (!active) { this.ptr.px = x; this.ptr.py = y; }
      this.wake();
    } else if (this.ptr.down) {
      radius = 0.15; strength = 0.92;
    }

    const p0x = this.ptr.px;
    const p0y = this.ptr.py;
    const ratio = 0.95 - this.jelly * 0.85;
    const stiff = 45;

    const u = this.simMat.uniforms;
    u.uPrev.value = this.fields[this.read].texture;
    u.uP0.value.set(p0x, p0y);
    u.uP1.value.set(x, y);
    u.uAspect.value = this.cssW / this.cssH;
    u.uRadius.value = radius;
    u.uStrength.value = strength;
    u.uDt.value = dt;
    u.uK.value = stiff;
    u.uC.value = 2 * ratio * Math.sqrt(stiff);
    u.uKick.value = this.kick;
    u.uSeed.value = this.seed;
    u.uActive.value = active ? 1 : 0;

    this.mesh.material = this.simMat;
    this.renderer.setRenderTarget(this.fields[1 - this.read]);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.read = 1 - this.read;

    this.ptr.px = x; this.ptr.py = y;
    this.kick = 0;
  }

  private renderDisplay() {
    const u = this.drawMat.uniforms;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    u.uField.value = this.fields[this.read].texture;
    u.uRes.value.copy(size);
    u.uCell.value = this.dotsCss * this.dpr;
    this.mesh.material = this.drawMat;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }
}
