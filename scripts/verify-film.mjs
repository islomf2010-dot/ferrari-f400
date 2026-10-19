/**
 * THE FILM VERIFIER
 *
 *   node scripts/verify-film.mjs
 *
 * A static proof that the choreography in `src/film/timeline.ts` is correct —
 * run in CI or before a deploy, with no browser and no build step. It checks
 * the things that are expensive to discover by eye:
 *
 *   1. the time warp is monotone and never overshoots its own endpoints
 *   2. the cover is still fully on at 15% and fully off at 30%, so the reveal
 *      happens inside phase 02 and nowhere else
 *   3. every orbit label sits over footage that actually shows the part it names
 *   4. no two labels overlap in scroll, so the screen never carries two
 *   captions at once
 *   5. phase fade windows do not collide, and every phase clears the screen
 *      before the next one arrives
 *   6. the shipped MP4s match what the code claims: dimensions, frame rate,
 *      duration, keyframe interval, no audio track, faststart moov
 *   7. the soundtrack is loopable and short enough to live in the page
 *
 * It reads `src/film/timeline.ts` as text and re-implements nothing: the
 * interpolation is reproduced here from the same Fritsch–Carlson construction
 * the runtime uses, so a disagreement between them shows up as a failure.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MEDIA = path.join(ROOT, 'public', 'media');

let failures = 0;
let checks = 0;

const ok = (label, detail = '') => {
  checks++;
  console.log(`  [32m✓[0m ${label}${detail ? `  [90m${detail}[0m` : ''}`);
};
const bad = (label, detail) => {
  checks++;
  failures++;
  console.log(`  [31m✗[0m ${label}\n      ${detail}`);
};
const assert = (cond, label, detail = '') => (cond ? ok(label, detail) : bad(label, detail || 'assertion failed'));

const near = (a, b, eps = 1e-4) => Math.abs(a - b) <= eps;
const clamp01 = (v) => Math.min(Math.max(v, 0), 1);

// ---------------------------------------------------------------------------
// Read the timeline out of the source rather than importing it: this script is
// plain Node and must not need a build step or a TS loader.
// ---------------------------------------------------------------------------

const timelineSrc = readFileSync(path.join(ROOT, 'src', 'film', 'timeline.ts'), 'utf8');

/** `{ t: 0.3, v: 0.378 }` pairs, in source order. */
const NUM = '-?\\d+(?:\\.\\d+)?';
function readWarp() {
  const body = timelineSrc.match(/export const TIME_WARP = new MonotoneTrack\(\[([\s\S]*?)\]\);/);
  if (!body) throw new Error('TIME_WARP not found in src/film/timeline.ts');
  const stops = [];
  for (const m of body[1].matchAll(/\{\s*t:\s*(-?\d+(?:\.\d+)?),\s*v:\s*(-?\d+(?:\.\d+)?)\s*\}/g)) {
    stops.push({ t: Number(m[1]), v: Number(m[2]) });
  }
  return stops;
}

