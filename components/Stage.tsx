'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { PlatesEngine } from '@/lib/engine';
import { PALETTES, PALETTE_KEYS, type PaletteKey } from '@/lib/palettes';

export default function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const markerRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const hintRef = useRef<HTMLParagraphElement>(null);
  const engine = useRef<PlatesEngine | null>(null);

  const [palette, setPalette] = useState<PaletteKey>('process');
  const [slip, setSlip] = useState(55);
  const [dots, setDots] = useState(9);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    let e: PlatesEngine;
    try {
      e = new PlatesEngine({
        canvas,
        markers: markerRefs.current.filter(Boolean) as HTMLElement[],
        onTheme: (paper, fg) => {
          const s = document.documentElement.style;
          s.setProperty('--paper', paper);
          s.setProperty('--fg', fg);
        },
        onFirstTouch: () => {
          gsap.to(hintRef.current, { opacity: 0, y: 6, duration: 0.6, ease: 'power2.out' });
        },
      });
    } catch {
      setFailed(true);
      return;
    }
    engine.current = e;
    gsap.fromTo('[data-intro]', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08, delay: 0.2 });
    return () => { e.dispose(); engine.current = null; };
  }, []);

  useEffect(() => { engine.current?.setPalette(palette); }, [palette]);
  useEffect(() => { engine.current?.setSlip(slip / 100); }, [slip]);
  useEffect(() => { engine.current?.setDots(dots); }, [dots]);

  const wipe = useCallback(() => engine.current?.clear(), []);
  const save = useCallback(() => engine.current?.save(), []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if ((ev.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = ev.key.toLowerCase();
      if (k === 'c') wipe();
      else if (k === 's') save();
      else if (k >= '1' && k <= '3') setPalette(PALETTE_KEYS[+k - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wipe, save]);

  const pal = PALETTES[palette];

  return (
    <main className="stage">
      <canvas ref={canvasRef} className="paper" aria-label="Halftone paper. Drag to print." />

      {[0, 1, 2].map((i) => (
        <span key={i} ref={(el) => { markerRefs.current[i] = el; }} className="marker" style={{ ['--c' as string]: pal.inks[i] }} aria-hidden />
      ))}

      {failed && <p className="fail">Plates needs WebGL. Try another browser.</p>}

      <div className="marks" aria-hidden>
        <i className="crop tl" /><i className="crop tr" /><i className="crop bl" /><i className="crop br" />
        <i className="reg l" /><i className="reg r" />
      </div>

      <header className="head" data-intro>
        <h1>Plates</h1>
        <p>A halftone press that can’t keep up with you.</p>
      </header>

      <ul className="legend" data-intro aria-label="Ink plates">
        {pal.names.map((n, i) => (
          <li key={n}>
            <span className="dot" style={{ background: pal.inks[i] }} />
            <b>0{i + 1}</b> {n}
          </li>
        ))}
      </ul>

      <p ref={hintRef} className="hint">Drag across the paper</p>

      <div className="bar" role="toolbar" aria-label="Press controls" data-intro>
        <div className="seg" role="radiogroup" aria-label="Ink set">
          {PALETTE_KEYS.map((k, i) => (
            <button
              key={k}
              role="radio"
              aria-checked={palette === k}
              className={palette === k ? 'on' : ''}
              onClick={() => setPalette(k)}
              title={`${PALETTES[k].label} (${i + 1})`}
            >
              <span className="trio" aria-hidden>
                {PALETTES[k].inks.map((c) => <i key={c} style={{ background: c }} />)}
              </span>
              {PALETTES[k].label}
            </button>
          ))}
        </div>

        <label className="range">
          <span>Slip</span>
          <input type="range" min={0} max={100} value={slip} onChange={(e) => setSlip(+e.target.value)} />
        </label>
        <label className="range">
          <span>Dots</span>
          <input type="range" min={5} max={20} value={dots} onChange={(e) => setDots(+e.target.value)} />
        </label>

        <button className="act" onClick={wipe} title="Wipe the paper (C)">Wipe <kbd>C</kbd></button>
        <button className="act solid" onClick={save} title="Save PNG (S)">Print <kbd>S</kbd></button>
      </div>
    </main>
  );
}
