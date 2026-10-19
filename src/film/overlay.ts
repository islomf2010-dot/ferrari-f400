import { ORBIT_LABELS, PHASES, phaseAt, timecode } from './timeline.ts';
import type { FilmClock } from './useFilmClock.ts';

/**
 * Everything the film draws on top of itself.
 *
 * All of it is written straight to the DOM from the one rAF tick the scroll
 * driver already runs — no React state, no re-render, no second animation loop.
 * Each writer caches the last value it applied and skips the write when nothing
 * has moved by a meaningful amount, so a stationary scroll costs essentially
 * zero style recalculation.
 *
 * The only layout-affecting properties ever written are `transform` and
 * `opacity`, both compositor-only, so the overlay stays on the GPU even while
 * the video is being re-decoded underneath it.
 */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** A smoothstep shoulder from 0 at `a` to 1 at `b`. */
function shoulder(x: number, a: number, b: number): number {
  if (x <= a) return 0;
  if (x >= b) return 1;
  const u = (x - a) / (b - a || 1);
  return u * u * (3 - 2 * u);
}

export interface OverlayRefs {
  phases: React.RefObject<HTMLDivElement | null>[];
  labels: React.RefObject<HTMLDivElement | null>[];
  rail: React.RefObject<HTMLDivElement | null>;
  percent: React.RefObject<HTMLSpanElement | null>;
  tc: React.RefObject<HTMLSpanElement | null>;
  phaseName: React.RefObject<HTMLSpanElement | null>;
  phaseIndex: React.RefObject<HTMLSpanElement | null>;
  hint: React.RefObject<HTMLDivElement | null>;
}

const SLOTS = PHASES.length + ORBIT_LABELS.length;

export class FilmOverlay {
  private lastOpacity = new Float64Array(SLOTS).fill(-1);
  private lastShift = new Float64Array(SLOTS).fill(Number.NaN);
  private lastRail = -1;
  private lastPercent = '';
  private lastTc = '';
  private lastPhase = '';
  private lastHint = false;

  constructor(private refs: OverlayRefs) {}

  update(clock: FilmClock): void {
    const s = clock.story;

    // ── Phase typography ───────────────────────────────────────────────
    for (let i = 0; i < PHASES.length; i++) {
      const node = this.refs.phases[i]?.current;
      if (!node) continue;
      const p = PHASES[i];
      const up = shoulder(s, p.fadeIn[0], p.fadeIn[1]);
      const down = p.fadeOut[0] === p.fadeOut[1] ? 1 : 1 - shoulder(s, p.fadeOut[0], p.fadeOut[1]);
      const opacity = up * down;
      // A slow rise, eased by scroll velocity so the type leans into the
      // direction of travel and settles the instant the visitor stops.
      const shift = lerp(16, 0, opacity) - clamp(clock.velocity, -2.5, 2.5) * 5;
      this.write(i, node, opacity, shift);
    }

    // ── Orbit labels ───────────────────────────────────────────────────
    for (let i = 0; i < ORBIT_LABELS.length; i++) {
      const node = this.refs.labels[i]?.current;
      if (!node) continue;
      const l = ORBIT_LABELS[i];
      const span = l.to - l.from;
      // Shorter shoulders than the phase titles: a label is punctuation, not a
      // beat, and it has to be gone before the next one arrives.
      const up = shoulder(s, l.from, l.from + span * 0.26);
      const down = 1 - shoulder(s, l.to - span * 0.26, l.to);
      const opacity = up * down;
      const shift = lerp(l.side === 'left' ? -18 : 18, 0, opacity);
      this.write(PHASES.length + i, node, opacity, shift);
    }

    // ── Chrome ─────────────────────────────────────────────────────────
    const rail = this.refs.rail.current;
    if (rail && Math.abs(this.lastRail - s) > 0.0008) {
      this.lastRail = s;
      rail.style.transform = `scaleX(${s.toFixed(4)})`;
    }

    const pct = this.refs.percent.current;
    if (pct) {
      const value = (s * 100).toFixed(1).padStart(5, '0');
      if (value !== this.lastPercent) {
        this.lastPercent = value;
        pct.textContent = value;
      }
    }

    const tc = this.refs.tc.current;
    if (tc) {
      const value = timecode(clock.seconds);
      if (value !== this.lastTc) {
        this.lastTc = value;
        tc.textContent = value;
      }
    }

    const phase = phaseAt(s);
    if (phase.id !== this.lastPhase) {
      this.lastPhase = phase.id;
      if (this.refs.phaseName.current) this.refs.phaseName.current.textContent = phase.id;
      if (this.refs.phaseIndex.current) this.refs.phaseIndex.current.textContent = phase.index;
    }

    // The scroll affordance only exists at the very top of the film. Once the
    // visitor has started running it, it never nags them again.
    const hintOn = s < 0.02;
    if (hintOn !== this.lastHint) {
      this.lastHint = hintOn;
      this.refs.hint.current?.classList.toggle('is-on', hintOn);
    }
  }

  private write(slot: number, node: HTMLElement, opacity: number, shift: number): void {
    // 0.004 of opacity is about one 8-bit step: below that the change cannot be
    // seen, and skipping it is what keeps the overlay free during a scrub.
    if (Math.abs(this.lastOpacity[slot] - opacity) > 0.004) {
      this.lastOpacity[slot] = opacity;
      const hidden = opacity < 0.004;
      node.style.opacity = opacity.toFixed(3);
      node.style.visibility = hidden ? 'hidden' : 'visible';
      node.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    }
    if (Math.abs(this.lastShift[slot] - shift) > 0.08) {
      this.lastShift[slot] = shift;
      node.style.transform = `translate3d(0, ${shift.toFixed(2)}px, 0)`;
    }
  }

  reset(): void {
    this.lastOpacity.fill(-1);
    this.lastShift.fill(Number.NaN);
    this.lastRail = -1;
    this.lastPercent = '';
    this.lastTc = '';
    this.lastPhase = '';
    this.lastHint = false;
  }
}