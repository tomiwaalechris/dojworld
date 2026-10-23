/* Run from the repository root. Requires Playwright and a local Chromium install. */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'public/product-video');
const scratch = process.env.COASTLINE_VIDEO_SCRATCH || '/private/tmp/coastline-product-video';
fs.mkdirSync(scratch, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  let encoder;
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(pathToFileURL(path.join(output, 'composition.html')).href + '?render');
    await page.waitForFunction(() => window.coastlineFilm?.ready);
    const samples = [3.5, 11, 22, 32, 42.8, 53, 60, 69];
    for (let i = 0; i < samples.length; i++) {
      await page.evaluate(t => window.coastlineFilm.draw(t), samples[i]);
      await page.locator('canvas').screenshot({ path: path.join(scratch, `scene-${i + 1}.png`) });
      if (i === 0) await page.locator('canvas').screenshot({ path: path.join(output, 'poster.jpg'), type: 'jpeg', quality: 90 });
    }
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('Checked all eight scenes; no browser errors.');
    if (process.argv.includes('--check')) return;
    const executable = process.env.COASTLINE_VIDEO_ENCODER;
    if (!executable) throw new Error('Set COASTLINE_VIDEO_ENCODER to the compiled encode.swift executable.');
    const fps = 30;
    encoder = spawn(executable, [path.join(scratch, 'silent.mp4'), String(fps),
      path.join(scratch, 'score.wav'), path.join(output, 'coastline-pms-product-video.mp4')],
      { stdio: ['pipe', 'inherit', 'inherit'] });
    let encoderError;
    const done = new Promise((resolve, reject) => {
      encoder.once('error', reject);
      encoder.once('exit', code => code === 0 ? resolve() : reject(new Error(`Video encoder exited with ${code}`)));
    });
    done.catch(err => { encoderError = err; });
    encoder.stdin.on('error', err => { encoderError = err; });
    for (let frame = 0; frame < fps * 72; frame++) {
      if (encoderError) throw encoderError;
      const jpeg = await page.evaluate(t => {
        window.coastlineFilm.draw(t);
        return document.getElementById('film').toDataURL('image/jpeg', .9).split(',')[1];
      }, frame / fps);
      const data = Buffer.from(jpeg, 'base64');
      const header = Buffer.alloc(4); header.writeUInt32BE(data.length);
      if (!encoder.stdin.write(Buffer.concat([header, data]))) await once(encoder.stdin, 'drain');
      if (frame % 300 === 0) console.log(`Rendering ${frame / fps}s / 72s`);
    }
    encoder.stdin.end();
    await done;
    console.log('Finished 1920 × 1080, 30 fps MP4 with original music.');
  } finally {
    await browser.close();
    if (encoder && encoder.exitCode === null) encoder.kill();
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
