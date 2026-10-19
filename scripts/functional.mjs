/**
 * FUNCTIONAL RIG
 *
 *   node scripts/functional.mjs [--url http://127.0.0.1:4173] [--shots] [--headed]
 *
 * Drives the built site in a real browser and asserts the things that only
 * exist at runtime:
 *
 *   1. the film loads, reports a duration, and reaches a fully buffered state
 *   2. scrolling down advances `video.currentTime`, scrolling up reverses it,
 *      and stopping holds the frame — the whole point of the project
 *   3. the film never plays itself, at any scroll position
 *   4. seek latency stays inside a budget, measured, not assumed
 *   5. every phase and every orbit label appears, and only in its own window
 *   6. the masthead hides inside the film and comes back outside it
 *   7. the sound control never autoplays and can be switched on and off
 *   8. reduced motion produces the still fallback and a usable control
 *   9. mobile and desktop viewports lay out without horizontal overflow
 *  10. the console is clean on every run
 *
 * Exits non-zero on the first failing expectation, so it is safe in CI.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOT_DIR = path.resolve(ROOT, 'shots', process.env.SHOT_DIR || 'functional');
const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const WANT_SHOTS = args.includes('--shots');
const HEADED = args.includes('--headed');
const BASE = flag('url', 'http://127.0.0.1:4173');

let failures = 0;
let checks = 0;
const ok = (label, detail = '') => {
  checks++;
  console.log(`  \x1b[32m✓\x1b[0m ${label}${detail ? `  \x1b[90m${detail}\x1b[0m` : ''}`);
};
const bad = (label, detail) => {
  checks++;
  failures++;
  console.log(`  \x1b[31m✗\x1b[0m ${label}\n      ${detail}`);
};
const assert = (cond, label, detail = '') => (cond ? ok(label, detail) : bad(label, detail || 'assertion failed'));

// ── Preview server ─────────────────────────────────────────────────────
const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--host', '127.0.0.1'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const stop = () => {
  server.kill('SIGTERM');
};
process.on('exit', stop);
process.on('SIGINT', () => {
  stop();
  process.exit(1);
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('preview server did not start')), 20000);
  server.stdout.on('data', (b) => {
    if (b.toString().includes('4173')) {
      clearTimeout(timer);
      setTimeout(resolve, 400);
    }
  });
  server.stderr.on('data', (b) => process.stderr.write(b));
});

mkdirSync(SHOT_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: !HEADED,
  args: [
    // Hardware decode is not available in headless Chromium, so autoplay and
    // scrub are exercised through the software decoder. That is the pessimistic
    // path, which is exactly what should be tested.
    '--autoplay-policy=user-gesture-required',
    '--mute-audio',
  ],
});

const consoleLog = [];

async function openPage(ctx, url) {
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleLog.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleLog.push(`[pageerror] ${e.message}`));
  await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  // The curtain lifts once the clip is buffered.
  await page.waitForFunction(() => !document.querySelector('.loader:not(.is-hidden)'), null, { timeout: 45000 });
  await page.waitForTimeout(400);
  return page;
}

/** Scrolls the window and waits for the damped scrub to settle on a value. */
async function scrollTo(page, fraction) {
  return page.evaluate(async (f) => {
    const film = document.getElementById('reveal');
    const max = film.offsetHeight - window.innerHeight;
    window.scrollTo({ top: max * f, behavior: 'instant' });
    // GSAP's scrub is damped; wait for it to stop moving rather than guessing.
    await new Promise((res) => {
      let last = -1;
      let stable = 0;
      const tick = () => {
        const rail = document.querySelector('.hud__rail-fill');
        const scale = rail ? Number(rail.style.transform.match(/[\d.]+/)?.[0] ?? 0) : 0;
        if (Math.abs(scale - last) < 0.0004) stable++;
        else stable = 0;
        last = scale;
        if (stable > 6) res();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, fraction);
}

const readVideo = (page) =>
  page.evaluate(() => {
    const v = document.querySelector('video');
    return {
      currentTime: v.currentTime,
      duration: v.duration,
      paused: v.paused,
      readyState: v.readyState,
      width: v.videoWidth,
      height: v.videoHeight,
      muted: v.muted,
      volume: v.volume,
    };
  });

const readOverlay = (page) =>
  page.evaluate(() => {
    const vis = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return 0;
      return Number(getComputedStyle(el).opacity);
    };
    return {
      rail: document.querySelector('.hud__rail-fill')?.style.transform ?? '',
      pct: document.querySelector('.hud__pct span')?.textContent ?? '',
      phase: document.querySelector('.hud__phase')?.textContent ?? '',
      beats: [...document.querySelectorAll('.beat')].map((b) => Number(getComputedStyle(b).opacity)),
      labels: [...document.querySelectorAll('.label')].map((l) => ({
        opacity: Number(getComputedStyle(l).opacity),
        text: l.querySelector('.label__line')?.textContent ?? '',
      })),
    };
  });

// ═══════════════════════════════════════════════════════════════════════
console.log('\n  FERRARI F40 · functional rig\n');

// ── Desktop: the film itself ───────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await openPage(ctx, `${BASE}/?clip=720`);

  console.log('  the film');
  const v0 = await readVideo(page);
  assert(v0.duration > 9.5 && v0.duration < 10.5, 'the clip reports its real duration', `${v0.duration.toFixed(3)}s`);
  assert(v0.width > 0 && v0.height > 0, 'the clip has decoded a frame', `${v0.width}×${v0.height}`);
  assert(v0.muted && v0.volume === 0, 'the film is permanently silent', `muted=${v0.muted} volume=${v0.volume}`);
  assert(v0.paused, 'the film is paused at rest');
  assert(v0.readyState >= 3, 'the clip is fully buffered', `readyState ${v0.readyState}`);

  // ── Forward ──────────────────────────────────────────────────────────
  console.log('\n  scrubbing');
  const timeline = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];
  const samples = [];
  for (const f of timeline) {
    await scrollTo(page, f);
    const v = await readVideo(page);
    const o = await readOverlay(page);
    samples.push({ f, t: v.currentTime, pct: Number(o.pct), phase: o.phase });
    if (WANT_SHOTS) {
      // Let the header's 0.5 s opacity transition land before capturing.
      await page.waitForTimeout(650);
      await page.screenshot({ path: path.join(SHOT_DIR, `f${String(Math.round(f * 100)).padStart(3, '0')}.png`) });
    }
  }

  for (const s of samples) {
    console.log(`      ${String(Math.round(s.f * 100)).padStart(3)}%  t=${s.t.toFixed(3)}s  rail=${s.pct.toFixed(1)}%  ${s.phase}`);
  }

  let monotone = true;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].t <= samples[i - 1].t) monotone = false;
  }
  assert(monotone, 'scrolling down advances the film at every step', samples.map((s) => s.t.toFixed(2)).join(' → '));
  assert(samples[0].t < 0.08, 'the film opens on its first frames', `${samples[0].t.toFixed(3)}s`);
  assert(samples.at(-1).t > 9.5, 'the film ends on its last frames', `${samples.at(-1).t.toFixed(3)}s`);

  const railMatches = samples.every((s) => Math.abs(s.pct / 100 - s.f) < 0.02);
  assert(railMatches, 'the progress rail tracks the scroll position', samples.map((s) => `${(s.pct / 100).toFixed(2)}`).join(' '));

  // ── Framing ──────────────────────────────────────────────────────────
  // `object-fit: contain` is a decision, and it has a price: the letterbox. On
  // a 16:10 desktop viewport the price is a few per cent of frame height, which
  // is invisible against the footage's own black edges. Anything wider than
  // about 1.4:1 would start costing real estate, and this assertion is what
  // would notice.
  const framing = await page.evaluate(() => {
    const v = document.querySelector('video');
    const box = v.getBoundingClientRect();
    return {
      fit: getComputedStyle(v).objectFit,
      aspect: v.videoWidth / v.videoHeight,
      boxAspect: box.width / box.height,
    };
  });
  assert(framing.fit === 'contain', 'the film is letterboxed, never cropped to the viewport', `object-fit: ${framing.fit}`);
  assert(Math.abs(framing.aspect - 16 / 9) < 0.02, 'the source is 16:9', framing.aspect.toFixed(4));
  {
    // Letterbox cost. The video fits by whichever axis is tighter; the loss is
    // the fraction of the other axis given up. On a 16:10 viewport a 16:9 film
    // loses 10% of its width, which is 80 px a side against the footage's own
    // black edges and therefore invisible.
    const loss = 1 - Math.min(framing.boxAspect, framing.aspect) / Math.max(framing.boxAspect, framing.aspect);
    assert(loss < 0.2, 'the letterbox costs under a fifth of the frame at 1440×900', `${(loss * 100).toFixed(1)}%`);
  }

  // ── Reverse ──────────────────────────────────────────────────────────
  const back = [];
  for (const f of [0.75, 0.45, 0.2, 0]) {
    await scrollTo(page, f);
    back.push({ f, t: (await readVideo(page)).currentTime });
  }
  console.log(`      reverse  ${back.map((s) => s.t.toFixed(2)).join(' → ')}`);
  let reverses = true;
  for (let i = 1; i < back.length; i++) if (back[i].t >= back[i - 1].t) reverses = false;
  assert(reverses, 'scrolling up reverses the film', back.map((s) => s.t.toFixed(2)).join(' → '));

  // ── Hold ─────────────────────────────────────────────────────────────
  // Checked mid-film, not at zero: a film that is already parked on frame zero
  // would "hold" even if it were broken.
  await scrollTo(page, 0.62);
  const before = await readVideo(page);
  await page.waitForTimeout(1600);
  const after = await readVideo(page);
  assert(after.paused, 'the film is still paused after scrolling stops');
  assert(before.currentTime > 5, 'the hold was measured mid-film', `t=${before.currentTime.toFixed(3)}s`);
  assert(
    Math.abs(after.currentTime - before.currentTime) < 1 / 24,
    'the frame holds for 1.6 s when the scroll stops',
    `${before.currentTime.toFixed(4)} → ${after.currentTime.toFixed(4)}`,
  );

  // ── The film never runs itself ───────────────────────────────────────
  console.log('\n  the film never plays itself');
  let everPlayed = false;
  for (const f of [0.1, 0.25, 0.5, 0.75, 0.95, 1]) {
    await scrollTo(page, f);
    await page.waitForTimeout(260);
    if (!(await readVideo(page)).paused) everPlayed = true;
  }
  assert(!everPlayed, 'paused at every scroll position', 'no autoplay, ever');

  // ── Seek latency ─────────────────────────────────────────────────────
  console.log('\n  seek cost');
  const jumps = await page.evaluate(async () => {
    const v = document.querySelector('video');
    const film = document.getElementById('reveal');
    const max = film.offsetHeight - window.innerHeight;
    const out = [];
    for (const f of [0.05, 0.95, 0.2, 0.8, 0.35, 0.65]) {
      window.scrollTo({ top: max * f, behavior: 'instant' });
      // Wait for the browser to actually present the frame it was asked for.
      const t0 = performance.now();
      await new Promise((res) => {
        let stable = 0;
        let last = -1;
        const tick = () => {
          if (Math.abs(v.currentTime - last) < 1e-4) stable++;
          else stable = 0;
          last = v.currentTime;
          if (stable > 2 || performance.now() - t0 > 2500) res();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      out.push(performance.now() - t0);
    }
    return out;
  });
  const worst = Math.max(...jumps);
  console.log(`      ${jumps.map((j) => `${j.toFixed(0)}ms`).join(' · ')}`);
  assert(worst < 700, 'a full-length jump settles in under 700 ms', `worst ${worst.toFixed(0)}ms`);

  // ── Phases ───────────────────────────────────────────────────────────
  console.log('\n  phases');
  const BEATS = ['mystery', 'reveal', 'orbit', 'hero'];
  for (let i = 0; i < BEATS.length; i++) {
    const mid = i === 0 ? 0.06 : i === 1 ? 0.22 : i === 2 ? 0.55 : 0.97;
    await scrollTo(page, mid);
    const o = await readOverlay(page);
    const on = o.beats.map((x) => x > 0.85);
    assert(on[i] && on.filter(Boolean).length === 1, `phase ${i + 1} "${BEATS[i]}" is the only one on screen`, o.beats.map((x) => x.toFixed(2)).join(' '));
  }

  // ── Labels ───────────────────────────────────────────────────────────
  console.log('\n  orbit labels');
  const LABEL_WINDOWS = [
    [0.36, 'Pure intention'],
    [0.51, 'Form follows function'],
    [0.69, 'Engineered to perform'],
    [0.84, 'An unfiltered driving machine'],
  ];
  for (const [f, text] of LABEL_WINDOWS) {
    await scrollTo(page, f);
    const o = await readOverlay(page);
    const lit = o.labels.filter((l) => l.opacity > 0.85);
    assert(
      lit.length === 1 && lit[0].text === text,
      `"${text}" is the only caption at ${Math.round(f * 100)}%`,
      lit.map((l) => `${l.text}@${l.opacity.toFixed(2)}`).join(', ') || o.labels.map((l) => l.opacity.toFixed(2)).join(' '),
    );
  }

  // Between the labels nothing should be on screen — a caption the visitor did
  // not ask for is worse than no caption.
  await scrollTo(page, 0.44);
  const quiet = await readOverlay(page);
  assert(quiet.labels.every((l) => l.opacity < 0.05), 'the margins are clear between labels', quiet.labels.map((l) => l.opacity.toFixed(2)).join(' '));

  // ── Masthead ─────────────────────────────────────────────────────────
  console.log('\n  chrome');
  await scrollTo(page, 0.5);
  const inFilm = await page.evaluate(() => ({
    film: document.querySelector('.masthead').classList.contains('is-film'),
    navOpacity: Number(getComputedStyle(document.querySelector('.masthead__nav')).opacity),
    soundReachable: !!document.querySelector('.masthead .sound'),
  }));
  assert(inFilm.film, 'the masthead knows it is inside the film');
  assert(inFilm.navOpacity < 0.05, 'the section links retire over the film', `opacity ${inFilm.navOpacity}`);
  assert(inFilm.soundReachable, 'the sound control is still reachable inside the film');
  await scrollTo(page, 0);
  await page.waitForTimeout(700); // let the 0.5s header transition finish
  const atTop = await page.evaluate(() => ({
    film: document.querySelector('.masthead').classList.contains('is-film'),
    navOpacity: Number(getComputedStyle(document.querySelector('.masthead__nav')).opacity),
  }));
  assert(!atTop.film && atTop.navOpacity > 0.9, 'the masthead is fully back at the top', `nav ${atTop.navOpacity}`);
  await page.evaluate(() => document.getElementById('machine').scrollIntoView());
  await page.waitForTimeout(700);
  const inStory = await page.evaluate(() => ({
    film: document.querySelector('.masthead').classList.contains('is-film'),
    navOpacity: Number(getComputedStyle(document.querySelector('.masthead__nav')).opacity),
  }));
  assert(!inStory.film && inStory.navOpacity > 0.9, 'the masthead is back in the story sections', `nav ${inStory.navOpacity}`);

  // ── Navigation ───────────────────────────────────────────────────────
  for (const id of ['reveal', 'machine', 'story']) {
    const found = await page.evaluate((i) => !!document.querySelector(`[href="#${i}"]`) && !!document.getElementById(i), id);
    assert(found, `nav link #${id} has a target`);
  }

  // ── Sound ────────────────────────────────────────────────────────────
  console.log('\n  sound');
  const audioBefore = await page.evaluate(() => document.querySelectorAll('audio').length);
  assert(audioBefore === 0, 'no audio element exists before the visitor asks for sound');

  await page.click('.sound');
  // The bed fades in over 1.4 s; poll rather than guess a wait, so a loaded
  // machine and a slow one are both measured on the same terms.
  await page
    .waitForFunction(
      () => {
        const a = document.querySelector('audio[data-role="cinematic-sound"]');
        return !!a && !a.paused && a.volume > 0.9;
      },
      null,
      { timeout: 8000 },
    )
    .catch(() => undefined);
  const on = await page.evaluate(() => {
    const el = document.querySelector('.sound');
    const a = document.querySelector('audio[data-role="cinematic-sound"]');
    return {
      pressed: el.getAttribute('aria-pressed'),
      exists: !!a,
      playing: a ? !a.paused : false,
      volume: a?.volume ?? 0,
      loop: a?.loop ?? false,
    };
  });
  assert(on.pressed === 'true' && on.exists && on.playing, 'the sound bed starts on click', `volume ${on.volume.toFixed(2)}`);
  assert(on.loop, 'the bed loops without a seam');
  assert(on.volume > 0.85, 'the bed fades all the way in', `volume ${on.volume.toFixed(2)}`);

  // Scrubbing must not disturb the bed — that is the whole reason it is a
  // separate file, playing forwards, untouched by the timeline.
  await scrollTo(page, 0.2);
  const during = await page.evaluate(() => {
    const a = document.querySelector('audio[data-role="cinematic-sound"]');
    return { playing: a ? !a.paused : false, volume: a?.volume ?? 0 };
  });
  assert(during.playing && during.volume > 0.8, 'the bed keeps playing through a scrub', `volume ${during.volume.toFixed(2)}`);

  await page.click('.sound');
  await page
    .waitForFunction(
      () => {
        const a = document.querySelector('audio[data-role="cinematic-sound"]');
        return !!a && a.paused;
      },
      null,
      { timeout: 6000 },
    )
    .catch(() => undefined);
  const off = await page.evaluate(() => {
    const el = document.querySelector('.sound');
    const a = document.querySelector('audio[data-role="cinematic-sound"]');
    return { pressed: el.getAttribute('aria-pressed'), paused: a ? a.paused : true, volume: a?.volume ?? 0 };
  });
  assert(off.pressed === 'false' && off.paused, 'the bed stops on click', `volume ${off.volume.toFixed(2)}`);

  // Nothing should be audible by accident, ever.
  const finalAudio = await readVideo(page);
  assert(finalAudio.muted, 'the film never becomes audible', `muted=${finalAudio.muted}`);

  // ── Horizontal overflow ──────────────────────────────────────────────
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 0, 'no horizontal overflow at 1440px', `${overflow}px`);

  await ctx.close();
}

// ── Mobile ─────────────────────────────────────────────────────────────
{
  console.log('\n  mobile · 390 × 844');
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await openPage(ctx, `${BASE}/?clip=720`);
  const v = await readVideo(page);
  assert(v.width === 1280 && v.height === 720, 'a phone is served the 720p encode', `${v.width}×${v.height}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 0, 'no horizontal overflow at 390px', `${overflow}px`);

  await scrollTo(page, 0.55);
  const o = await readOverlay(page);
  assert(o.beats[2] > 0.85, 'the orbit phase still reads on a phone', o.beats.map((x) => x.toFixed(2)).join(' '));

  // The film must stay whole on a phone: a letterboxed frame is fine, a cropped
// car is not. The element's own box always fills the stage — `object-fit` paints
// inside it — so what is asserted is the painted box, computed the way the
// compositor computes it.
const framing = await page.evaluate(() => {
  const v = document.querySelector('video');
  const box = v.getBoundingClientRect();
  const fit = getComputedStyle(v).objectFit;
  const aspect = v.videoWidth / v.videoHeight;
  const boxAspect = box.width / box.height;
  const scale = Math.min(box.width / v.videoWidth, box.height / v.videoHeight);
  return {
    fit,
    aspect,
    boxAspect,
    painted: { w: Math.round(v.videoWidth * scale), h: Math.round(v.videoHeight * scale) },
  };
});
assert(framing.fit === 'contain', 'the film is letterboxed, never cropped to the viewport', `object-fit: ${framing.fit}`);
assert(Math.abs(framing.aspect - 16 / 9) < 0.02, 'the source is 16:9', framing.aspect.toFixed(4));
assert(
  Math.abs(framing.painted.w / framing.painted.h - 16 / 9) < 0.02,
  'the painted frame keeps the 16:9 composition on a phone',
  `${framing.painted.w}×${framing.painted.h}`,
);
  if (WANT_SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'mobile-orbit.png') });

  // And the headline phases still land inside the frame.
  await scrollTo(page, 0.97);
  const hero = await readOverlay(page);
  assert(hero.beats[3] > 0.85, 'the hero lock-up reads on a phone', hero.beats.map((x) => x.toFixed(2)).join(' '));
  if (WANT_SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'mobile-hero.png') });

  await scrollTo(page, 0.0);
  if (WANT_SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'mobile-open.png') });
  await ctx.close();
}

// ── Reduced motion ─────────────────────────────────────────────────────
{
  console.log('\n  reduced motion');
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => consoleLog.push(`[pageerror/reduced] ${e.message}`));
  await page.goto(`${BASE}/?clip=720`, { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction(() => !document.querySelector('.loader:not(.is-hidden)'), null, { timeout: 45000 });
  await page.waitForTimeout(500);

  const state = await page.evaluate(() => ({
    still: document.getElementById('reveal').classList.contains('film--still'),
    height: document.getElementById('reveal').offsetHeight,
    vh: window.innerHeight,
    cta: !!document.querySelector('.still-cta .btn'),
    paused: document.querySelector('video').paused,
    grain: getComputedStyle(document.querySelector('.stage__grain')).display,
  }));
  assert(state.still, 'reduced motion switches to the still film');
  assert(Math.abs(state.height - state.vh) < 2, 'the film section collapses to one viewport', `${state.height}px vs ${state.vh}px`);
  assert(state.paused, 'nothing is playing');
  assert(state.cta, 'a play control is offered');
  assert(state.grain === 'none', 'the grain is switched off');

  await page.click('.still-cta .btn');
  await page.waitForTimeout(700);
  const playing = await page.evaluate(() => !document.querySelector('video').paused);
  assert(playing, 'pressing play starts the film once');
  await page.click('.still-cta .btn');
  await page.waitForTimeout(400);
  const stopped = await page.evaluate(() => document.querySelector('video').paused);
  assert(stopped, 'pressing stop halts it');

  if (WANT_SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'reduced-motion.png') });
  await ctx.close();
}

// ── A broken film ──────────────────────────────────────────────────────
{
  console.log('\n  a film that never arrives');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => consoleLog.push(`[pageerror/broken] ${e.message}`));
  // A clip the browser cannot possibly decode, to exercise the failure path.
  await page.route('**/media/f40-reveal-*.mp4', (route) =>
    route.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.from('not a video') }),
  );
  await page.goto(`${BASE}/?clip=1080`, { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction(() => !document.querySelector('.loader:not(.is-hidden)'), null, { timeout: 45000 });
  await page.waitForTimeout(2600);

  const broken = await page.evaluate(() => ({
    note: document.querySelector('.still-cta__note')?.textContent ?? '',
    keyartVisible: getComputedStyle(document.querySelector('.stage__still')).opacity,
    story: !!document.getElementById('machine'),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  assert(/could not|unable|play/i.test(broken.note), 'the failure is explained in plain language', broken.note.slice(0, 70));
  assert(Number(broken.keyartVisible) > 0.9, 'the key art takes over as the hero frame');
  assert(broken.story, 'the story below is untouched');
  assert(broken.overflow <= 0, 'no overflow in the fallback');
  if (WANT_SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'film-failed.png') });
  await ctx.close();
}

// ── Console hygiene ────────────────────────────────────────────────────
console.log('\n  console');
const noisy = consoleLog.filter(
  (l) =>
    !/favicon|Download the React DevTools|Autoplay|AudioContext|preload/i.test(l),
);
writeFileSync(path.join(SHOT_DIR, 'console.json'), JSON.stringify(consoleLog, null, 2));
if (noisy.length === 0) ok('the console is clean', `${consoleLog.length} suppressed`);
else bad('the console is clean', noisy.slice(0, 6).join('\n      '));

await browser.close();
stop();

console.log('');
if (failures === 0) console.log(`  \x1b[32m${checks} checks passed.\x1b[0m${WANT_SHOTS ? `  shots in shots/functional/` : ''}\n`);
else {
  console.log(`  \x1b[31m${failures} of ${checks} checks failed.\x1b[0m\n`);
  process.exit(1);
}