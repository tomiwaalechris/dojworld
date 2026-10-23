# Coastline PMS product walkthrough

The finished video and preview live in `public/product-video/`:

- `coastline-pms-product-video.mp4`: 72-second, 1920 × 1080, 30 fps H.264/AAC video.
- `index.html`: accessible video player with eight chapter buttons and a download link.
- `composition.html` and `film.js`: editable, deterministic canvas animation with play/pause and scrubbing.
- `captions.vtt`: English captions. Explanatory captions are also drawn directly into the film.
- `poster.jpg`: video poster.
- `geist.woff2` and `OFL.txt`: the app’s Geist font and its license.

With the app running, open `/product-video/index.html`. The preview also works as a local HTML file. No app database or login is required.

To watch without starting the app, run `node scripts/product-video/preview.cjs` and open `http://127.0.0.1:8787/index.html`. This server only serves the video’s artifact directory, binds to localhost and supports byte ranges for immediate chapter seeking. Set `COASTLINE_VIDEO_PREVIEW_PORT` to use a different port.

## Content

| Time | Scene |
| --- | --- |
| 0:00 | Meet Coastline |
| 0:07 | Dashboard and room occupancy |
| 0:15 | Availability and a reservation |
| 0:26 | Ready room and guest check-in |
| 0:35 | Posted room nights, extras, applied deposit, payment and checkout |
| 0:46 | Housekeeping: dirty → clean → inspected |
| 0:55 | Posted revenue, expenses and financial statements |
| 1:05 | Coastline closing card |

All UI screens are enlarged animated illustrations based on the app’s implemented workflows and `docs/user-manual.md`. They are not recordings of live customer data. Guest names, room counts, dates and financial figures are illustrative, as labeled in the film and preview.

The sample stay is two nights at ₦85,000: ₦170,000 in posted room charges plus ₦10,000 laundry. A ₦50,000 advance is applied, followed by a ₦130,000 payment. The balance and unapplied deposit are zero before checkout. The finance illustration shows ₦180,000 revenue, ₦30,000 expenses and ₦150,000 net profit. Reservations are quotes, not posted revenue.

`score.py` synthesizes the original instrumental soundtrack. No third-party music, recordings or samples are used. There is no voiceover.

## Edit and render on macOS

Edit copy, scene timings and graphics in `public/product-video/film.js`. Keep the captions, preview chapter buttons and total length synchronized if timings change. Open `composition.html` to review the animation before exporting.

Rendering needs a local Playwright installation with Chromium, Python with NumPy, and the macOS Swift compiler. These are development tools only; the app has no new runtime dependencies. The encoder uses the macOS AVFoundation framework.

Run from the repository root:

```sh
mkdir -p /private/tmp/coastline-product-video
swiftc -module-cache-path /private/tmp/coastline-swift-cache scripts/product-video/encode.swift -o /private/tmp/coastline-video-encoder
python3 scripts/product-video/score.py /private/tmp/coastline-product-video/score.wav
PLAYWRIGHT_MODULE_PATH=/absolute/path/to/playwright node scripts/product-video/render.cjs --check
PLAYWRIGHT_MODULE_PATH=/absolute/path/to/playwright COASTLINE_VIDEO_ENCODER=/private/tmp/coastline-video-encoder node scripts/product-video/render.cjs
```

Omit `PLAYWRIGHT_MODULE_PATH` when Playwright resolves from Node normally. Set `COASTLINE_VIDEO_SCRATCH` to override the temporary render directory. The renderer saves eight scene PNGs for visual review, then exports the finished MP4. Intermediate silent video and audio stay in the temporary directory.

With the preview server running, use `PLAYWRIGHT_MODULE_PATH=/absolute/path/to/playwright node scripts/product-video/verify.cjs` to check the encoded video’s dimensions, duration, playback, chapter seeking, caption cues and mobile layout. It saves screenshots of the encoded film and preview to the temporary directory. Set `COASTLINE_VIDEO_PREVIEW_URL` if previewing on another port.
