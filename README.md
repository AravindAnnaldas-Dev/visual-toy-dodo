# Plates

A halftone press that can't keep up with you.

Drag across the paper. Three ink plates (C/M/Y) chase your cursor at different speeds, so colour separates like badly registered print. Where the plates overlap, real halftone rosettes form.

**Live:** _add link after deploying (`vercel`, or import the repo on vercel.com — no config needed)_

## Play

- **Move / drag** to print. **Hold** to flood the paper with more ink.
- **Slip** controls how loosely the plates follow you. Low is tidy, high is chaos.
- **Dots** sets the halftone cell size. **Process / Riso / Neon** swap the ink set (keys `1` `2` `3`).
- **Wipe** (`C`) clears the paper with an expanding circle. **Print** (`S`) saves a PNG.

## Run

```
npm install
npm run dev
```

Next.js (App Router) + React for the shell, three.js for rendering, GSAP for motion.

## What I built, and the choices

A toy needs play that produces something, so the one interaction is that you make a poster. Everything else was cut.

- **Three plates, three spring followers.** Each plate chases the pointer at a different speed and is slightly underdamped, so they curl into the target. The lag is the misregistration, and one slider (Slip) controls it.
- **Real screen angles.** Each plate is its own halftone grid at 15°, 75° and 0°, composited multiplicatively on paper. Overlaps produce genuine moiré and rosettes, not a filter look.
- **Ink persists.** Strokes accumulate in a half-float feedback buffer, so slow strokes pool dark and fast ones stay light. It fades very slowly.
- **Print furniture.** Crop marks, registration targets and a serif/mono pairing keep the UI in the same world as the art.
- **Performance.** One small ink pass plus one display pass per frame, capped at 2× DPR. The loop goes idle when nothing is moving and the image just holds.
- **Stack.** I skipped Paper Shaders. The interesting part is the feedback loop and the per-plate screens, which would have meant rewriting its shaders anyway.

## What I'd explore next

- Real ink physics: advect the ink so smears drag and bleed instead of only stamping
- A fourth (K) plate and per-plate angle controls
- Drop in a photo and "print" it through the three plates as you drag
- Sound: pitch and grit driven by plate separation
- Share a poster as a link (replay the stroke path instead of uploading pixels)
