import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { FPS, SECONDS, timeAt } from './timeline.ts';

gsap.registerPlugin(ScrollTrigger);

/**
 * THE SCRUB ENGINE
 * ────────────────────────────────────────────────────────────────────────────
 * One scroll listener for the entire page. One rAF for the entire page. Every
 * other consumer — the video element, the phase typography, the orbit labels,
 * the progress rule, the timecode — is a pure function of the single number
 * this produces. That is why nothing can fight anything else, and why scrolling
 * back up replays the film in reverse for free.
 *
 *   scroll position ──► ScrollTrigger scrub ──► story 0…1
 *                                              │
 *                        ┌─────────────────────┼─────────────────────┐
 *                        ▼                     ▼                     ▼
 *               video.currentTime        phase / label          progress rule
 *                                          opacity
 *
 * Why a scrubbed tween and not `onUpdate`: GSAP's `scrub` already damps the raw
 * scroll position with a critically-damped follower, so `tween.progress()` *is*
 * the smoothed signal — velocity-weighted, and settled rather than snapping when
 * the wheel stops. `onUpdate` would hand over the raw undamped value and make us
 * rebuild that smoothing ourselves, badly.
 *
 * `scrub: 0.55` is small enough that the film still lands on the frame the
 * visitor asked for within a few hundred milliseconds of them stopping, and
 * large enough that the film reads as a camera being pushed rather than a video
 * being played. It is symmetric, so reversing the scroll reverses the motion
 * identically.
 *
 * The video element is never played. `currentTime` is written, at most once per
 * frame, and only when the delta exceeds half a frame — below that the browser
 * would decode a frame nobody can see, and on an iGPU those wasted decodes are
 * exactly what turns a scrub into a stutter.
 */

export interface FilmClock {
  /** Smoothed story position, 0 → 1. */
  story: number;
  /** Target video time in seconds. */
  seconds: number;
  /** Story-time units per second, smoothed. Positive = scrolling down. */
  velocity: number;
  /** Real duration of the loaded encode. */
  duration: number;
}

export interface FilmDriverOptions {
  section: React.RefObject<HTMLElement | null>;
  enabled: boolean;
  /** Real duration, once the metadata has landed. */
  duration: number;
  onFrame?: (clock: FilmClock) => void;
}

