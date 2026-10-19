/**
 * FRAME CAPTURE RIG
 *
 *   node scripts/shoot.mjs [--url http://127.0.0.1:4173] [--out shots/film]
 *                         [--clip 720] [--viewport 1440x900]
 *
 * Captures the film at every authored beat — each phase, each orbit label and
 * the hero frame — plus the two story sections, so the choreography can be
 * reviewed as stills without scrubbing through it a hundred times.
 *
 * Positions come straight out of `src/film/timeline.ts` so a caption can never
 * be reviewed at a scroll offset the visitor will never actually reach.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const BASE = flag('url', 'http://127.0.0.1:4173');
const CLIP = flag('clip', '720');
const OUT = path.resolve(ROOT, flag('out', 'shots/film'));
const [W, H] = flag('viewport', '1440x900').split('x').map(Number);

// ── The beats, in the order the visitor meets them ────────────────────
const BEATS = [
  { name: '01-mystery-open', at: 0.0, note: 'the held breath — black studio, covered car' },
  { name: '02-mystery-covered', at: 0.1, note: 'camera pushing in under the spotlight' },
  { name: '03-reveal-opening', at: 0.19, note: 'the silk starts to leave' },
  { name: '04-reveal-red', at: 0.27, note: 'Rosso Corsa out of the dark' },
  { name: '05-orbit-front', at: 0.36, note: 'label: front — pure intention' },
  { name: '06-orbit-side', at: 0.51, note: 'label: side — form follows function' },
  { name: '07-orbit-rear-quarter', at: 0.69, note: 'label: rear — engineered to perform' },
  { name: '08-orbit-tail', at: 0.72, note: 'dead rear — lamp band and engine bay' },
  { name: '09-orbit-f40', at: 0.84, note: 'label: F40 — an unfiltered driving machine' },
  { name: '10-hero-frame', at: 1.0, note: 'the final frame' },
];

const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--host', '127.0.0.1'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
});
process.on('exit', () => server.kill('SIGTERM'));

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('preview server did not start')), 20000);
  server.stdout.on('data', (b) => {
    if (b.toString().includes('4173')) {
      clearTimeout(timer);
      setTimeout(resolve, 500);
    }
  });
});

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(`${BASE}/?clip=${CLIP}`, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(() => !document.querySelector('.loader:not(.is-hidden)'), null, { timeout: 45000 });
await page.waitForTimeout(600);

const manifest = [];
for (const beat of BEATS) {
  const t = await page.evaluate(async (f) => {
    const film = document.getElementById('reveal');
    window.scrollTo({ top: (film.offsetHeight - window.innerHeight) * f, behavior: 'instant' });
    await new Promise((res) => {
      let last = -1;
      let stable = 0;
      const tick = () => {
        const rail = document.querySelector('.hud__rail-fill');
        const s = Number(rail?.style.transform.match(/[\d.]+/)?.[0] ?? 0);
        if (Math.abs(s - last) < 0.0004) stable++;
        else stable = 0;
        last = s;
        if (stable > 6) res();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const v = document.querySelector('video');
    return { seconds: v.currentTime, paused: v.paused };
  }, beat.at);

  // Let the header and the dissolve settle before the shutter.
  await page.waitForTimeout(700);
  const file = `${beat.name}.png`;
  await page.screenshot({ path: path.join(OUT, file) });
  manifest.push({ ...beat, file, ...t });
  console.log(`  ${file.padEnd(26)} ${String(Math.round(beat.at * 100)).padStart(3)}%  t=${t.seconds.toFixed(3)}s  ${beat.note}`);
}

// The two story sections, scrolled to their tops. Measured from live rects:
// `offsetTop` is relative to whichever positioned ancestor is nearest, and
// `#machine` sits inside a `position: relative` wrapper.
for (const [id, name, extra] of [
  ['machine', '11-the-machine', 0],
  ['machine', '11b-the-machine-specs', 1.1],
  ['story', '12-the-story', 0],
  ['story', '12b-the-story-moments', 1.1],
]) {
  const top = await page.evaluate(
    ([i, extraVh]) => {
      const el = document.getElementById(i);
      const doc = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: doc + window.innerHeight * extraVh, behavior: 'instant' });
      return doc;
    },
    [id, extra],
  );
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  ${`${name}.png`.padEnd(26)} y=${Math.round(top)} #${id}`);
}

writeFileSync(path.join(OUT, 'beats.json'), JSON.stringify(manifest, null, 2));
console.log(`\n  ${manifest.length + 4} frames in ${path.relative(ROOT, OUT)}/`);

// A contact sheet, so the whole film can be read at a glance.
const { execFileSync } = await import('node:child_process');
try {
  // Concatenate, then tile: xstack arithmetic across ten inputs is where this
  // kind of script usually breaks.
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'image2', '-framerate', '1', '-pattern_type', 'glob',
      '-i', path.join(OUT, '[01][0-9]-*.png'),
      '-vf', 'scale=460:-1,tile=5x2:padding=8:color=0x111111',
      '-frames:v', '1', '-q:v', '4', path.join(OUT, 'contact-sheet.jpg'),
    ],
    { stdio: 'inherit' },
  );
  console.log('  contact-sheet.jpg');
} catch {
  console.log('  (ffmpeg unavailable — no contact sheet)');
}

await browser.close();
server.kill('SIGTERM');
process.exit(0);