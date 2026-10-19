import { AMBIENCE } from './media.ts';

/**
 * The cinematic sound mode.
 *
 * The film itself is scrubbed, so its own audio track was deliberately left out
 * of the shipped encode and the element is permanently muted: seeking a video
 * back and forth shreds an audio track into clicks and gaps. The soundtrack is
 * therefore a *separate* file that only ever plays forwards, loops, and is never
 * touched by the scroll timeline.
 *
 * It never starts on its own. `toggle()` is only ever called from a click, and
 * every browser's autoplay policy is satisfied by that gesture.
 *
 * Fading is done on `HTMLMediaElement.volume` rather than through a Web Audio
 * graph: no second audio context to resume, no MediaElementSource to get stuck
 * once created, and it degrades to a hard stop where the API is missing.
 */
export class Ambience {
  private el: HTMLAudioElement | null = null;
  private raf = 0;
  private wanted = false;
  private failed = false;

  /** True when the sound bed is switched on. */
  get playing(): boolean {
    return this.wanted && !this.failed;
  }

  /** Why the bed could not start, if it ever could not. */
  get error(): string | null {
    return this.failed ? 'The ambience track could not be played.' : null;
  }

  private ensure(): HTMLAudioElement | null {
    if (this.el) return this.el;
    if (typeof Audio === 'undefined' || typeof document === 'undefined') return null;
    const el = new Audio();
    el.preload = 'none';
    el.loop = true;
    el.volume = 0;
    el.setAttribute('aria-hidden', 'true');
    el.dataset.role = 'cinematic-sound';
    // Two containers, one AAC and one MP3: whichever the browser will take.
    // `audio.src` takes a single URL, so the first is used and the second is
    // swapped in by the error handler below.
    el.src = `${import.meta.env.BASE_URL}${AMBIENCE[0]}`;
    el.addEventListener('error', () => {
      if (!this.el || this.el.src.endsWith(AMBIENCE[1])) return;
      this.el.src = `${import.meta.env.BASE_URL}${AMBIENCE[1]}`;
      this.el.load();
      if (this.wanted) void this.el.play().catch(() => undefined);
    });
    // Attached to the document rather than left detached: an element in the
    // tree is inspectable, cannot be reaped by a media-element cache, and can
    // be switched off from devtools if a user ever needs to.
    document.body.appendChild(el);
    this.el = el;
    return el;
  }

  /** Toggles the bed and resolves to the state the button should display. */
  async toggle(): Promise<boolean> {
    if (this.wanted) {
      this.stop();
      return false;
    }
    return this.start();
  }

  private async start(): Promise<boolean> {
    const el = this.ensure();
    if (!el) return false;
    this.fadeTo(1, 1.4);
    try {
      el.volume = 0;
      await el.play();
      this.wanted = true;
      this.failed = false;
      return true;
    } catch {
      // A blocked play() is a legitimate outcome, not a crash: leave the button
      // off and let the film stay silent.
      this.wanted = false;
      this.failed = true;
      return false;
    }
  }

  private stop(): void {
    this.wanted = false;
    const el = this.el;
    if (!el) return;
    this.fadeTo(0, 0.6, () => el.pause());
  }

  private fadeTo(to: number, seconds: number, done?: () => void): void {
    const el = this.el;
    if (!el) {
      done?.();
      return;
    }
    if (this.raf) cancelAnimationFrame(this.raf);
    const from = el.volume;
    const start = performance.now();
    const tick = (now: number) => {
      const u = Math.min((now - start) / (seconds * 1000), 1);
      el.volume = from + (to - from) * u;
      if (u < 1) this.raf = requestAnimationFrame(tick);
      else {
        this.raf = 0;
        done?.();
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Pauses the bed when the tab is hidden; resumes it when it comes back. */
  syncVisibility(): void {
    if (!this.el || !this.wanted) return;
    if (document.hidden) this.el.pause();
    else void this.el.play().catch(() => undefined);
  }

  dispose(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    const el = this.el;
    this.el = null;
    this.wanted = false;
    if (!el) return;
    el.pause();
    el.removeAttribute('src');
    el.load();
    el.remove();
  }
}