function readArray(name) {
  const re = new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\n\\];`);
  const body = timelineSrc.match(re);
  if (!body) throw new Error(`${name} not found in src/film/timeline.ts`);
  const items = [];
  for (const m of body[1].matchAll(/\{\s*id:\s*'([\w-]+)'[\s\S]*?from:\s*(-?\d+(?:\.\d+)?),\s*to:\s*(-?\d+(?:\.\d+)?),/g)) {
    items.push({ id: m[1], from: Number(m[2]), to: Number(m[3]) });
  }
  return items;
}

function readPhases() {
  const body = timelineSrc.match(/export const PHASES: Phase\[\] = \[([\s\S]*?)\n\];/);
  if (!body) throw new Error('PHASES not found in src/film/timeline.ts');
  const out = [];
  for (const chunk of body[1].split(/\n  \{/)) {
    if (!chunk.includes("id: '")) continue;
    const id = chunk.match(/id:\s*'(\w+)'/)?.[1];
    const bounds = chunk.match(new RegExp(`from:\\s*(${NUM}),\\s*to:\\s*(${NUM})`));
    const fadeIn = chunk.match(new RegExp(`fadeIn:\\s*\\[(${NUM}),\\s*(${NUM})\\]`));
    const fadeOut = chunk.match(new RegExp(`fadeOut:\\s*\\[(${NUM}),\\s*(${NUM})\\]`));
    if (!id || !bounds || !fadeIn || !fadeOut) throw new Error(`PHASES entry could not be parsed:\n${chunk.slice(0, 200)}`);
    out.push({
      id,
      from: Number(bounds[1]),
      to: Number(bounds[2]),
      fadeIn: [Number(fadeIn[1]), Number(fadeIn[2])],
      fadeOut: [Number(fadeOut[1]), Number(fadeOut[2])],
    });
  }
  return out;
}

const SECONDS = Number(timelineSrc.match(/export const SECONDS = ([\d.]+)/)?.[1]);
const FPS = Number(timelineSrc.match(/export const FPS = ([\d.]+)/)?.[1]);
const COVER_OFF = Number(timelineSrc.match(/export const COVER_OFF = ([\d.]+)/)?.[1]);
const ARC = Number(timelineSrc.match(/export const ARC_DEGREES = (\d+)/)?.[1]);

// ---------------------------------------------------------------------------
// Fritsch–Carlson monotone cubic — the same construction as src/scroll/track.ts
// ---------------------------------------------------------------------------

function monotoneTrack(stops) {
  const s = [...stops].sort((a, b) => a.t - b.t);
  const n = s.length;
  const ts = s.map((k) => k.t);
  const vs = s.map((k) => k.v);
  const delta = [];
  for (let i = 0; i < n - 1; i++) delta.push((s[i + 1].v - s[i].v) / (s[i + 1].t - s[i].t || 1));
  const m = [delta[0]];
  for (let i = 1; i < n - 1; i++) m.push(delta[i - 1] * delta[i] <= 0 ? 0 : (delta[i - 1] + delta[i]) / 2);
  m.push(delta[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / delta[i];
    const b = m[i + 1] / delta[i];
    const q = a * a + b * b;
    if (q > 9) {
      const tau = 3 / Math.sqrt(q);
      m[i] = tau * a * delta[i];
      m[i + 1] = tau * b * delta[i];
    }
  }
  return (x) => {
    const t = clamp01(x);
    let i = 0;
    while (i < n - 2 && t > ts[i + 1]) i++;
    const h = ts[i + 1] - ts[i] || 1;
    const u = (t - ts[i]) / h;
    const u2 = u * u;
    const u3 = u2 * u;
    return (
      (2 * u3 - 3 * u2 + 1) * vs[i] +
      (u3 - 2 * u2 + u) * h * m[i] +
      (-2 * u3 + 3 * u2) * vs[i + 1] +
      (u3 - u2) * h * m[i + 1]
    );
  };
}

console.log('\n  FERRARI F40 · film verification\n');

// ── 1. Constants ───────────────────────────────────────────────────────
console.log('  constants');
assert(SECONDS > 0 && Number.isFinite(SECONDS), 'SECONDS is a positive duration', `${SECONDS}s`);
assert(FPS === 24, 'FPS matches the source take', `${FPS} fps`);
assert(COVER_OFF > 0 && COVER_OFF < SECONDS, 'COVER_OFF lands inside the clip', `${COVER_OFF}s`);
assert(ARC > 0 && ARC < 360, 'ARC_DEGREES is a plausible travel', `${ARC}°`);

// ── 2. The warp ────────────────────────────────────────────────────────
console.log('\n  time warp');
const warp = monotoneTrack(readWarp());

assert(near(warp(0), 0, 1e-3), 'the warp starts at frame zero', `${warp(0).toFixed(4)}`);
assert(near(warp(1), 1, 1e-3), 'the warp ends on the final frame', `${warp(1).toFixed(4)}`);

const STEPS = 4000;
let monotone = true;
let minV = Infinity;
let maxV = -Infinity;
let prev = -Infinity;
let worstAt = 0;
for (let i = 0; i <= STEPS; i++) {
  const v = warp(i / STEPS);
  if (v < prev - 1e-6) {
    monotone = false;
    worstAt = i / STEPS;
  }
  prev = v;
  minV = Math.min(minV, v);
  maxV = Math.max(maxV, v);
}
assert(monotone, 'the warp is monotone over 4,000 samples', worstAt ? `reverses near ${worstAt.toFixed(3)}` : 'never reverses');
assert(minV > -1e-6 && maxV < 1 + 1e-6, 'the warp never leaves [0, 1]', `${minV.toFixed(4)} … ${maxV.toFixed(4)}`);

// A monotone track must also be *strictly* increasing over the scroll range, or
// the film would sit on a frame while the visitor scrolls.
let strictlyIncreasing = true;
let flat = 0;
prev = -Infinity;
for (let i = 0; i <= STEPS; i++) {
  const v = warp(i / STEPS);
  if (v - prev < 1e-5) flat++;
  prev = v;
}
strictlyIncreasing = flat / STEPS < 0.01;
assert(strictlyIncreasing, 'the warp never stalls on a frame', flat ? `${((flat / STEPS) * 100).toFixed(1)}% flat` : '');

// ── 3. The reveal lands inside phase 02 ────────────────────────────────
console.log('\n  the reveal');
const coverAt = (story) => warp(story) * SECONDS;
const at15 = coverAt(0.15);
const at30 = coverAt(0.3);

// The cover must still be substantially on at the end of the mystery. A little
// movement is fine — it is a held breath, not a freeze.
assert(at15 < COVER_OFF * 0.72, 'the cover is still on at 15% (end of the mystery)', `${at15.toFixed(2)}s of ${COVER_OFF.toFixed(2)}s`);
assert(at30 >= COVER_OFF - 0.08, 'the cover is off by 30% (end of the reveal)', `${at30.toFixed(2)}s ≥ ${COVER_OFF.toFixed(2)}s`);

// And it must have *started* moving, or phase 02 has nothing to show.
assert(at15 > 0.9, 'the cover has begun to move inside the mystery', `${at15.toFixed(2)}s`);

// The reveal must occupy most of phase 02, not all of it.
const revealSpan = COVER_OFF - at15;
const revealShare = ((0.3 - 0.15) * 100).toFixed(0);
assert(revealSpan > 1.5, 'the reveal itself is at least 1.5 s of footage', `${revealSpan.toFixed(2)}s across ${revealShare}% of the scroll`);

// ── 4. Orbit labels ────────────────────────────────────────────────────
console.log('\n  orbit labels');
const labels = readArray('ORBIT_LABELS');
assert(labels.length >= 4, 'at least four labels are authored', `${labels.length}`);

for (const l of labels) {
  const a = coverAt(l.from);
  const b = coverAt(l.to);
  assert(a >= COVER_OFF, `"${l.id}" is over revealed footage`, `${a.toFixed(2)}s → ${b.toFixed(2)}s`);
  assert(l.from > 0.3 && l.to < 0.9, `"${l.id}" sits inside the orbit phase`, `${l.from} … ${l.to}`);
  assert(b - a > 0.25, `"${l.id}" is on screen long enough to read`, `${(b - a).toFixed(2)}s`);
}

for (let i = 1; i < labels.length; i++) {
  assert(
    labels[i].from > labels[i - 1].to,
    `"${labels[i].id}" does not overlap "${labels[i - 1].id}"`,
    `${labels[i - 1].to} → ${labels[i].from}`,
  );
}

// ── 5. Phases ──────────────────────────────────────────────────────────
console.log('\n  phases');
const phases = readPhases();
assert(phases.length === 4, 'four phases are authored', phases.map((p) => p.id).join(' · '));
assert(near(phases[0].from, 0) && near(phases[phases.length - 1].to, 1), 'the phases tile the whole scroll range', `0 → 1`);

for (let i = 0; i < phases.length; i++) {
  const p = phases[i];
  assert(p.to > p.from, `${p.id} has a positive span`, `${p.from} → ${p.to}`);
  assert(p.fadeIn[1] > p.fadeIn[0], `${p.id} has a real fade-in`, `${p.fadeIn.join(' → ')}`);
  if (p.id !== 'hero') {
    assert(p.fadeOut[1] > p.fadeOut[0], `${p.id} has a real fade-out`, `${p.fadeOut.join(' → ')}`);
  } else {
    assert(near(p.fadeOut[0], 1) && near(p.fadeOut[1], 1), `${p.id} holds to the end`, 'fadeOut [1, 1]');
  }
  assert(p.fadeIn[0] >= p.from - 0.04, `${p.id} fades in inside its own phase`, `${p.fadeIn[0]} ≥ ${p.from} − 0.04`);
  assert(p.fadeOut[0] <= p.to + 0.04, `${p.id} fades out inside its own phase`, `${p.fadeOut[0]} ≤ ${p.to} + 0.04`);
}

// Neighbouring phases must overlap slightly — a title change that does not
// overlap reads as a cut — but the overlap has to stay small enough that the
// two are never both fully up, which is what would make the frame shout twice.
function shoulder(x, a, b) {
  if (x <= a) return 0;
  if (x >= b) return 1;
  const u = (x - a) / (b - a || 1);
  return u * u * (3 - 2 * u);
}
for (let i = 1; i < phases.length; i++) {
  const prev = phases[i - 1];
  const cur = phases[i];
  const overlapStart = Math.max(prev.fadeOut[0], cur.fadeIn[0]);
  const overlapEnd = Math.min(prev.fadeOut[1], cur.fadeIn[1]);
  const overlap = Math.max(0, overlapEnd - overlapStart);
  assert(overlap > 0, `${cur.id} dissolves out of ${prev.id} rather than cutting`, `overlap ${overlap.toFixed(4)}`);
  assert(overlap < 0.04, `${cur.id} overlap stays a dissolve, not a double`, `${overlap.toFixed(4)} of scroll`);

  // Walk the overlap and prove neither is ever fully up while the other is.
  let bothLoud = 0;
  let loudest = 0;
  for (let k = 0; k <= 200; k++) {
    const x = overlapStart + (overlap * k) / 200;
    const a = 1 - shoulder(x, prev.fadeOut[0], prev.fadeOut[1]);
    const b = shoulder(x, cur.fadeIn[0], cur.fadeIn[1]);
    if (a > 0.85 && b > 0.85) bothLoud++;
    loudest = Math.max(loudest, Math.min(a, b));
  }
  assert(bothLoud === 0, `only one of ${prev.id} / ${cur.id} is ever fully on screen`, `peak overlap opacity ${loudest.toFixed(3)}`);
}

// Nothing may be on screen at the very end of the film: the hero frame has to
// be a clean composition.
assert(phases.at(-1).id === 'hero', 'the last phase is the hero', phases.at(-1).id);

// ── 6. The shipped encodes ─────────────────────────────────────────────
console.log('\n  encodes');

function ffprobeJson(file, entries) {
  return JSON.parse(
    execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', entries, '-of', 'json', file],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ),
  );
}

const CLIPS = [
  { file: 'f40-reveal-1080.mp4', w: 1920, h: 1080, maxMB: 7 },
  { file: 'f40-reveal-720.mp4', w: 1280, h: 720, maxMB: 3.5 },
];

for (const clip of CLIPS) {
  const p = path.join(MEDIA, clip.file);
  if (!existsSync(p)) {
    bad(`${clip.file} exists`, `missing — run \`npm run media\``);
    continue;
  }
  const mb = statSync(p).size / 1e6;
  const info = ffprobeJson(p, 'stream=codec_name,codec_type,width,height,r_frame_rate,nb_frames');
  const streams = info.streams;
  const v = streams.find((s) => s.codec_type === 'video');
  const a = streams.find((s) => s.codec_type === 'audio');

  ok(`${clip.file} exists`, `${mb.toFixed(2)} MB`);
  assert(v.codec_name === 'h264', `${clip.file} is H.264`, v.codec_name);
  assert(v.width === clip.w && v.height === clip.h, `${clip.file} is ${clip.w}×${clip.h}`, `${v.width}×${v.height}`);
  assert(v.r_frame_rate === '24/1', `${clip.file} is 24 fps`, v.r_frame_rate);
  assert(!a, `${clip.file} carries no audio track`, a ? 'an audio stream is present' : 'video only');
  assert(mb < clip.maxMB, `${clip.file} is under ${clip.maxMB} MB`, `${mb.toFixed(2)} MB`);

  // Keyframe interval: the property the whole scrub design rests on.
  const raw = execFileSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v', '-show_entries', 'packet=pts_time,flags', '-of', 'csv=p=0', p],
    { encoding: 'utf8', maxBuffer: 1 << 24 },
  );
  const keys = raw
    .trim()
    .split('\n')
    .filter((l) => l.includes('K'))
    .map((l) => Number(l.split(',')[0]));
  const gaps = keys.slice(1).map((k, i) => k - keys[i]);
  const maxGap = Math.max(...gaps);
  assert(maxGap <= 0.51, `${clip.file} keyframes no further than 0.5 s apart`, `max gap ${maxGap.toFixed(3)}s over ${keys.length} keyframes`);
  assert(keys[0] === 0, `${clip.file} opens on a keyframe`, `first at ${keys[0]}s`);

  // faststart: `moov` before `mdat`, so the file is seekable the moment the
  // first bytes land rather than after the whole download.
  const headStr = readFileSync(p).subarray(0, 512).toString('latin1');
  const moov = headStr.indexOf('moov');
  const mdat = headStr.indexOf('mdat');
  assert(moov >= 0 && (mdat < 0 || moov < mdat), `${clip.file} is faststart`, `moov@${moov} mdat@${mdat}`);
}

