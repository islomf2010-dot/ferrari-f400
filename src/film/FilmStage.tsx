import { createRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { FilmOverlay, type OverlayRefs } from './overlay.ts';
import { ARC_DEGREES, ORBIT_LABELS, PHASES } from './timeline.ts';
import {
  seekTo,
  useFilmClock,
  useFilmReadiness,
  type FilmClock,
  type FilmStatus,
} from './useFilmClock.ts';
import { CLIP_1080, CLIP_720, KEYART, POSTER, describeFailure, pickClip } from '../lib/media.ts';

export type { FilmStatus };

interface FilmStageProps {
  /** The tall section the ScrollTrigger measures. Owned by `App`. */
  section: React.RefObject<HTMLElement | null>;
  /** `scrub` is the film. `still` is the reduced-motion / failed-film fallback. */
  mode: 'scrub' | 'still';
  /** Reports buffering to the page so the curtain can show a real number. */
  onStatus?: (status: { status: FilmStatus; progress: number }) => void;
}

/**
 * THE STAGE
 *
 * A `position: sticky` viewport inside a tall section. Sticky rather than a
 * pinned ScrollTrigger transform because it hands the compositing back to the
 * browser: no per-frame transform on a wrapper, no `will-change` to fight with,
 * and the video stays on its own layer for the entire film.
 *
 * Stacking order, bottom to top:
 *   key art → film → colour grade → lens vignette → scrims → grain → type
 *
 * Nothing sits on top of the car except a caption the film itself asked for.
 */
export function FilmStage({ section, mode, onStatus }: FilmStageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const clip = useMemo(() => pickClip(), []);
  const readiness = useFilmReadiness(videoRef);
  const { state, duration, progress } = readiness;
  const [downgraded, setDowngraded] = useState(false);
  const [playing, setPlaying] = useState(false);

  // One ref slot per phase and per orbit label, created once so the overlay can
  // hold a stable array and React never has to re-key anything mid-scrub.
  const overlayRefs = useMemo<OverlayRefs>(() => {
    return {
      phases: PHASES.map(() => createRef<HTMLDivElement>()),
      labels: ORBIT_LABELS.map(() => createRef<HTMLDivElement>()),
      rail: createRef<HTMLDivElement>(),
      percent: createRef<HTMLSpanElement>(),
      tc: createRef<HTMLSpanElement>(),
      phaseName: createRef<HTMLSpanElement>(),
      phaseIndex: createRef<HTMLSpanElement>(),
      hint: createRef<HTMLDivElement>(),
    };
  }, []);

  const overlay = useMemo(() => new FilmOverlay(overlayRefs), [overlayRefs]);

  const failed = state === 'failed';
  const still = mode === 'still' || failed;
  const scrubbing = mode === 'scrub' && state === 'ready';

  // Buffering is reported upward purely so the curtain can show a real
  // percentage. Routed through a ref so the effect never re-subscribes.
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;
  useEffect(() => {
    statusRef.current?.({ status: state, progress });
  }, [state, progress]);

  // ── The only place video.currentTime is ever written ──────────────────
  const onFrame = useCallback(
    (clock: FilmClock) => {
      overlay.update(clock);
      if (scrubbing) seekTo(videoRef.current, clock.seconds, clock.duration);
    },
    [overlay, scrubbing],
  );

  useFilmClock({ section, enabled: scrubbing, duration, onFrame });

  // ── Silence, structurally ────────────────────────────────────────────
  // Three independent guarantees, because "the film must never make a sound"
  // is not a detail. The shipped encodes carry no audio track at all (asserted
  // by `npm run verify`); the element is `muted`; and its volume is pinned to
  // zero here, because `muted` is a property React writes through an attribute
  // and anything that later touches the element can undo it.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    el.volume = 0;
    el.defaultMuted = true;
  }, [clip.src, downgraded]);

  // ── Fallback ladder ───────────────────────────────────────────────────
  // The most common hard failure on a locked-down or old machine is a large
  // High-profile H.264 being refused rather than a missing file, so the first
  // retry is the smaller, more conservative encode, not giving up.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !failed || downgraded || clip.src !== CLIP_1080) return;
    const id = window.setTimeout(() => {
      setDowngraded(true);
      el.src = `${import.meta.env.BASE_URL}${CLIP_720}`;
      el.load();
    }, 900);
    return () => window.clearTimeout(id);
  }, [failed, downgraded, clip.src]);

  // ── Reduced-motion playback ───────────────────────────────────────────
  // The only sanctioned way the film is ever allowed to move by itself: the
  // visitor has asked for reduced motion, and then has pressed play.
  const toggle = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      el.currentTime = 0;
      setPlaying(false);
    } else {
      void el.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      );
    }
  }, [playing]);

  useEffect(() => {
    if (scrubbing) {
      videoRef.current?.pause();
      setPlaying(false);
    }
  }, [scrubbing]);

  // A tab that goes to the background must stop decoding. Coming back, the
  // rAF tick resumes on its own and re-seeks to wherever the scroll now is.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onVisibility = () => {
      if (document.hidden) el.pause();
      else if (playing) void el.play().catch(() => setPlaying(false));
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [playing]);

  const src = `${import.meta.env.BASE_URL}${clip.src}`;
  const gone = downgraded && clip.src === CLIP_720;

  return (
    <div className="film__viewport">
      <div className={still ? 'stage stage--still' : 'stage'}>
        {/* Key art. Sits under the film at all times: it is what the visitor
            sees while the clip streams in, and it is the fallback hero if the
            film never arrives. Pulled from the same take, so the handover to
            frame zero is a dissolve rather than a jump cut. */}
        <img
          className="stage__still"
          src={`${import.meta.env.BASE_URL}${KEYART}`}
          alt=""
          aria-hidden="true"
          decoding="async"
        />

        {!gone ? (
          <video
            className="stage__film"
            ref={videoRef}
            src={src}
            poster={`${import.meta.env.BASE_URL}${POSTER}`}
            preload="auto"
            muted
            playsInline
            disablePictureInPicture
            disableRemotePlayback
            controls={false}
            tabIndex={-1}
            aria-hidden="true"
            data-clip={clip.src === CLIP_1080 ? '1080p' : '720p'}
          />
        ) : null}

        {/* Colour grade and lens falloff: two composited layers, no post stack,
            so an iGPU can hold this at 60 fps while it also decodes video. */}
        <div className="stage__grade" />
        <div className="stage__vignette" />
        <div className="stage__scrim" />
        <div className="stage__grain" />
      </div>

      {/* ── Typography over the film ──────────────────────────────────── */}
      <div className="overlay">
        {PHASES.map((phase, i) => (
          <div
            key={phase.id}
            ref={overlayRefs.phases[i]}
            className={`beat beat--${phase.display}`}
            style={{ opacity: 0, visibility: 'hidden' }}
            aria-hidden="true"
          >
            {/* The numbered eyebrow belongs to the quiet beat only. On a
                headline it lands on the car's own lower bodywork, and the HUD
                already carries the phase name in the corner. */}
            {phase.display === 'kicker' ? (
              <p className="beat__index">
                <span>{phase.index}</span>
                <span className="rule" aria-hidden="true" />
                <span>{phase.label}</span>
              </p>
            ) : null}
            <h2 className="beat__title">
              {phase.title?.map((line) => (
                <span className="beat__line" key={line}>
                  {line}
                </span>
              ))}
              {phase.titleAccent?.map((line) => (
                <span className="beat__line beat__line--accent" key={line}>
                  {line}
                </span>
              ))}
            </h2>
            {phase.meta ? <p className="beat__meta">{phase.meta}</p> : null}
            {phase.id === 'hero' ? (
              <p className="beat__cue">
                <span className="beat__cue-line" aria-hidden="true" />
                Keep scrolling — the story
              </p>
            ) : null}
          </div>
        ))}

        <div className="labels">
          {ORBIT_LABELS.map((label, i) => (
            <div
              key={label.id}
              ref={overlayRefs.labels[i]}
              className={`label label--${label.side}`}
              style={{ opacity: 0, visibility: 'hidden' }}
              aria-hidden="true"
            >
              <span className="label__key">{label.key}</span>
              <span className="label__rule" aria-hidden="true" />
              <span className="label__line">{label.line}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Chrome ────────────────────────────────────────────────────── */}
      <div className="hud">
        <div className="hud__rail" aria-hidden="true">
          <div className="hud__rail-fill" ref={overlayRefs.rail} />
        </div>
        <div className="hud__row">
          <p className="hud__side">
            <span className="hud__index" ref={overlayRefs.phaseIndex}>
              {PHASES[0].index}
            </span>
            <span className="hud__phase" ref={overlayRefs.phaseName}>
              {PHASES[0].id}
            </span>
          </p>
          <p className="hud__arc">{`${ARC_DEGREES}° of camera · scrub with scroll`}</p>
          <p className="hud__side hud__side--right">
            <span className="hud__tc" ref={overlayRefs.tc}>
              00:00:00
            </span>
            <span className="hud__pct">
              <span ref={overlayRefs.percent}>000.0</span>
              <span className="hud__unit">%</span>
            </span>
          </p>
        </div>

        <div className="hint" ref={overlayRefs.hint} aria-hidden="true">
          <span className="hint__label">Scroll to run the film</span>
          <span className="hint__line" />
        </div>

        {still ? (
          <div className="still-cta">
            <p className="still-cta__note">
              {failed
                ? `${describeFailure(videoRef.current)} The still frame is shown in its place — the story below is unaffected.`
                : 'Reduced motion is on, so the film is held on a single frame.'}
            </p>
            <button type="button" className="btn" onClick={toggle} disabled={gone}>
              <span className="btn__glyph" aria-hidden="true">
                {playing ? (
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                    <rect x="4" y="3" width="3" height="10" />
                    <rect x="9" y="3" width="3" height="10" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                    <path d="M4 2.6 13 8l-9 5.4z" />
                  </svg>
                )}
              </span>
              {playing ? 'Stop' : 'Play the reveal once'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}