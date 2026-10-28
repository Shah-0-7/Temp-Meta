# Demo script (2 minutes)

Two versions. **A** works today with no API keys. **B** adds the Meta model beats; those parts depend on milestone M6 (Meta providers), which is not wired in yet, so do not present B as working until it is.

## Before you record (30 seconds)

- `pnpm check:setup` shows no FAIL. Run `pnpm setup:assets` once so tracking starts instantly and offline.
- `pnpm dev`, open `http://localhost:5173` in Chrome.
- Good light on your face, plain wall behind you, a plain fitted top (grey or white works best), arms slightly away from your body.
- Close the help dialog. Camera off at the start so the permission moment is visible.
- Have one real product page URL copied (a plain tee on a white background works best), and the three built-in samples as the backup.

## Version A: works today

| Time | You do | You say |
|---|---|---|
| 0:00 | App open, camera off. | "Online shopping has one problem: you cannot see it on you. TryAnywhere puts a garment from any store on you, live, in the browser." |
| 0:15 | Click **Enable Camera**. Stand too close on purpose. | "Everything you see in the live preview runs on this laptop. No video leaves it." The hint "Step back a little" appears. Step back; it clears. "It tells you what to fix instead of showing a broken overlay." |
| 0:35 | Press **G**. Paste the product URL, pick the image. If the URL fails, click a sample instead. | "Paste a link from any store. It finds the product photo and cuts the garment out. If a site blocks us, upload a photo or use a sample." |
| 0:55 | Move: raise an arm, lean, put a hand across your chest. | "It follows the body, and your hands and hair stay in front of the garment." |
| 1:15 | Press **P** (perf HUD), open Settings, switch 1080p to 720p. | "Slow laptop? Pick a lower resolution or frame rate, and Auto-adapt backs off for you. Quality is the default; speed is an option." |
| 1:30 | Press **Space**. Drag the compare slider. | "For a photo-quality version, one key re-renders this exact moment at full resolution. Also on-device." Click **Download PNG**. |
| 1:45 | Pick a second garment, press Space again. Press **V**, tick both, **Compare**. | "Every render is saved for this session so you can compare outfits. Nothing is stored; it all vanishes on reload." |
| 1:55 | Show the architecture diagram in the README. | "Every AI step is behind an interface with a working default, so Meta's models drop in by configuration, not rewrites." |

## Version B: with the Meta models (after M6)

Replace or extend these beats once the providers are connected. Say only what you have verified live.

| Model | Where it shows | What to say |
|---|---|---|
| SAM 3.1 | Garment panel: type "shirt" or click the garment on a busy photo. | "SAM 3.1 isolates exactly the garment from a messy product photo, from a text prompt or a click." |
| Muse Spark | Pasting a product link with many images. | "Muse Spark looks at every image on the page, picks the best one for try-on and describes the garment." |
| Muse Image | Press **Space**. The consent dialog names Meta. | "For true photorealism, Muse Image redraws the garment on me with real folds and creases. It asks first, because this one sends the frame to Meta." |

## If something goes wrong on camera

- **Garment looks off:** it is almost always a busy background in the photo. Say "a plain photo works best" and switch to a sample.
- **Hint will not clear:** step back until head and hips are in view and face the camera.
- **Camera blocked:** use **Upload a Photo Instead** on the permission screen and show the Realistic render with a still photo.
- **Server not running:** the camera, samples and render all still work. Only URL paste needs the server.

## Claims to avoid (not true yet)

- Live "AI-quality" in the on-device preview. It is a fast warp, not generated cloth.
- Anything about sizing or fit recommendations.
- Mobile support, or support for browsers other than desktop Chrome.
- Meta models working, until M6 is done and tried with a real key.