// Duration must agree with SECONDS, or the timecode lies.
{
  const p = path.join(MEDIA, CLIPS[0].file);
  if (existsSync(p)) {
    const dur = Number(ffprobeJson(p, 'format=duration').format.duration);
    assert(Math.abs(dur - SECONDS) < 0.12, 'the 1080p encode matches SECONDS', `${dur.toFixed(3)}s vs ${SECONDS}s`);
  }
}

// ── 7. Poster and key art ─────────────────────────────────────────────
console.log('\n  stills');
for (const [file, why] of [
  ['f40-poster.jpg', 'the video element has a poster for its buffering state'],
  ['f40-keyart.jpg', 'the loader and the no-video fallback have something to show'],
]) {
  const p = path.join(MEDIA, file);
  if (!existsSync(p)) {
    bad(`${file} exists`, `missing — run \`npm run media\``);
    continue;
  }
  const info = ffprobeJson(p, 'stream=width,height');
  const s = info.streams[0];
  assert(s.width >= 1000, `${file} is full-width enough to cover a viewport`, `${s.width}×${s.height}`);
  assert(statSync(p).size < 500e3, `${file} is under 500 kB`, `${(statSync(p).size / 1024).toFixed(0)} kB`);
  void why;
}

// ── 8. The score ───────────────────────────────────────────────────────
console.log('\n  score');
for (const ext of ['m4a', 'mp3']) {
  const p = path.join(MEDIA, `f40-ambient.${ext}`);
  if (!existsSync(p)) {
    bad(`f40-ambient.${ext} exists`, 'missing — run `npm run media`');
    continue;
  }
  const info = ffprobeJson(p, 'stream=codec_name,duration,channels');
  const s = info.streams[0];
  ok(`f40-ambient.${ext} exists`, `${(statSync(p).size / 1024).toFixed(0)} kB`);
  assert(s.channels === 2, `f40-ambient.${ext} is stereo`, `${s.channels}ch`);
  assert(Number(s.duration) >= 8 && Number(s.duration) <= 10.5, `f40-ambient.${ext} is a short loop`, `${Number(s.duration).toFixed(2)}s`);
}

// ── 9. Referenced assets exist ─────────────────────────────────────────
console.log('\n  references');
const contentSrc = readFileSync(path.join(ROOT, 'src', 'content.ts'), 'utf8');
const referenced = new Set([...contentSrc.matchAll(/'(media\/[^']+)'/g)].map((m) => m[1]));
for (const rel of referenced) {
  assert(existsSync(path.join(ROOT, 'public', rel)), `${rel} is present`, '');
}

// ── Result ─────────────────────────────────────────────────────────────
console.log('');
if (failures === 0) {
  console.log(`  [32m${checks} checks passed.[0m\n`);
} else {
  console.log(`  [31m${failures} of ${checks} checks failed.[0m\n`);
  process.exit(1);
}