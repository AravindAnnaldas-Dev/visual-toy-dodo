import type { Metadata, Viewport } from 'next';
import { Archivo_Black, Inter } from 'next/font/google';
import './globals.css';

const display = Archivo_Black({ subsets: ['latin'], weight: '400', variable: '--font-display' });
const mono = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Smudge — halftone ink you can push around',
  description: 'Type a word. Push the ink around. Let go and watch it spring back. A tiny WebGL halftone toy.',
};

export const viewport: Viewport = { themeColor: '#0b0b0b', viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
