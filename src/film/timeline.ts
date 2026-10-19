/**
 * THE FILM TIMELINE — the single source of truth for the whole experience.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ASSET
 * ────────────────────────────────────────────────────────────────────────────
 * Source footage (Google Flow / Veo):
 *   "Generated Video October 18, 2026 - 2_04PM.mp4"
 *   3840×2160 · 24 fps · 10.000 s · H.264 High · 19.6 Mb/s · 25.7 MB
 *
 * Shipping assets (built by `npm run media` — see scripts/prepare-media.mjs):
 *   /media/f40-reveal-1080.mp4   1920×1080 · CRF 21 · closed GOP of 12 frames
 *   /media/f40-reveal-720.mp4    1280×720  · CRF 24 · closed GOP of 12 frames
 *   /media/f40-poster.jpg        the film's own first frame
 *   /media/f40-keyart.jpg        a frame from the orbit, used while buffering
 *                                and as the reduced-motion / no-video fallback
 *   /media/f40-ambient.{m4a,mp3} a seamless, forward-playing ambience bed
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT THE FOOTAGE ACTUALLY CONTAINS  (read frame by frame, not assumed)
 * ────────────────────────────────────────────────────────────────────────────
 *   0.00 – 1.60 s   black silk cover over the car, near-dark studio, overhead
 *                   spotlight; a faint silhouette is readable from the first
 *                   frame, so the opening is a held breath, never a void.
 *   1.60 – 3.75 s   the cover slides off the tail; the Rosso Corsa nose, then
 *                   the front clamshell, then the cabin emerge from the dark.
 *   3.75 – 4.60 s   fully revealed, front three-quarter — the hero angle.
 *   4.60 – 5.70 s   the camera walks onto the flank: side profile.
 *   5.70 – 7.10 s   rear three-quarter; the strut-mounted aerofoil enters frame.
 *   7.10 – 8.60 s   dead rear — full-width lamp band, engine bay grille.
 *   8.60 – 10.0 s   rear three-quarter, opposite side, settling to rest.
 *
 * The clip is a single continuous camera move of roughly 200° of azimuth: it
 * begins at the front three-quarter and ends at the rear three-quarter. It does
 * not, and cannot, complete a 360° — the last frame to reach the nose does not
 * exist in the source. `FILM_ARC` records the covered angle honestly so the HUD
 * can state it rather than quietly imply more than the footage shows.
 *
 * To swap in a longer or true-360 take, drop the new file at the same path and
 * adjust ONLY `SECONDS` / `COVER_OFF` / `ARC_DEGREES` below. Every phase,
 * caption and label in the experience is expressed in story fractions, so the
 * whole choreography re-derives itself from those three numbers.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TIME WARP
 * ────────────────────────────────────────────────────────────────────────────
 * Scroll maps linearly onto `TIME_WARP`, a monotone cubic that maps story
 * position 0 → 1 onto video time. It is a pure function of scroll position, so
 * reversing the scroll reverses the film exactly, with no history.
 *
 * The warp exists because the footage's beats and the editorial beats do not
 * happen at the same rate:
 *   • 0.00 – 0.15  roughly 1:1 — the mystery should feel unhurried
 *   • 0.15 – 0.30  ~1.5× faster — the cover leaving should feel decisive
 *   • 0.30 – 0.90  ~1.0× — the orbit gets the bulk of the scroll
 *   • 0.90 – 1.00  ~0.45× — the hero frame decelerates into stillness
 */

import { MonotoneTrack } from '../scroll/track.ts';

/** Normalised duration of the shipped clip. Overwritten from real metadata. */
export const SECONDS = 10;

/** Frame interval of the shipped clip. Used to threshold redundant seeks. */
export const FPS = 24;

/** Video time at which the last of the silk leaves the bodywork. */
export const COVER_OFF = 3.75;

/**
 * Degrees of azimuth the camera actually travels across the clip. Measured
 * from the footage: roughly 200°. Stated rather than implied.
 */
export const ARC_DEGREES = 200;

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export type PhaseId = 'mystery' | 'reveal' | 'orbit' | 'hero';

export interface Phase {
  id: PhaseId;
  index: string;
  /** Closed interval in story position, 0 → 1. */
  from: number;
  to: number;
  /** 'headline' is the big editorial lock-up; 'kicker' stays out of the way. */
  display: 'headline' | 'kicker';
  /** Set in the small mono eyebrow. Never repeats the headline. */
  label: string;
  title?: string[];
  titleAccent?: string[];
  meta?: string;
  /** Story position over which this phase fades up. */
  fadeIn: [number, number];
  /** Story position over which this phase fades out. Equal values = holds on. */
  fadeOut: [number, number];
}

/**
 * The four beats. Bounds are the *narrative* ones from the brief; the time warp
 * below is authored so the footage agrees with them.
 *
 * The fade windows are written out rather than derived, because editorial
 * pacing is not a function of anything — they are the difference between a
 * title that reads as part of the film and one that reads as a notification.
 * Neighbouring windows overlap by a fraction of a percent on purpose: that
 * overlap is a dissolve, and a dissolve is what keeps a title change from
 * reading as a cut.
 */
