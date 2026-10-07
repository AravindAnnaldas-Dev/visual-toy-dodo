export type PaletteKey = 'acid' | 'riso' | 'cobalt' | 'press';

export interface Palette {
  label: string;
  paper: string;
  ink: string;
}

export const PALETTES: Record<PaletteKey, Palette> = {
  acid:   { label: 'Acid',   paper: '#0b0b0b', ink: '#c6f24e' },
  riso:   { label: 'Riso',   paper: '#f3ede0', ink: '#e8372b' },
  cobalt: { label: 'Cobalt', paper: '#ecebe4', ink: '#1f3bff' },
  press:  { label: 'Press',  paper: '#f6f6f3', ink: '#111111' },
};

export const PALETTE_KEYS = Object.keys(PALETTES) as PaletteKey[];
