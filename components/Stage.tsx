'use client';

import { useEffect, useRef, useState } from 'react';
import { SmudgeEngine } from '@/lib/engine';
import { PALETTES, PALETTE_KEYS, type PaletteKey } from '@/lib/palettes';

export default function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const engine = useRef<SmudgeEngine | null>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);

  const [text, setText] = useState('DODO');
  const [palette, setPalette] = useState<PaletteKey>('acid');
  const [dots, setDots] = useState(11);
  const [jelly, setJelly] = useState(72);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!textCanvasRef.current) textCanvasRef.current = document.createElement('canvas');
    const canvas = canvasRef.current!;
    let e: SmudgeEngine;
    try {
      e = new SmudgeEngine({
        canvas,
        textCanvas: textCanvasRef.current,
        onTheme: (paper, ink) => {
          const s = document.documentElement.style;
          s.setProperty('--paper', paper);
          s.setProperty('--ink', ink);
        },
        onFirstTouch: () => {
          hintRef.current?.classList.add('gone');
        },
      });
    } catch {
      setFailed(true);
      return;
    }
    engine.current = e;
    e.setText(text);
    return () => { e.dispose(); engine.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { engine.current?.setPalette(palette); }, [palette]);
  useEffect(() => { engine.current?.setDots(dots); }, [dots]);
  useEffect(() => { engine.current?.setJelly(jelly / 100); }, [jelly]);

  // type anywhere to edit the word
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el?.tagName === 'INPUT') return;
      if (ev.key.length === 1 || ev.key === 'Backspace') {
        document.getElementById('text-input')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const changeText = (value: string) => {
    setText(value);
    engine.current?.setText(value);
  };

  return (
    <main className="stage">
      <canvas ref={canvasRef} className="field" aria-label="Interactive halftone text. Move the pointer to push the ink." />

      {failed && <p className="fail">Smudge needs WebGL2, which your browser doesn&apos;t seem to support.</p>}

      <header className="title">
        <h1>Smudge</h1>
        <p>halftone ink, jelly physics</p>
      </header>

      <p ref={hintRef} className="hint">push it &middot; hold to pull harder &middot; type to change</p>

      <form className="bar" onSubmit={(e) => e.preventDefault()}>
        <label className="field-label">
          <span className="sr">Text</span>
          <input
            id="text-input"
            type="text"
            maxLength={24}
            value={text}
            placeholder="Type…"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            onChange={(e) => changeText(e.target.value)}
          />
        </label>

        <div className="group" role="radiogroup" aria-label="Ink">
          {PALETTE_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={palette === k}
              aria-label={PALETTES[k].label}
              className="sw"
              style={{ ['--a' as string]: PALETTES[k].paper, ['--b' as string]: PALETTES[k].ink }}
              onClick={() => setPalette(k)}
            />
          ))}
        </div>

        <label className="slider">
          <span>Dots</span>
          <input type="range" min={6} max={26} step={1} value={dots} onChange={(e) => setDots(+e.target.value)} />
        </label>
        <label className="slider">
          <span>Jelly</span>
          <input type="range" min={0} max={100} step={1} value={jelly} onChange={(e) => setJelly(+e.target.value)} />
        </label>

        <button type="button" className="save" aria-label="Save as PNG" onClick={() => engine.current?.save()}>PNG</button>
      </form>
    </main>
  );
}