export const PHASES: Phase[] = [
  {
    id: 'mystery',
    index: '01',
    from: 0,
    to: 0.15,
    display: 'headline',
    label: 'The Mystery',
    title: ['Ferrari Classics'],
    meta: 'Maranello, Italy — 1987',
    // Already ~fully up at scroll zero. The visitor arrives on a black frame,
    // and arriving on a black frame with nothing on it reads as a broken page
    // rather than as a held breath.
    fadeIn: [-0.03, 0.004],
    fadeOut: [0.106, 0.148],
  },
  {
    id: 'reveal',
    index: '02',
    from: 0.15,
    to: 0.3,
    display: 'headline',
    label: 'The Reveal',
    title: ['A Legend'],
    titleAccent: ['Revealed.'],
    fadeIn: [0.136, 0.178],
    fadeOut: [0.252, 0.294],
  },
  {
    id: 'orbit',
    index: '03',
    from: 0.3,
    to: 0.9,
    display: 'kicker',
    label: 'The Machine',
    title: ['The Machine'],
    meta: `${ARC_DEGREES}° of camera · one continuous move`,
    fadeIn: [0.284, 0.328],
    // Still gone well before the hero lock-up arrives, so nothing is ever loud
    // twice at the same scroll position.
    fadeOut: [0.858, 0.898],
  },
  {
    id: 'hero',
    index: '04',
    from: 0.9,
    to: 1,
    display: 'headline',
    label: 'The Final Frame',
    title: ['Ferrari F40'],
    titleAccent: ['Born to be driven.'],
    meta: 'Maranello · Italy · 1987',
    fadeIn: [0.888, 0.934],
    fadeOut: [1, 1],
  },
];

export function phaseAt(story: number): Phase {
  for (let i = PHASES.length - 1; i >= 0; i--) {
    if (story >= PHASES[i].from) return PHASES[i];
  }
  return PHASES[0];
}

// ---------------------------------------------------------------------------
// Orbit labels
// ---------------------------------------------------------------------------

export interface OrbitLabel {
  id: string;
  /** Closed interval in story position. */
  from: number;
  to: number;
  /** Short lead-in, set in mono small caps. */
  key: string;
  /** The line beneath it. */
  line: string;
  /** Which margin the label occupies — kept away from the car's centre band. */
  side: 'left' | 'right';
}

/**
 * Anchored to measured video times, expressed in story fractions so they travel
 * with the warp. Each one sits over a frame where that part of the car is
 * genuinely presented — no marker ever points at something the camera is not
 * showing.
 *
 *   FRONT  t ≈ 3.9 – 4.6   front three-quarter, nose down, pop-up lamp line
 *   SIDE   t ≈ 5.7 – 6.5   full flank, side intake and sill both readable
 *   REAR   t ≈ 7.7 – 8.6   rear three-quarter into dead rear — wing, grille,
 *                          full-width lamp band
 *   F40    t ≈ 8.9 – 9.5   the settle; the whole car in one composition
 */
export const ORBIT_LABELS: OrbitLabel[] = [
  { id: 'front', from: 0.322, to: 0.4, key: 'Front', line: 'Pure intention', side: 'right' },
  { id: 'side', from: 0.468, to: 0.556, key: 'Side', line: 'Form follows function', side: 'left' },
  { id: 'rear', from: 0.645, to: 0.738, key: 'Rear', line: 'Engineered to perform', side: 'right' },
  { id: 'f40', from: 0.796, to: 0.882, key: 'F40', line: 'An unfiltered driving machine', side: 'left' },
];

export function labelAt(story: number): OrbitLabel | null {
  for (const l of ORBIT_LABELS) if (story >= l.from && story <= l.to) return l;
  return null;
}

// ---------------------------------------------------------------------------
// Time warp
// ---------------------------------------------------------------------------

/**
 * story position → fraction of the clip. Monotone by construction, so video
 * time can never reverse while scroll position advances — the two can only
 * ever disagree at the sub-frame level.
 */
export const TIME_WARP = new MonotoneTrack([
  { t: 0, v: 0 },
  { t: 0.06, v: 0.058 },
  { t: 0.15, v: 0.155 },
  { t: 0.3, v: 0.378 }, // cover fully off, exactly at the end of the reveal
  { t: 0.47, v: 0.56 }, // flank
  { t: 0.64, v: 0.755 }, // rear three-quarter
  { t: 0.78, v: 0.875 }, // dead rear
  { t: 0.9, v: 0.955 },
  { t: 1, v: 1 },
]);

/** Story position → seconds of video. */
export function timeAt(story: number, duration = SECONDS): number {
  return TIME_WARP.at(Math.min(Math.max(story, 0), 1)) * duration;
}

/** Seconds of video → story position. Inverse of the warp, for readouts. */
export function storyAt(seconds: number, duration = SECONDS): number {
  if (duration <= 0) return 0;
  const f = Math.min(Math.max(seconds / duration, 0), 1);
  // MonotoneTrack has no inverse; a fixed-point solve is exact enough at 12
  // iterations and only ever runs on a click, never per frame.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) * 0.5;
    if (TIME_WARP.at(mid) < f) lo = mid;
    else hi = mid;
  }
  return (lo + hi) * 0.5;
}

// ---------------------------------------------------------------------------
// Readouts
// ---------------------------------------------------------------------------

export function timecode(seconds: number): string {
  const s = Math.max(0, seconds);
  const whole = Math.floor(s);
  const frames = Math.floor((s - whole) * FPS);
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}:${String(
    frames,
  ).padStart(2, '0')}`;
}

/** Story position → the phase label shown in the chrome. */
export function phaseLabelAt(story: number): string {
  return phaseAt(story).id.toUpperCase();
}