export function useFilmClock({ section, enabled, duration, onFrame }: FilmDriverOptions): FilmClock {
  const clock = useRef<FilmClock>({
    story: 0,
    seconds: 0,
    velocity: 0,
    duration,
  });

  // The real duration replaces the authored constant as soon as metadata lands,
  // so the timecode and the seek limit are driven by the file and not by us.
  useEffect(() => {
    if (Number.isFinite(duration) && duration > 0) clock.current.duration = duration;
  }, [duration]);

  // Held in a ref so the rAF callback never closes over stale React state and
  // never has to be torn down and rebuilt on every render.
  const frameRef = useRef(onFrame);
  frameRef.current = onFrame;

  useEffect(() => {
    const el = section.current;
    if (!el || !enabled) return;

    const proxy = { t: 0 };
    const state = clock.current;

    const tween = gsap.to(proxy, {
      t: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: el,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.55,
        invalidateOnRefresh: true,
        fastScrollEnd: true,
      },
    });

    let last = 0;

    const tick = () => {
      const story = tween.progress();
      const now = performance.now();
      const dt = last ? (now - last) / 1000 : 0;
      last = now;

      // Velocity is only used to scale the overlay's kinetic offsets; it is
      // damped so a trackpad flick does not shake the typography.
      const instant = dt > 0 ? (story - state.story) / dt : 0;
      state.velocity += (instant - state.velocity) * Math.min(1, dt * 8);

      state.story = story;
      state.seconds = timeAt(story, state.duration);
      frameRef.current?.(state);
    };

    gsap.ticker.add(tick);

    // One refresh after fonts and the stills have landed, so the trigger
    // measures the final document height rather than a mid-layout one.
    const refresh = () => ScrollTrigger.refresh();
    const id = window.setTimeout(refresh, 500);
    window.addEventListener('load', refresh, { once: true });

    return () => {
      window.clearTimeout(id);
      window.removeEventListener('load', refresh);
      gsap.ticker.remove(tick);
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [section, enabled]);

  return clock.current;
}

// ---------------------------------------------------------------------------
// Seeking
// ---------------------------------------------------------------------------

/**
 * Writes `currentTime`, but only when it is worth a decode.
 *
 * A paused video given a `currentTime` inside the frame it is already showing
 * still re-enters the demuxer and the decoder. During a fast scrub that is up
 * to sixty wasted decodes per second on a machine with no spare GPU. Half a
 * frame is the smallest difference a visitor could possibly see.
 *
 * Returns true if a seek was issued.
 */
export function seekTo(video: HTMLVideoElement | null, seconds: number, duration: number): boolean {
  if (!video || !Number.isFinite(seconds)) return false;
  // HAVE_CURRENT_DATA. Seeking below this makes the browser drop the frame it
  // is showing and wait on the network, which is the one thing that produces a
  // visible black flash mid-scrub.
  if (video.readyState < 2) return false;

  // Never target the exact end: engines disagree about whether a seek to
  // `duration` clamps or throws. Half a frame short lands on the final frame.
  const limit = Math.max(0, duration - 0.5 / FPS);
  const target = Math.min(Math.max(seconds, 0), limit);
  if (Math.abs(video.currentTime - target) < 0.5 / FPS) return false;

  try {
    video.currentTime = target;
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export type FilmStatus = 'loading' | 'ready' | 'failed';

/**
 * Watches a video element for the two events the film actually cares about:
 * enough data to render, and enough data to scrub anywhere without touching the
 * network. `canplaythrough` is the one that matters — a film that scrubs off
 * the buffered range freezes mid-gesture, which is the worst failure this
 * design can have.
 */
export function useFilmReadiness(video: React.RefObject<HTMLVideoElement | null>): {
  state: FilmStatus;
  progress: number;
  duration: number;
} {
  const [state, setState] = useState<FilmStatus>('loading');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(SECONDS);

  useEffect(() => {
    const el = video.current;
    if (!el) return;

    let settled = false;
    const settle = (next: FilmStatus) => {
      if (settled) return;
      settled = true;
      setState(next);
    };

    const onMeta = () => {
      const d = el.duration;
      if (Number.isFinite(d) && d > 0) setDuration(d);
    };
    const onProgress = () => {
      if (!el.buffered.length) return;
      // buffered.end(last) is the furthest point the browser can decode to
      // without a round trip — the honest measure of "can I scrub anywhere".
      const end = el.buffered.end(el.buffered.length - 1);
      if (end > 0) setProgress(Math.min(1, end / (el.duration || 1)));
    };
    const onReady = () => {
      onMeta();
      onProgress();
      settle('ready');
    };
    const onError = () => settle('failed');
    // A decode can fail after the element reported ready — a corrupt packet, a
    // mid-stream network cut. Last line of defence.
    const onStall = () => {
      if (el.networkState === el.NETWORK_NO_SOURCE) settle('failed');
    };

    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('durationchange', onMeta);
    el.addEventListener('progress', onProgress);
    el.addEventListener('canplaythrough', onReady);
    el.addEventListener('canplay', onProgress);
    el.addEventListener('loadeddata', onProgress);
    el.addEventListener('error', onError);
    el.addEventListener('stalled', onStall);

    // A warm cache: `readyState` is authoritative.
    if (el.readyState >= 3) onReady();
    if (el.error) onError();

    return () => {
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('durationchange', onMeta);
      el.removeEventListener('progress', onProgress);
      el.removeEventListener('canplaythrough', onReady);
      el.removeEventListener('canplay', onProgress);
      el.removeEventListener('loadeddata', onProgress);
      el.removeEventListener('error', onError);
      el.removeEventListener('stalled', onStall);
    };
  }, [video]);

  return { state, progress, duration };
}