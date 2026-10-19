/**
 * THE MEDIA PIPELINE
 *
 * Rebuilds every asset in `public/media/` from the original Google Flow take.
 * Run with `npm run media`.
 *
 *   node scripts/prepare-media.mjs [--src <path>] [--force]
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT IS WRONG WITH THE SOURCE
 * ────────────────────────────────────────────────────────────────────────────
 * The generated take is 3840 × 2160, 24 fps, 10 s, H.264 High, 19.6 Mb/s and
 * 25.7 MB with an AAC track. Streaming that directly would mean a 25.7 MB
 * download before a single frame appears, on the exact hardware that can least
 * afford it.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT THE FILM ACTUALLY NEEDS
 * ────────────────────────────────────────────────────────────────────────────
 * A scrubbed video is not a streamed video. Three properties decide whether a
 * clip scrubs smoothly, and all three are encode decisions, not code:
 *
 *   1. A SHORT, CLOSED GOP. Every seek has to start decoding at the previous
 *      keyframe. The source's default GOP is far too long, so a scrub can stall
 *      for hundreds of milliseconds while the decoder walks forward. Forcing
 *      `-g 12` puts a keyframe every 0.5 s, so no exact seek ever costs more
 *      than eleven frames of decode — on a Vega 8, about two milliseconds.
 *
 *   2. `+faststart`. The `moov` atom — without which the browser cannot seek at
 *      all — is moved to the front of the file. Without it, the element sits
 *      unseekable until the whole 5 MB has downloaded.
 *
 *   3. `HAVE_CURRENT_DATA` before the first seek. Handled in code, not here.
 *
 * Two encodes are produced from the same master, both faststart, both with the
 * same twelve-frame GOP, so whichever one a device picks behaves identically:
 *
 *   f40-reveal-1080.mp4   1920×1080  CRF 21   ≈ 5.1 MB
 *   f40-reveal-720.mp4    1280×720   CRF 24   ≈ 1.7 MB
 *
 * Both are `-an`. The clip is scrubbed, and a scrubbed audio track is a
 * guarantee of clicks; the soundtrack ships separately as a forward-only,
 * seamless loop and is only ever started by a click.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE OTHER OUTPUTS
 * ────────────────────────────────────────────────────────────────────────────
 *   f40-poster.jpg       frame zero. The video element's `poster`, so the
 *                        browser's own buffering state is already the film.
 *   f40-keyart.jpg       a frame from the orbit. Sits under the video while it
 *                        streams in and becomes the fallback hero if the film
 *                        never arrives — pulled from the same take, so the
 *                        handover is a dissolve rather than a jump cut.
 *   f40-ambient.m4a      the score. The 10 s stereo track with its last 1.5 s
 *   f40-ambient.mp3      equal-power crossfaded back over the head, which
 *                        makes the loop seamless with no click and no gap.
 *   still/*.jpg          the editorial plates for THE MACHINE and THE STORY,
 *                        from the same Flow photo session, graded to match the
 *                        film and resized to about 40 kB each.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'media');
const STILL_OUT = path.join(OUT, 'still');
const PLATES_DIR = path.join(ROOT, 'assets', 'plates');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const FORCE = args.includes('--force');

const SRC = path.resolve(
  flag('src', path.join(ROOT, 'assets', 'source', 'Generated Video October 18, 2026 - 2_04PM.mp4')),
);

/** Keeps the filename's trailing digits stable across re-encodes. */
const ffmpeg = (args_, label) => {
  process.stdout.write(`  · ${label}\n`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args_], { stdio: 'inherit' });
};

// ── 0. Preflight ───────────────────────────────────────────────────────
if (!existsSync(SRC)) {
  console.error(
    `\n  The source take is not at:\n    ${SRC}\n\n` +
      `  Pass it explicitly:\n` +
      `    node scripts/prepare-media.mjs --src "/path/to/Generated Video October 18, 2026 - 2_04PM.mp4"\n\n` +
      `  Everything in public/media/ is already committed, so the site builds and\n` +
      `  runs without this file. This script only exists to reproduce it.\n`,
  );
  process.exit(1);
}

