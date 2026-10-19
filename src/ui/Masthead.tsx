import { useCallback, useEffect, useRef, useState } from 'react';

import { NAV, SITE } from '../content.ts';
import type { Ambience } from '../lib/audio.ts';

interface MastheadProps {
  ambience: Ambience;
}

/**
 * Minimal chrome: the mark, three anchors, one control.
 *
 * Hairline-thin, fixed, and never more than one row tall. Inside the film the
 * section links retire — there is nowhere to navigate to while a film is
 * running, and three words over the car is three words too many — but the mark
 * and the sound control stay exactly where they are, because the visitor has to
 * be able to reach the soundtrack from the frame they are watching.
 */
export function Masthead({ ambience }: MastheadProps) {
  const rootRef = useRef<HTMLElement>(null);
  const [sound, setSound] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Retires the section links for exactly the length of the film. Measured from
  // live rects rather than offsetTop, which is relative to whichever ancestor
  // happens to be positioned and is therefore not the document offset.
  useEffect(() => {
    let frame = 0;
    let last: boolean | null = null;
    const tick = () => {
      frame = 0;
      const film = document.getElementById('reveal');
      const story = document.getElementById('machine');
      if (!film || !story) return;
      const y = window.scrollY;
      const top = film.getBoundingClientRect().top + y;
      const bottom = story.getBoundingClientRect().top + y;
      // A 96 px hysteresis band at each end, so a scroll resting exactly on the
      // boundary cannot make the header flicker.
      const inside = y > top + 96 && y < bottom - 96;
      if (inside !== last) {
        last = inside;
        rootRef.current?.classList.toggle('is-film', inside);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    tick();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  // Never leave audio running behind a hidden tab.
  useEffect(() => {
    const onVisibility = () => ambience.syncVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [ambience]);

  const onSound = useCallback(async () => {
    const on = await ambience.toggle();
    setSound(on);
    setNote(on ? null : ambience.error);
  }, [ambience]);

  useEffect(() => () => ambience.dispose(), [ambience]);

  return (
    <header className="masthead" ref={rootRef}>
      <a className="masthead__mark" href="#reveal" aria-label={`${SITE.marque} ${SITE.model} — back to the reveal`}>
        <span className="masthead__model">{SITE.model}</span>
        <span className="masthead__year">{SITE.year}</span>
      </a>

      <nav className="masthead__nav" aria-label="Sections">
        {NAV.map((item) => (
          <a key={item.id} href={`#${item.id}`}>
            {item.label}
          </a>
        ))}
      </nav>

      <button
        type="button"
        className={`sound${sound ? ' is-on' : ''}`}
        onClick={() => void onSound()}
        aria-pressed={sound}
        aria-label={sound ? 'Turn the sound off' : 'Turn the sound on'}
        title={sound ? 'Sound on' : 'Sound off'}
      >
        <span className="sound__bars" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="sound__label">{sound ? 'Sound' : 'Muted'}</span>
      </button>

      <p className="sr-only" role="status" aria-live="polite">
        {note ?? (sound ? 'Cinematic sound on' : 'Cinematic sound off')}
      </p>
    </header>
  );
}