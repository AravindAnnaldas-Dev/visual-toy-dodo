export type PaletteKey = 'process' | 'riso' | 'neon';

export interface Palette {
  label: string;
  /** names of plates 1–3 */
  names: [string, string, string];
  paper: string;
  /** colours of plates 1–3 */
  inks: [string, string, string];
  /** false = subtractive (multiply on paper), true = additive (light on dark) */
  additive: boolean;
}

export const PALETTES: Record<PaletteKey, Palette> = {
  process: { label: 'Process', names: ['Cyan', 'Magenta', 'Yellow'], paper: '#f2eee3', inks: ['#00a6e8', '#ee1f8e', '#ffe600'], additive: false },
  riso:    { label: 'Riso',    names: ['Blue', 'Pink', 'Yellow'],     paper: '#f4efe4', inks: ['#2b4bff', '#ff4fa3', '#ffc400'], additive: false },
  neon:    { label: 'Neon',    names: ['Ice', 'Hot pink', 'Lime'],    paper: '#0a0a0a', inks: ['#35d9ff', '#ff3fa4', '#c6f24e'], additive: true },
};

export const PALETTE_KEYS = Object.keys(PALETTES) as PaletteKey[];
