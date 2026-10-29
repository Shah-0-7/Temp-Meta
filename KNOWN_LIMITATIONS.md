# Known Limitations — TryAnywhere

This document honestly describes what works and what doesn't.  
Updated as development progresses.

---

## Tier A — Fast Preview (client-side)

### What it can do
- Real-time garment overlay at up to 1080p
- Follows body pose (shoulders, arms, torso) via MediaPipe landmarks
- Shading transfer: shoulder creases and ambient lighting carry onto the garment
- Occlusion: arms/hands render over the garment; hair renders over the collar
- Works entirely in the browser — camera frames never leave the device

### What it cannot do
- **No true fabric physics.** The garment is a 2D textured mesh warped by sparse control points. It does not simulate cloth draping, collision, gravity, or inertia. For realistic fabric behavior, use Tier B ("Realistic render").
- **Limited body coverage.** Currently supports tops and outerwear only. Bottoms, dresses, hats, glasses, and shoes are architecturally supported but not implemented.
- **Profile / rear views.** Warp quality degrades significantly beyond ~30° torso rotation. The garment may detach or distort at extreme angles.
- **Long sleeves.** Sleeves longer than the upper arm are mapped along the arm but tend to bunch at the shoulder (seen with a long-sleeve test garment). Short-sleeve tops fit best; long sleeves are not tuned yet.
- **Complex layering.** Wearing multiple garments (e.g., jacket over shirt) is not supported in this release.
- **Extreme poses.** Rapid or extreme arm movements can cause the garment mesh to lag or distort until landmarks stabilize.
- **Transparent / sheer garments.** The renderer treats the garment as opaque. Semi-transparent fabrics won't look correct.
- **Size accuracy.** The "fit" slider is cosmetic (scales mesh width). It does not account for actual garment sizing or body measurements.

## Tier B — Realistic Photo, local renderer (default, no API key)

### What it can do
- Re-renders the captured frame at full camera resolution (up to 2048 px) with a finer mesh, frame-exact pose/segmentation and lighting transfer
- Keeps face, hair and hands in front of the garment
- Runs entirely on-device; nothing is uploaded. Works offline once `pnpm setup:assets` has run
- Download as PNG, before/after compare slider, and a "upload a photo" fallback

### What it cannot do
- **Cannot repaint what you are wearing.** Your own sleeves or collar can peek out around the garment. A plain, fitted top works best. The optional free AI render (Leffa) repaints the garment instead, which avoids this.
- **No generated folds.** Creases come from your own clothes via lighting transfer, not from simulated fabric.
- **Front view only.** Turn to face the camera; the app tells you when you are turned.
- **Cut-out limits.** White garments on white backgrounds, or stripes touching the garment edge, can be cut by the flood-fill segmenter. Use manual select, or a model-based segmenter once one is connected.

## Tier B — Realistic Photo (on-device by default; optional free AI model)

### What it can do
- Photorealistic try-on using the optional free AI model (Leffa), when the server enables it
- Natural drape, folds, creases that match the person's pose and body
- Preserves face, identity, background, and lighting

### What it cannot do
- **Not real-time.** The on-device render takes a few seconds. The free AI model queues on a shared GPU and can take well over a minute.
- **Occasional artifacts.** AI generation may alter small details (logos, text on garments) or produce minor inconsistencies.
- **One garment at a time.** Multi-garment try-on (e.g., top + bottom) is not supported yet.

## Free AI render (Leffa on a Hugging Face Space)

- **Never run against the live Space.** It was written from the Space's source code and Hugging Face's API docs. Two details are unconfirmed: the endpoint name (`leffa_predict_vt`, Gradio's default because the Space sets none) and the upload step. `pnpm check:free-tryon` confirms both. If the Space has changed or sleeps, the app falls back to the on-device render.
- **Small, shared free quota.** Hugging Face documents 2 minutes of GPU a day for anonymous callers and 5 with a free account. Expect "busy or out of quota" fallbacks. Use `HF_TOKEN` or duplicate the Space for anything beyond a demo.
- **Your photo goes to a third-party service**, and this app cannot control what that service keeps. Consent is asked every session.
- **Tops and jackets only.** Bottoms, dresses and accessories are refused by the server because only the upper-body option was confirmed.
- **Output framing is the model's.** Leffa works on portrait images, so a wide webcam frame may come back cropped or padded. Not yet checked.
- **Garment accuracy.** Prints, logos and fine detail can differ from the real garment; the result is labelled as AI-generated.
- **No refinement and no segmentation or understanding from this model.**

## Tier C: live AI try-on (Decart, optional)

- **Off by default** and hidden unless the server has the flag and a key. It is a third-party service: the live camera video leaves the device (after consent) and usage is billed per second.
- **Not tested against the live service.** It is built from Decart's docs and a fake SDK in tests; no key was available during development. Expect first-run fixes.
- **Session cap** of 5 minutes (configurable) and it ends when the tab is hidden. The camera is switched to 720p while it runs and restored afterwards.
- **Tracked overlay stays under it.** The live AI video covers the on-device preview while running; the AI decides the fit, so it is not as controllable as Tier A, and it can alter details of the garment.
- **Mirror and latency** follow Decart's behaviour; the view is mirrored in CSS to match the normal preview.
- **Model scoping is not applied** to tokens (the docs show concrete ids and `lucy-vton-latest` is an alias).
- **The SDK is not installed by default.** `@decartai/sdk` is not in `package.json` (the lockfile could not be regenerated here, and CI uses a frozen lockfile). Without it the build uses a stub and the Live AI button reports that the SDK is missing. Install it with `pnpm add @decartai/sdk --filter @tryanywhere/web --filter @tryanywhere/server` and commit the lockfile.

## General

- **Deployed site has no server by default.** A production build only contacts an API if `VITE_API_URL` is set. On the Cloudflare static deploy, product-link lookup and Live AI are unavailable (upload and samples work).
- **Meta models are not connected.** SAM 3.1, Muse Spark and Muse Image are not wired in. Early Meta client work exists on the unpushed branch `m6-meta-wip`. Segmentation and image understanding use the on-device defaults.
- **No click/box manual cut-out.** If the automatic cut-out is wrong you can pick another image, upload a cleaner photo, or use a sample. A click-to-select refinement is not built.
- **Sample garments are synthetic** drawings made for this project; they exist for first-run demos, not as a product catalogue.
- **Gallery is session-only.** Snapshots are not saved anywhere and are lost on reload. Download the ones you want.
- **Accessibility is basic.** Dialogs trap focus and have labels, text contrast meets AA, and the live pose hints are announced. The live camera canvas itself has no non-visual equivalent, and no full screen-reader audit has been done.
- **Onboarding remembers itself in `localStorage`;** if the browser blocks storage it shows again each visit.
- **Desktop Chrome only.** Other browsers and mobile are not tested.
- **Webcam quality matters.** Low-light or low-resolution cameras produce worse tracking and overlay quality.
- **URL resolution.** Some e-commerce sites block automated fetching. The app falls back to manual upload.
- **No size recommendation.** The app does not predict or recommend garment sizes.
