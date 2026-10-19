/**
 * The media manifest and the small amount of capability detection the film
 * needs before it can start.
 *
 * The two encodes are the same film at two sizes. Both are H.264 in a faststart
 * MP4 with a closed GOP of twelve frames, which is the property that actually
 * matters here: any exact seek costs at most eleven frames of decode, so
 * scrubbing never has to jump a keyframe and never stutters.
 *
 * Nothing here is base64 and nothing is inlined — both are ordinary files in
 * `public/`, streamed by the browser's media stack with range requests, so the
 * page never blocks on them and memory stays flat.
 */

export const CLIP_1080 = 'media/f40-reveal-1080.mp4';
export const CLIP_720 = 'media/f40-reveal-720.mp4';
export const POSTER = 'media/f40-poster.jpg';
export const KEYART = 'media/f40-keyart.jpg';
export const AMBIENCE = ['media/f40-ambient.m4a', 'media/f40-ambient.mp3'] as const;

/** Below this device-pixel width the 720p encode is the better download. */
const WIDE_THRESHOLD = 1500;

/**
 * Picks an encode from the *rendered* pixel width rather than the CSS width, so
 * a 3× phone never pulls a 1080p file it cannot show, and a 1.5× laptop does.
 */
export function pickClip(): { src: string; label: '1080p' | '720p' } {
  const forced = new URLSearchParams(window.location.search).get('clip');
  if (forced === '720') return { src: CLIP_720, label: '720p' };
  if (forced === '1080') return { src: CLIP_1080, label: '1080p' };
  if (typeof window === 'undefined') return { src: CLIP_1080, label: '1080p' };

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  if (coarse || window.innerWidth * dpr < WIDE_THRESHOLD) return { src: CLIP_720, label: '720p' };
  return { src: CLIP_1080, label: '1080p' };
}

export type FilmStatus = 'loading' | 'ready' | 'failed';

/**
 * One place for the film's failure vocabulary. A hard failure never leaves the
 * visitor with a black rectangle: the stage falls back to the key art and the
 * whole site stays readable.
 */
export function describeFailure(video: HTMLVideoElement | null): string {
  if (!video) return 'The film could not be started.';
  const err = video.error;
  if (!err) return 'The film could not be decoded.';
  switch (err.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'Loading the film was interrupted.';
    case MediaError.MEDIA_ERR_NETWORK:
      return 'The film could not be downloaded. Check your connection.';
    case MediaError.MEDIA_ERR_DECODE:
      return 'This browser could not decode the film.';
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'This browser cannot play the film format.';
    default:
      return 'The film could not be played.';
  }
}