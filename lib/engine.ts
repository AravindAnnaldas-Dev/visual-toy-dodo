import * as THREE from 'three';
import gsap from 'gsap';
import { VERT, INK_FRAG, DISPLAY_FRAG } from './shaders';
import { PALETTES, type PaletteKey } from './palettes';

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c: RGB) => `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;

const INK_RES = 1024;
// Each plate follows the pointer at a different speed. The lag *is* the misregistration.
const FOLLOW = [1, 0.62, 0.4];
const PLATE_R = [0.062, 0.055, 0.05];

interface Colors { paper: RGB; inks: [RGB, RGB, RGB]; additive: number }

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  markers: HTMLElement[];
  onTheme: (paper: string, fg: string) => void;
  onFirstTouch: () => void;
}

export class PlatesEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private mesh: THREE.Mesh;
  private inkMat: THREE.ShaderMaterial;
  private dispMat: THREE.ShaderMaterial;
  private targets: THREE.WebGLRenderTarget[] = [];
  private read = 0;

  private pos = [0, 1, 2].map(() => ({ x: 0.5, y: 0.5 }));
  private vel = [0, 1, 2].map(() => ({ x: 0, y: 0 }));
  private prev = [0, 1, 2].map(() => ({ x: 0.5, y: 0.5 }));
  private target = { x: 0.5, y: 0.5 };
  private inside = false;
  private down = false;
  private ghost: gsap.core.Tween | null = null;
  private ghostStamp = false;
  private touched = false;

  private slip = 0.55;
  private radiusScale = { v: 1 };
  private colors: Colors;
  private wipe = { r: 0 };
  private wipeC = new THREE.Vector2(0.5, 0.5);
  private cellCss = 9;
  private aspect = 1;

  private raf = 0;
  private last = 0;
  private awakeUntil = 0;
  private disposed = false;
  private tweens: gsap.core.Tween[] = [];
  private cleanup: Array<() => void> = [];

  constructor(private o: EngineOptions) {
    const { canvas } = o;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const p = PALETTES.process;
    this.colors = { paper: hex(p.paper), inks: p.inks.map(hex) as Colors['inks'], additive: 0 };

    const geo = new THREE.PlaneGeometry(2, 2);
    this.inkMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: INK_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uPrev: { value: null },
        uP0: { value: [0, 1, 2].map(() => new THREE.Vector2()) },
        uP1: { value: [0, 1, 2].map(() => new THREE.Vector2()) },
        uR: { value: [...PLATE_R] },
        uAspect: { value: 1 },
        uDt: { value: 0.016 },
        uRate: { value: 1.7 },
        uFade: { value: 0.012 },
        uStamp: { value: 0 },
        uWipeC: { value: this.wipeC },
        uWipeR: { value: 0 },
      },
    });
    this.dispMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: DISPLAY_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uInk: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uCell: { value: 9 },
        uAdditive: { value: 0 },
        uPaper: { value: new THREE.Vector3() },
        uC0: { value: new THREE.Vector3() },
        uC1: { value: new THREE.Vector3() },
        uC2: { value: new THREE.Vector3() },
      },
    });
    this.mesh = new THREE.Mesh(geo, this.dispMat);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    this.resize();
    this.syncColors();
    this.bind();

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) this.playGhost();
    this.wake(6000);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------- public API ----------
  setSlip(v: number) { this.slip = v; this.wake(); }
  setDots(px: number) { this.cellCss = px; this.wake(); }

  setPalette(key: PaletteKey) {
    const p = PALETTES[key];
    const from: Colors = { paper: [...this.colors.paper], inks: this.colors.inks.map((c) => [...c]) as Colors['inks'], additive: this.colors.additive };
    const to: Colors = { paper: hex(p.paper), inks: p.inks.map(hex) as Colors['inks'], additive: p.additive ? 1 : 0 };
    const k = { t: 0 };
    this.tweens.push(gsap.to(k, {
      t: 1, duration: 0.8, ease: 'power2.inOut',
      onUpdate: () => {
        this.colors = {
          paper: mix3(from.paper, to.paper, k.t),
          inks: [0, 1, 2].map((i) => mix3(from.inks[i], to.inks[i], k.t)) as Colors['inks'],
          additive: lerp(from.additive, to.additive, k.t),
        };
        this.syncColors();
        this.wake(300);
      },
    }));
  }

  clear(ux = 0.5, uy = 0.5) {
    if (this.wipe.r > 0) return;
    this.wipeC.set(ux, uy);
    this.wipe.r = 0.001;
    this.tweens.push(gsap.to(this.wipe, {
      r: 1.9, duration: 1.15, ease: 'power2.out',
      onUpdate: () => this.wake(300),
      onComplete: () => { this.wipe.r = 0; },
    }));
  }

  save() {
    this.renderDisplay();
    this.renderer.domElement.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `plates-${Date.now().toString(36)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach((fn) => fn());
    this.ghost?.kill();
    this.tweens.forEach((t) => t.kill());
    gsap.killTweensOf(this.radiusScale);
    this.targets.forEach((t) => t.dispose());
    this.inkMat.dispose();
    this.dispMat.dispose();
    this.mesh.geometry.dispose();
    this.renderer.dispose();
  }

  // ---------- setup ----------
  private bind() {
    const { canvas } = this.o;
    const toUv = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height };
    };
    const teleport = () => {
      for (let i = 0; i < 3; i++) {
        this.pos[i].x = this.prev[i].x = this.target.x;
        this.pos[i].y = this.prev[i].y = this.target.y;
        this.vel[i].x = this.vel[i].y = 0;
      }
    };
    const engage = (e: PointerEvent) => {
      this.stopGhost();
      const p = toUv(e);
      this.target.x = p.x; this.target.y = p.y;
      if (!this.inside) { this.inside = true; teleport(); }
      if (!this.touched) { this.touched = true; this.o.onFirstTouch(); }
      this.wake();
    };
    const downFn = (e: PointerEvent) => {
      engage(e);
      this.down = true;
      canvas.setPointerCapture(e.pointerId);
      gsap.to(this.radiusScale, { v: 1.7, duration: 0.35, ease: 'power3.out', overwrite: true });
    };
    const up = (e: PointerEvent) => {
      this.down = false;
      if (e.pointerType !== 'mouse') this.inside = false;
      gsap.to(this.radiusScale, { v: 1, duration: 0.6, ease: 'elastic.out(1, 0.6)', overwrite: true });
    };
    const leave = () => { if (!this.down) this.inside = false; };

    canvas.addEventListener('pointermove', engage);
    canvas.addEventListener('pointerdown', downFn);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', leave);

    let t: ReturnType<typeof setTimeout>;
    const onResize = () => { clearTimeout(t); t = setTimeout(() => this.resize(), 80); };
    window.addEventListener('resize', onResize);

    this.cleanup.push(() => {
      canvas.removeEventListener('pointermove', engage);
      canvas.removeEventListener('pointerdown', downFn);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('pointerleave', leave);
      window.removeEventListener('resize', onResize);
      clearTimeout(t);
    });
  }

  private resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.aspect = w / h;
    const iw = this.aspect >= 1 ? INK_RES : Math.round(INK_RES * this.aspect);
    const ih = this.aspect >= 1 ? Math.round(INK_RES / this.aspect) : INK_RES;

    this.targets.forEach((t) => t.dispose());
    this.targets = [0, 1].map(() => new THREE.WebGLRenderTarget(iw, ih, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    }));
    this.renderer.setClearColor(0x000000, 1);
    this.targets.forEach((t) => { this.renderer.setRenderTarget(t); this.renderer.clear(); });
    this.renderer.setRenderTarget(null);
    this.read = 0;
    this.wake();
  }

  private syncColors() {
    const c = this.colors;
    const u = this.dispMat.uniforms;
    u.uPaper.value.set(...c.paper);
    u.uC0.value.set(...c.inks[0]);
    u.uC1.value.set(...c.inks[1]);
    u.uC2.value.set(...c.inks[2]);
    u.uAdditive.value = c.additive;
    const lum = 0.2126 * c.paper[0] + 0.7152 * c.paper[1] + 0.0722 * c.paper[2];
    const dark = hex('#141414'), light = hex('#efece2');
    const k = Math.min(1, Math.max(0, (0.6 - lum) / 0.3));
    this.o.onTheme(css(c.paper), css(mix3(dark, light, k)));
  }

  // ---------- intro ----------
  private playGhost() {
    const path = (t: number) => {
      const th = t * Math.PI * 2 * 1.1;
      return { x: 0.5 + 0.27 * Math.sin(th), y: 0.52 + 0.17 * Math.sin(2 * th + 0.4) };
    };
    const s = path(0);
    this.target.x = s.x; this.target.y = s.y;
    for (let i = 0; i < 3; i++) { this.pos[i] = { ...s }; this.prev[i] = { ...s }; }
    const o = { t: 0 };
    this.ghost = gsap.to(o, {
      t: 1, duration: 3.6, delay: 0.7, ease: 'power1.inOut',
      onStart: () => { this.ghostStamp = true; },
      onUpdate: () => { const p = path(o.t); this.target.x = p.x; this.target.y = p.y; this.wake(); },
      onComplete: () => { this.ghostStamp = false; },
    });
  }

  private stopGhost() {
    if (!this.ghost) return;
    this.ghost.kill();
    this.ghost = null;
    this.ghostStamp = false;
  }

  // ---------- loop ----------
  private wake(ms = 60000) { this.awakeUntil = Math.max(this.awakeUntil, performance.now() + ms); }

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min((now - this.last) / 1000, 1 / 30);
    this.last = now;
    if (now > this.awakeUntil) return;   // nothing is moving: hold the image, spend nothing

    this.simulate(dt);
    this.renderInk(dt);
    this.renderDisplay();
  };

  private simulate(dt: number) {
    const base = lerp(26, 4.2, this.slip);
    const zeta = 0.55;                      // a little underdamped, so plates curl into the target
    const sub = 2, h = dt / sub;
    for (let i = 0; i < 3; i++) {
      this.prev[i].x = this.pos[i].x; this.prev[i].y = this.pos[i].y;
      const w = base * FOLLOW[i], k = w * w, c = 2 * zeta * w;
      for (let s = 0; s < sub; s++) {
        this.vel[i].x += ((this.target.x - this.pos[i].x) * k - this.vel[i].x * c) * h;
        this.vel[i].y += ((this.target.y - this.pos[i].y) * k - this.vel[i].y * c) * h;
        this.pos[i].x += this.vel[i].x * h;
        this.pos[i].y += this.vel[i].y * h;
      }
    }
    // little plate markers so you can see what is chasing you
    const { markers } = this.o;
    const W = window.innerWidth, H = window.innerHeight;
    const show = this.inside || this.ghostStamp;
    markers.forEach((m, i) => {
      m.style.transform = `translate3d(${this.pos[i].x * W}px, ${(1 - this.pos[i].y) * H}px, 0)`;
      m.style.opacity = show ? '1' : '0';
    });
  }

  private renderInk(dt: number) {
    const u = this.inkMat.uniforms;
    for (let i = 0; i < 3; i++) {
      u.uP0.value[i].set(this.prev[i].x, this.prev[i].y);
      u.uP1.value[i].set(this.pos[i].x, this.pos[i].y);
      u.uR.value[i] = PLATE_R[i] * this.radiusScale.v;
    }
    u.uPrev.value = this.targets[this.read].texture;
    u.uAspect.value = this.aspect;
    u.uDt.value = dt;
    u.uRate.value = this.down ? 4.0 : 1.7;
    u.uStamp.value = this.inside || this.ghostStamp ? 1 : 0;
    u.uWipeR.value = this.wipe.r;

    this.mesh.material = this.inkMat;
    this.renderer.setRenderTarget(this.targets[1 - this.read]);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.read = 1 - this.read;
  }

  private renderDisplay() {
    const u = this.dispMat.uniforms;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    u.uInk.value = this.targets[this.read].texture;
    u.uRes.value.copy(size);
    u.uCell.value = this.cellCss * this.renderer.getPixelRatio();
    this.mesh.material = this.dispMat;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }
}