for (const bin of ['ffmpeg', 'ffprobe']) {
  try {
    execFileSync(bin, ['-version'], { stdio: 'ignore' });
  } catch {
    console.error(`  ${bin} is required but not on PATH.`);
    process.exit(1);
  }
}

const probe = execFileSync(
  'ffprobe',
  ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_frames,r_frame_rate', '-of', 'json', SRC],
  { encoding: 'utf8' },
);
const v = JSON.parse(probe).streams[0];
const srcSize = statSync(SRC).size;

console.log(`\n  FERRARI F40 · media pipeline\n`);
console.log(`  source   ${v.width}×${v.height} · ${v.r_frame_rate} fps · ${v.nb_frames} frames · ${(srcSize / 1e6).toFixed(1)} MB`);
console.log(`          ${SRC}\n`);

mkdirSync(OUT, { recursive: true });
mkdirSync(STILL_OUT, { recursive: true });

// ── 1. The film ────────────────────────────────────────────────────────
const GOP = 12; // 12 frames at 24 fps = one keyframe every 0.5 s
const encodes = [
  {
    out: 'f40-reveal-1080.mp4',
    size: '1920:1080',
    profile: 'high',
    level: '4.1',
    crf: '21',
    label: '1920×1080 scrub master (CRF 21, 12-frame GOP, faststart, no audio)',
  },
  {
    out: 'f40-reveal-720.mp4',
    size: '1280:720',
    profile: 'main',
    level: '3.1',
    crf: '24',
    label: '1280×720 for phones and low-DPR screens (CRF 24, 12-frame GOP)',
  },
];

console.log('  encodes');
for (const e of encodes) {
  const dest = path.join(OUT, e.out);
  if (!FORCE && existsSync(dest)) {
    process.stdout.write(`  · ${e.out} — up to date, skipping (--force to rebuild)\n`);
    continue;
  }
  ffmpeg(
    [
      '-i', SRC,
      '-an',
      '-vf', `scale=${e.size}:flags=lanczos`,
      '-c:v', 'libx264',
      '-profile:v', e.profile,
      '-level', e.level,
      '-preset', 'slow',
      '-crf', e.crf,
      '-pix_fmt', 'yuv420p',
      // The three settings that actually decide whether this scrubs.
      '-g', String(GOP),
      '-keyint_min', String(GOP),
      '-sc_threshold', '0',
      '-movflags', '+faststart',
      '-map_metadata', '-1',
      dest,
    ],
    e.label,
  );
}

// ── 2. Stills from the same take ───────────────────────────────────────
console.log('\n  stills');
const stills = [
  { at: '0', out: 'f40-poster.jpg', q: '5', label: 'poster — frame zero, so the buffering state is already the film' },
  { at: '4.92', out: 'f40-keyart.jpg', q: '4', label: 'key art — a frame from the orbit, for the loader and the fallback' },
];
for (const s of stills) {
  const dest = path.join(OUT, s.out);
  if (!FORCE && existsSync(dest)) {
    process.stdout.write(`  · ${s.out} — up to date, skipping\n`);
    continue;
  }
  ffmpeg(
    ['-ss', s.at, '-i', SRC, '-frames:v', '1', '-vf', 'scale=1600:-2:flags=lanczos', '-q:v', s.q, dest],
    s.label,
  );
}

// ── 3. The score ───────────────────────────────────────────────────────
// Equal-power crossfade of the tail over the head: an 8.5 s core with a 1.5 s
// overlap. The result loops forever with no click and no audible seam, which
// is what lets the bed run independently of a video that is being seeked.
console.log('\n  score');
const loop =
  '[0:a]aformat=channel_layouts=stereo,asplit=2[h][t];' +
  '[t]atrim=start=8.5:end=10,asetpts=PTS-STARTPTS[tail];' +
  '[h]atrim=start=0:end=8.5,asetpts=PTS-STARTPTS[head];' +
  '[tail][head]acrossfade=d=1.5:c1=tri:c2=tri[x];' +
  '[x]loudnorm=I=-20:TP=-2:LRA=11,afade=t=in:st=0:d=0.5,areverse,afade=t=in:st=0:d=0.5,areverse[out]';
