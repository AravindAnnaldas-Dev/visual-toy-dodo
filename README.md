# Smudge

A tiny WebGL toy: type a word, push the halftone ink around with your pointer, let go and watch it spring back like jelly.

**Live:** _add link after deploying (`vercel`, or import the repo on vercel.com — no config needed)_

## Play

- **Move** to push the ink, **hold** to pull harder
- **Type** anywhere to change the word (spaces stack words on separate lines)
- **Ink** swatches, **Dots** (cell size), **Jelly** (spring damping: dead → wobbly), **PNG** saves the current frame

## Run

```
npm install
npm run dev
```

Next.js (App Router) + React for the shell, three.js for the WebGL2 render passes, GSAP for colour and motion.

## What this is

This is the v1 toy — originally plain HTML/CSS/JS with raw WebGL2 (`index.html` + `style.css` + `main.js`) — ported onto the same Next.js/React/three.js/GSAP stack used by the v2 "Plates" toy, so both versions live on one codebase.

Halftone is usually a static filter. Here it behaves like a physical material:

1. **Sim** – a 512² texture (rendered with three.js to a `WebGLRenderTarget`) holds a displacement and a velocity per pixel. The pointer drags displacement in; a damped spring pulls it home. The Jelly slider maps straight to the damping ratio, so you go from a stiff snap to a long wobble.
2. **Draw** – a 45° halftone grid samples the text through that field. Dot radius comes from a mip-blurred sample of a canvas-rendered text texture (so tone = ink coverage under each dot), and stretched ink prints slightly heavier.

Typing sends a ripple through the field. A scripted ghost pointer plays once on load. The render loop goes idle once the field settles, so it costs nothing when you're not touching it.

## What I'd explore next

- Per-channel (CMYK) halftone with each plate displaced slightly differently, so smears produce misregistration (this is what the companion "Plates" toy explores)
- Audio: pluck/squelch driven by field velocity
- Drop an image or use the camera as the source instead of text
- A proper fluid solve (advecting the ink, not just displacing it) so smears leave trails
