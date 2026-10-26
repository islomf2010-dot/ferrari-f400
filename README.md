# FERRARI F40 — THE REVEAL

A scroll-scrubbed cinematic reveal. A red 1987 Ferrari F40 sits under black silk
in a dark Maranello studio. The visitor scrolls, the cover slides away, and the
camera walks around the car — frame by frame, forwards, backwards, and stopped
exactly where they left it.

[![Live Demonstration](https://img.shields.io/badge/Live_Demo-Vercel_Production-E11D48?style=for-the-badge)](https://ferrari-f400.vercel.app)
[![Source Code](https://img.shields.io/badge/Source-GitHub-161B26?style=for-the-badge)](https://github.com/islomf2010-dot/ferrari-f400)

There is no 3D in the primary experience. The camera move is a pre-rendered film
that the page seeks through.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # → dist/
npm run preview      # serve the build on :4173
```

```bash
npm run verify       # 94 static checks on the choreography and the media
npm run test         # 55 browser checks against the built site
npm run check        # verify + build
npm run shoot        # capture the film's authored beats as stills
npm run media        # rebuild every asset in public/media/ from the source take
```

`verify` and `test` need no network and no manual steps. `test` drives a real
Chromium through the whole film.

---

## How the scrub works

```
scroll position
      │
      ▼
GSAP ScrollTrigger  (scrub: 0.55 — a damped, symmetric follower)
      │
      ▼
story 0 → 1
      │
      ├──► TIME_WARP ──► video.currentTime        ← the film
      ├──► overlay.ts ──► phase / label opacity   ← the typography
      └──► progress rule, percentage, timecode    ← the chrome
```

Three properties make it feel like a camera rather than a video player:

**One listener, one loop.** A single scrubbed GSAP tween is the only thing
reading the scroll position. Everything else — the video element, every caption,
the progress rule — is a pure function of the one number it produces. Nothing can
fight anything else, and reversing the scroll replays the film backwards for
free.

**`currentTime` is written once per frame, and only when it would change the
visible frame.** A paused video given a `currentTime` inside the frame it is
already showing still re-enters the demuxer and decoder. During a fast scrub
that is up to sixty wasted decodes a second on an integrated GPU. The seek is
thresholded at half a frame (`1/48 s`) — the smallest difference a visitor could
see.

**The film is never played.** `autoplay` is off, `loop` is off, and nothing calls
`play()` except the reduced-motion fallback, after the visitor presses a button.

### The time warp

`scrollProgress * duration` is close enough, but not quite right here, because
the footage's beats and the editorial beats happen at different rates. The
monster-cubic `TIME_WARP` in `src/film/timeline.ts` is a pure function of scroll
position that re-allocates scroll to match the film:

| scroll | video time | what happens | rate |
|-------:|-----------:|--------------|------|
| 0 → 15 % | 0 → 1.55 s | the mystery, under the cover | ≈ 1:1 |
| 15 → 30 % | 1.55 → 3.78 s | the silk leaves, red appears | ≈ 1.5× faster |
| 30 → 90 % | 3.78 → 9.55 s | the camera walks the car | ≈ 1:1 |
| 90 → 100 % | 9.55 → 10.0 s | the final frame settles | ≈ 0.45× slower |

It is monotone by construction, so video time can never reverse while scroll
advances. The deceleration into the hero frame is what stops the end of the film
feeling like it ran out.

---

## The film

`src/film/timeline.ts` is the single source of truth. Phases, captions, label
windows and the time warp all live there, and `npm run verify` reads that file
directly and asserts the choreography is correct — that the cover is still on at
15 % and off by 30 %, that every label sits over footage that actually shows the
part it names, that neighbouring titles dissolve rather than cut, and that
neither of them is ever fully up at the same time.

### What the source footage actually contains

The generated take was measured frame by frame rather than assumed:

| video time | frame |
|-----------:|-------|
| 0.00 – 1.60 s | black silk cover, near-dark studio, overhead spotlight |
| 1.60 – 3.75 s | the cover slides off the tail; Rosso Corsa emerges |
| 3.75 – 4.60 s | fully revealed, front three-quarter — the hero angle |
| 4.60 – 5.70 s | the flank, side profile |
| 5.70 – 7.10 s | rear three-quarter, the aerofoil enters frame |
| 7.10 – 8.60 s | dead rear — lamp band, engine bay grille |
| 8.60 – 10.0 s | rear three-quarter, opposite side, settling |

**The clip is a single continuous move of roughly 200° of azimuth.** It begins at
the front three-quarter and ends at the rear three-quarter. It is not a 360°, and
it cannot be — the frames that would carry the camera back round to the nose do
not exist in the source. Rather than fake the missing arc (CSS rotation, a
mirrored copy, a cross-dissolve between two camera positions — all of which read
instantly as a trick), the site states what it has: the HUD carries
`200° OF CAMERA · SCRUB WITH SCROLL`, and `ARC_DEGREES` in `timeline.ts` is the
single number that says so.

To use a longer or true-360 take, drop it at the same path and adjust three
numbers in `src/film/timeline.ts`: `SECONDS`, `COVER_OFF` and `ARC_DEGREES`.
Every phase, caption and label is expressed in story fractions, so the whole
chestration re-derives itself. Re-run `npm run media` to re-encode and
`npm run verify` to confirm the new timing still lands the reveal inside phase 02.

---

## Media

Everything in `public/media/` is a plain file, streamed with range requests, and
reproducible from the 4K source with `npm run media`.

| file | size | what it is |
|------|-----:|------------|
| `f40-reveal-1080.mp4` | 5.1 MB | the scrub master |
| `f40-reveal-720.mp4` | 1.7 MB | phones and low-DPR screens |
| `f40-poster.jpg` | 8 kB | frame zero — the `poster` attribute |
| `f40-keyart.jpg` | 70 kB | a frame from the orbit: the loader, and the fallback hero |
| `f40-ambient.m4a` / `.mp3` | 137 kB | a seamless, forward-only ambience bed |
| `still/*.jpg` | 260 kB total | the editorial plates |

The source is 3840 × 2160, 24 fps, 10 s, H.264 High, 19.6 Mb/s, **25.7 MB**. What
ships is **7.2 MB**, 72 % smaller, and it scrubs better — because a scrubbed
video is not a streamed video, and the properties that decide whether it scrubs
are encode decisions, not code decisions:

- **A short, closed GOP of 12 frames** (one keyframe every 0.5 s). Every seek
  must start decoding at the previous keyframe; the source's default GOP makes a
  scrub stall while the decoder walks forward. At 12 frames, no exact seek costs
  more than eleven frames of decode — a couple of milliseconds even on a Vega 8.
- **`+faststart`**, so the `moov` atom is at the front of the file and the clip is
  seekable from its first bytes rather than after the whole download.
- **`-an`**, no audio track at all. See below.

`npm run verify` asserts all of this against the shipped files rather than
trusting the build script.

### Framing: `contain`, not `cover`

The footage is letterboxed black on all four edges — measured, not assumed — so
the stage background is `#000` and `object-fit: contain` is invisible. This
matters: the car is composed to fill nearly the full width of a 16:9 frame, and
`cover` on any 16:10 or 3:2 viewport (a Surface Laptop 4 is 3:2) cuts it in half
at exactly the moment the piece is asking to be looked at. The composition is the
content.

---

## Sound

The film's audio was stripped from the encode. Seeking a video back and forth
shreds an audio track into clicks and gaps, so the soundtrack is a **separate
file** that only ever plays forwards, loops, and is never touched by the scroll
timeline. It was made seamless by equal-power crossfading the last 1.5 s of the
take back over its head.

Three independent guarantees that the film itself is silent: the encode carries
no audio track (asserted by `npm run verify`), the element is `muted`, and its
volume is pinned to zero in `FilmStage`. Nothing is ever audible by accident.

The bed **never autoplays**. It is created on the first click, attached to the
document rather than left detached, and fades in over 1.4 s and out over 0.6 s. A
blocked `play()` is a legitimate outcome, not a crash: the button simply stays
off.

---

## Performance

Target: Surface Laptop 4 — Ryzen 5, 16 GB, Vega 8 integrated graphics.

- **No 3D.** `three`, `@react-three/fiber`, `@react-three/drei` and the Draco
  decoder were removed from the runtime along with the real-time scene they
  served. The bundle is **126 kB gzipped** of JavaScript, down from a build that
  carried a WebGL engine and a 3.4 MB Draco-compressed model.
- **No post-processing stack.** The grade, vignette, scrims and grain are four
  composited layers. The grain is a baked SVG turbulence tile — static, one
  paint, no repaint.
- **Composite-only animation.** During a scrub the only properties written are
  `transform` and `opacity`, plus `textContent` on two readouts, each behind a
  change threshold. Nothing triggers layout.
- **Lazy secondary content.** The five editorial plates are `loading="lazy"`
  with intrinsic dimensions, so nothing reflows as they arrive.
- **Right encode, right device.** Source selection is by *rendered* pixel width
  (`innerWidth × min(DPR, 2)`) and pointer type, so a 3× phone never pulls a 1080p
  file it cannot show and a 1.5× laptop does. `?clip=720` / `?clip=1080` forces it.
- **No horizontal overflow**, verified at 1440 px and 390 px.
- Touch gets 620 viewports of scroll instead of 900. Portrait keeps the film at
  full width in the upper half with the typography below it, rather than cropping
  a scope frame down to the car's door.

---

## Fallbacks

Every one of these is a real code path, and `npm run test` exercises each.

| condition | behaviour |
|-----------|-----------|
| Reduced motion | The film section collapses to one viewport, no scrub, grain off, transitions cut to 120 ms. An explicit **Play the reveal once** control plays the clip and stops. Nothing plays on its own. |
| Film will not load | The 1080p encode is retried as the more conservative 720p, then the key art becomes the hero frame and a plain-language notice replaces the play button. The entire story section is unaffected. |
| Seek never resolves | Seeks below `readyState = HAVE_CURRENT_DATA` are refused rather than issued, because seeking below it makes the browser drop the frame it is showing and wait on the network — the one thing that causes a visible black flash mid-scrub. |
| JavaScript disabled | A `<noscript>` block carries the headline, the car's headline specifications and the key art. |
| Tab hidden | Decoding stops. On return the scrub loop re-seeks to wherever the scroll now is. |

---

## Accessibility

- Landmarks, a real `<nav>` with `aria-label`, one `<h1>`-per-section hierarchy,
  and `<dl>` for every specification list.
- Every caption carries `aria-hidden` toggled by its own opacity, so a screen
  reader is told about the caption that is on screen and not the three that are
  not.
- The masthead's nav retires during the film but the sound control stays
  reachable, because the soundtrack has to be one click away from the frame being
  watched.
- `Home` / `End` jump to either end of the film.
- Live regions announce the sound state.
- `prefers-reduced-motion` is honoured in both the film and the type.

---

## Layout

```
src/
  film/
    timeline.ts        the choreography — phases, labels, the time warp
    useFilmClock.ts    the single scroll listener, the rAF, the seek
    overlay.ts         every DOM write the film makes, with thresholds
    FilmStage.tsx      the sticky viewport: key art, film, grade, type, chrome
  ui/
    Masthead.tsx       mark · nav · sound
    Loader.tsx         the curtain
    Story.tsx          THE MACHINE and THE STORY
  lib/
    media.ts           the manifest and the encode decision
    audio.ts           the ambience bed
    useReducedMotion.ts
  scroll/
    track.ts           monotone-cubic interpolation (reused from the 3D build)
  content.ts           every word and every verified figure
scripts/
  prepare-media.mjs    the ffmpeg pipeline
  verify-film.mjs      94 static checks
  functional.mjs       55 browser checks
  shoot.mjs            the frame capture rig
```

---

## About the figures

Every number on the page is checked against Ferrari's own published
specification and the factory data published with the car. One commonly repeated
error has been corrected: the F40's V8 has **four** valves per cylinder, not
five. The five-valve cylinder head belongs to the 288 GTO series and the racing
F40 LM; the road car's power came from more capacity, more boost and a higher
compression ratio.

```
Engine          Tipo F120A · 2,936 cc · 90° V8 · twin turbocharged, intercooled,
                IHI units · four valves per cylinder, twin overhead camshafts
                per bank · compression 7.7 : 1
Output          478 PS (352 kW) at 7,000 rpm · 577 N·m at 4,000 rpm
Performance     324 km/h · 0–100 km/h 4.1 s
Mass            1,100 kg dry
Body            L 4,358 · W 1,970 · H 1,124 mm · wheelbase 2,450 mm
Tyres           245/40 ZR17 front · 335/35 ZR17 rear
Production      1,311 cars, 1987–1992
```

---

## What changed from the previous build

This repository was a scroll-driven **real-time 3D** study of the same car — a
Vite + React + three.js/R3F scene with a Draco-compressed GLB, a spline-driven
camera rig, clickable hotspots and a print stylesheet.

The 3D scene has been removed. A pre-rendered film scrubs more smoothly, costs a
fraction of the frame budget, and is what the brief asked for. What was kept and
reused:

- the **monotone-cubic interpolator** in `src/scroll/track.ts`, now driving the
  time warp;
- the **font stack** and the whole type system;
- the **art direction** — near-black, one Rosso Corsa, warm white, editorial
  scale, hairline rules;
- the **section structure** and the copy's voice;
- `assets/source/lb-works_ferrari_f40_-__free.glb` and the `inspect` / `assets`
  scripts, which still describe that model. Neither is loaded by the site; both
  are git-ignored with the rest of `assets/`.

Removed: `src/scene/*`, `src/ui/Hud.tsx`, `src/ui/Hotspots.tsx`,
`src/ui/SceneBlock.tsx`, `src/scroll/story.ts`, `src/lib/quality.ts`,
`public/models/`, `public/draco/`, and the three WebGL dependencies.