for (const [ext, codec, extra] of [
  ['m4a', ['-c:a', 'aac', '-b:a', '128k'], []],
  ['mp3', ['-c:a', 'libmp3lame', '-b:a', '128k'], []],
]) {
  const dest = path.join(OUT, `f40-ambient.${ext}`);
  if (!FORCE && existsSync(dest)) {
    process.stdout.write(`  · f40-ambient.${ext} — up to date, skipping\n`);
    continue;
  }
  ffmpeg(
    ['-i', SRC, '-vn', '-filter_complex', loop, '-map', '[out]', ...codec, '-movflags', '+faststart', '-map_metadata', '-1', ...extra, dest],
    `f40-ambient.${ext} — seamless 8.5 s loop, normalised to −20 LUFS`,
  );
}

// ── 4. Editorial plates ────────────────────────────────────────────────
console.log('\n  plates');
if (!existsSync(PLATES_DIR)) {
  process.stdout.write(`  · no assets/plates directory — skipping (the site builds without them)\n`);
} else {
  const plates = [
    { src: 'Ferrari_F40_in_studio_2K_20261018134827.jpg', out: 'studio-haze', w: 1400 },
    { src: 'Ferrari_F40_in_studio_2K_20261018134819.jpg', out: 'studio-profile', w: 1400 },
    { src: 'Ferrari_F40_in_darkness_2K_20261018134814.jpg', out: 'rear-smoke', w: 1400 },
    { src: 'Light_revealing_Ferrari_F40_hood_2K_20261018134832.jpg', out: 'hood-light', w: 1200 },
    { src: 'Ferrari_F40_macro_details_2K_20261018134815.jpg', out: 'wheel-badge', w: 1200 },
  ];
  for (const p of plates) {
    const from = path.join(PLATES_DIR, p.src);
    if (!existsSync(from)) {
      process.stdout.write(`  · ${p.out} — source photo not found, skipping\n`);
      continue;
    }
    const dest = path.join(STILL_OUT, `${p.out}.jpg`);
    ffmpeg(
      [
        '-i', from,
        // Matched to the film's grade: a shade darker, a shade less saturated.
        '-vf', `scale=${p.w}:-2:flags=lanczos,eq=brightness=-0.03:saturation=0.94:contrast=1.05,unsharp=3:3:0.4`,
        '-q:v', '5',
        dest,
      ],
      `${p.out}.jpg — ${p.w}px`,
    );
  }
}

// ── 5. Report ──────────────────────────────────────────────────────────
console.log('\n  public/media/');
let total = 0;
for (const name of readdirSync(OUT).sort()) {
  const p = path.join(OUT, name);
  if (!statSync(p).isFile()) continue;
  const size = statSync(p).size;
  total += size;
  console.log(`    ${name.padEnd(26)} ${(size / 1024).toFixed(0).padStart(6)} kB`);
}
for (const name of readdirSync(STILL_OUT).sort()) {
  const p = path.join(STILL_OUT, name);
  if (!statSync(p).isFile()) continue;
  const size = statSync(p).size;
  total += size;
  console.log(`    still/${name.padEnd(18)} ${(size / 1024).toFixed(0).padStart(6)} kB`);
}
console.log(`    ${'—'.repeat(26)} ${'─'.repeat(8)}`);
console.log(`    ${'total'.padEnd(26)} ${(total / 1024 / 1024).toFixed(2).padStart(6)} MB\n`);
console.log(`  ${((1 - total / srcSize) * 100).toFixed(0)}% smaller than the source take.\n`);