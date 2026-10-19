import { useEffect, useMemo, useRef, useState } from 'react';

import { FilmStage, type FilmStatus } from './film/FilmStage.tsx';
import { Ambience } from './lib/audio.ts';
import { useReducedMotion } from './lib/useReducedMotion.ts';
import { Loader } from './ui/Loader.tsx';
import { Masthead } from './ui/Masthead.tsx';
import { Story } from './ui/Story.tsx';

export default function App() {
  const section = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();

  const ambience = useMemo(() => new Ambience(), []);
  const [film, setFilm] = useState<{ status: FilmStatus; progress: number }>({
    status: 'loading',
    progress: 0,
  });
  const [curtain, setCurtain] = useState(true);

  // Hold the curtain long enough for the opening to read as a fade-up, not a
  // flash. Shorter when the visitor has asked for reduced motion.
  useEffect(() => {
    if (film.status === 'loading') return;
    const wait = film.status === 'failed' ? 400 : reducedMotion ? 180 : 850;
    const id = window.setTimeout(() => setCurtain(false), wait);
    return () => window.clearTimeout(id);
  }, [film.status, reducedMotion]);

  // Hand the static curtain in index.html over to the React one, so there is
  // never a black frame between the two.
  useEffect(() => {
    const boot = document.getElementById('boot');
    if (!boot) return;
    boot.classList.add('is-done');
    const id = window.setTimeout(() => boot.remove(), 700);
    return () => window.clearTimeout(id);
  }, []);

  // Keyboard: Home / End move cleanly to either end of the film.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== 'Home' && event.key !== 'End') return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      event.preventDefault();
      window.scrollTo({
        top: event.key === 'Home' ? 0 : document.body.scrollHeight,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reducedMotion]);

  const mode: 'scrub' | 'still' = reducedMotion || film.status === 'failed' ? 'still' : 'scrub';

  return (
    <>
      <Masthead ambience={ambience} />

      <main>
        <section
          className={`film${mode === 'still' ? ' film--still' : ''}`}
          id="reveal"
          ref={section}
          aria-label="The reveal — scroll to run the film"
        >
          <FilmStage section={section} mode={mode} onStatus={setFilm} />
        </section>

        <Story />
      </main>

      <Loader
        visible={curtain}
        progress={film.status === 'failed' ? 1 : film.progress}
        label={labelFor(film.progress, film.status)}
        detail={film.status === 'failed' ? 'Film unavailable — showing the still' : null}
      />
    </>
  );
}

function labelFor(progress: number, status: FilmStatus): string {
  if (status === 'failed') return 'Film unavailable';
  if (progress > 0.92) return 'Buffering the full take';
  if (progress > 0.5) return 'Loading the orbit';
  if (progress > 0.12) return 'Loading the reveal';
  return 'Requesting the film';
}