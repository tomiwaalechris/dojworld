/* Verify the actual encoded MP4 and preview, rather than just the animation source. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const preview = process.env.COASTLINE_VIDEO_PREVIEW_URL || 'http://127.0.0.1:8787/index.html';
const scratch = process.env.COASTLINE_VIDEO_SCRATCH || '/private/tmp/coastline-product-video';
const assert = (value, message) => { if (!value) throw new Error(message); };

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1180 } });
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(preview);
    await page.waitForFunction(() => document.getElementById('video').readyState >= 2);
    const metadata = await page.evaluate(() => {
      const video = document.getElementById('video');
      return { duration: video.duration, width: video.videoWidth, height: video.videoHeight,
        captions: video.textTracks.length, chapters: document.querySelectorAll('.chapter').length };
    });
    assert(Math.abs(metadata.duration - 72) < .05, 'Video duration should be 72 seconds');
    assert(metadata.width === 1920 && metadata.height === 1080, 'Video should be Full HD');
    assert(metadata.captions === 1 && metadata.chapters === 8, 'Captions and all eight chapters must be available');
    await page.getByRole('button', { name: 'Play Guest folio chapter', exact: true }).click();
    await page.waitForFunction(() => { const v = document.getElementById('video'); return !v.paused && v.currentTime >= 35 && v.currentTime < 37; });
    await page.evaluate(() => { const v = document.getElementById('video'); v.pause(); v.currentTime = 42.8; });
    await page.waitForFunction(() => { const v = document.getElementById('video'); return !v.seeking && v.readyState >= 2; });
    await page.locator('video').screenshot({ path: path.join(scratch, 'encoded-folio.png') });
    await page.evaluate(() => { document.getElementById('video').currentTime = 69; });
    await page.waitForFunction(() => !document.getElementById('video').seeking);
    await page.locator('video').screenshot({ path: path.join(scratch, 'encoded-outro.png') });
    await page.screenshot({ path: path.join(scratch, 'preview-desktop.png'), fullPage: true });
    const captionInfo = await page.evaluate(async () => {
      const track = document.querySelector('track'); track.track.mode = 'hidden';
      await new Promise((resolve, reject) => {
        if (track.readyState === 2) return resolve();
        track.addEventListener('load', resolve, { once: true });
        track.addEventListener('error', reject, { once: true });
      });
      return track.track.cues.length;
    });
    assert(captionInfo === 8, 'All eight English caption cues should load');
    await page.setViewportSize({ width: 390, height: 844 });
    const fitsMobile = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    assert(fitsMobile, 'Mobile preview must not overflow horizontally');
    await page.screenshot({ path: path.join(scratch, 'preview-mobile.png'), fullPage: true });
    const download = await page.getByRole('link', { name: 'Download product video ↓' }).getAttribute('href');
    assert(download.endsWith('.mp4'), 'Download should link to the MP4');
    assert(!errors.length, errors.join('\n'));
    fs.writeFileSync(path.join(scratch, 'verification.json'), JSON.stringify({ ...metadata, captionCues: captionInfo, playback: 'passed', chapterSeeking: 'passed', mobileLayout: 'passed', browserErrors: errors }, null, 2));
    console.log(JSON.stringify({ ...metadata, captionCues: captionInfo, playback: 'passed', chapterSeeking: 'passed', mobileLayout: 'passed', browserErrors: errors }));
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
