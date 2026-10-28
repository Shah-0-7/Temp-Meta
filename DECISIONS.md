# DECISIONS.md — TryAnywhere

Architectural and technical decisions made during development.  
Each entry records what was decided, why, and any alternatives considered.

---

## D1 — Package manager: pnpm
**Date:** 2026-10-25  
**Decision:** Use pnpm with workspaces.  
**Why:** Strict dependency isolation, fast installs, native workspace support. npm/yarn hoisting issues are avoided.

## D2 — TypeScript strict mode
**Date:** 2026-10-25  
**Decision:** `strict: true` in all tsconfig files.  
**Why:** Catches bugs at compile time. The brief mandates strict TS.

## D3 — Tailwind CSS v4 (via Vite plugin)
**Date:** 2026-10-25  
**Decision:** Use Tailwind CSS v4 with the `@tailwindcss/vite` plugin.  
**Why:** User specified Tailwind. v4 uses the new `@theme` directive and is CSS-first (no `tailwind.config.js`). Simpler setup.

## D4 — Provider architecture: typed interfaces + registry
**Date:** 2026-10-25  
**Decision:** All AI capabilities go through typed TS interfaces in `packages/engine/providers`. A `ProviderRegistry` picks one implementation per capability from config. Default implementations work without API keys.  
**Why:** Meta API access arrives later. The app must work end-to-end with defaults and swap to Meta providers via config only (no engine/UI changes).  
**Alternatives:** Direct API calls with feature flags — rejected because it couples the engine to a specific vendor.

## D5 — Custom One Euro Filter (not npm)
**Date:** 2026-10-25  
**Decision:** Implement the 1€ filter ourselves (~50 LOC) instead of using `1eurofilter` or `@webarkit/oneeurofilter-ts`.  
**Why:** The algorithm is trivial and well-documented. A custom implementation gives full control over per-landmark tuning and avoids a dependency for minimal code. The npm packages add no value over the paper reference.

## D6 — Raw WebGL2 (no Three.js)
**Date:** 2026-10-25  
**Decision:** Use raw WebGL2 APIs for all rendering.  
**Why:** Three.js adds ~600KB to the bundle and most of its features (3D scene graph, materials, loaders) are unnecessary. We need a 2D textured mesh with custom shaders. Raw WebGL2 gives complete control over the render pipeline and minimizes overhead.

## D7 — BrowserSAM (SlimSAM ONNX) for default segmentation
**Date:** 2026-10-25  
**Decision:** Use SlimSAM via ONNX Runtime Web (WebGPU → WASM fallback) as the default `GarmentSegmenter`.  
**Status:** Placeholder stub for now; real model loading in M3.  
**Why:** Runs entirely in the browser — no server needed for default garment segmentation. SlimSAM is smaller than SAM2-tiny.  
**Open:** Benchmark SlimSAM vs SAM2-tiny in M3 and pick whichever has better quality/speed tradeoff on clothing.

## D8 — TPS warp for mesh deformation
**Date:** 2026-10-25  
**Decision:** Use Thin Plate Spline (TPS) warp for deforming the garment mesh, computed on CPU, applied via WebGL2 vertex buffer updates.  
**Why:** TPS is the standard for sparse-point non-rigid 2D warping. More flexible than linear blend skinning for a small number of control points. CPU compute is acceptable since we only have ~10–20 control points and recompute only when landmarks change beyond a threshold.  
**Open:** If TPS proves too slow, switch to linear blend skinning (faster but less flexible).

## D9 — Hono for the server
**Date:** 2026-10-25  
**Decision:** Use Hono on Node.js for the API server.  
**Why:** Lightweight, web-standard `fetch` API, good TypeScript support, middleware ecosystem. Specified in the brief.

## D10 — Selfie multiclass segmenter for tracking
**Date:** 2026-10-25  
**Decision:** Use MediaPipe's `selfie_multiclass_256x256.tflite` for image segmentation.  
**Why:** Provides per-pixel class masks for background (0), hair (1), body-skin (2), face-skin (3), clothes (4), and accessories (5). This is exactly what we need for shading transfer (clothes mask), occlusion (skin/hair masks), and edge cleanup — all from a single lightweight model.

## D11 — Decoupled tracking pipeline
**Date:** 2026-10-25  
**Decision:** TrackingPipeline runs at a configurable rate (default 30fps), decoupled from the render loop (which runs at display refresh rate).  
**Why:** Tracking inference (20–30ms) is slower than render frames (< 8ms). Decoupling allows the render loop to interpolate between tracking results for smooth animation without dropping frames.

## D12 — CDN-hosted MediaPipe models
**Date:** 2026-10-25  
**Decision:** Load MediaPipe WASM + model files from `cdn.jsdelivr.net` and `storage.googleapis.com` respectively.  
**Why:** Avoids bundling ~12MB of WASM/model files. CDN caching gives fast subsequent loads. Models can be updated without rebuilding the app.  
**Alternative:** Self-host in `public/models/` — defer to later if CDN latency is a problem.

## D13 — Auto-adapt quality cascade
**Date:** 2026-10-25  
**Decision:** AutoAdapt monitors p95 frame time and cascades: tracking rate (30→20→15), then disable segmentation. Steps down after 2s overload, up after 5s headroom.  
**Why:** Ensures the app stays responsive on slower hardware. Users see a toast notification on each step. Manual override available in settings.

## D14 — MLS warp replaces Gaussian-blend / TPS
**Date:** 2026-10-27  
**Decision:** Deform the garment mesh with Moving Least Squares (similarity) in an isotropic space (x scaled by aspect ratio). Pins: shoulders, armpits, hem, neck, and sleeve ends along shoulder→elbow→wrist.  
**Why:** Similarity MLS keeps the fabric's shape (no shear) while following the body, needs no matrix solve per frame, and is stable with 8-12 pins. Supersedes D8 (TPS). The hem is as wide as the shirt, not the hip joints, so shirts do not taper. Missing hips are extrapolated from shoulders.

## D15 — Premultiplied alpha end to end
**Date:** 2026-10-27  
**Decision:** Upload garments premultiplied (with mipmaps and anisotropic filtering) and blend with `ONE, ONE_MINUS_SRC_ALPHA`.  
**Why:** Removes light/dark halos on cut-out edges and keeps the canvas opaque.

## D16 — Garment cut-out without a model
**Date:** 2026-10-27  
**Decision:** Existing alpha, else border-colour flood fill, then component filtering, erode+feather, defringe and tight crop. Anchors are measured from the silhouette. Falls back to the whole image when confidence is low.  
**Why:** Works offline with no API key; Meta SAM 3.1 later replaces it through `GarmentSegmenter`. Known weakness: white-on-white edges (use manual select).

## D17 — Local "Realistic render" is the default TryOnGenerator
**Date:** 2026-10-27  
**Decision:** `LocalTryOnGenerator` (name `local`) renders the captured frame at full resolution with frame-exact pose and segmentation, a 40x40 mesh, MSAA and lighting transfer. It runs on-device; nothing is uploaded. Meta Muse Image implements the same `TryOnGenerator` interface later. `createAppRegistry` registers it as the default.  
**Why:** Lets the full flow work and be demoed before Meta keys arrive. It cannot repaint what the user is wearing (see KNOWN_LIMITATIONS).

## D18 — One camera manager, driven by requestVideoFrameCallback
**Date:** 2026-10-27  
**Decision:** `getCameraManager()` is a true singleton. Tracking runs on `requestVideoFrameCallback`, with strictly increasing timestamps, segmentation on every 2nd tick, and a constraint fallback chain for cameras that reject the requested size.  
**Why:** The previous code created a manager per component, so the preview and tracker used different cameras.

## D19 — One Euro filter retuned for normalized coordinates
**Date:** 2026-10-27  
**Decision:** `minCutoff 1.0, beta 12, dCutoff 1.0` (exported as `POSE_FILTER_DEFAULTS`).  
**Why:** The old beta (0.01) is meant for pixel units and lagged about 0.2 s on normalized 0..1 landmarks.

## D20 — MediaPipe assets: same-origin first, pinned CDN second
**Date:** 2026-10-27  
**Decision:** `scripts/setup-assets.mjs` copies the WASM and downloads models to `apps/web/public/{mediapipe,models}` (git-ignored). At runtime the app probes the local files (rejecting SPA HTML fallbacks) and otherwise uses the CDN at the pinned version `1.1.1`. Supersedes D12's `@latest`.  
**Why:** Offline demos, no WASM/JS version mismatch.

## D21 — Snapshot gallery is memory-only
**Date:** 2026-10-28  
**Decision:** Renders are kept in an in-memory Zustand store (max 12, oldest evicted, object URLs revoked). Nothing goes to localStorage, IndexedDB or the server.  
**Why:** Snapshots contain the user's face; the brief forbids storing faces or frames. Trade-off: they vanish on reload. The list logic is pure (`lib/snapshotList.ts`) and unit-tested.

## D22 — Shortcuts defined once; dialogs share a focus trap
**Date:** 2026-10-28  
**Decision:** `lib/shortcuts.ts` is the single list used by the key handler, footer and help dialog. While a dialog is open only `Esc` and `?` act, and `Esc` closes the top-most layer first. Dialogs use `useFocusTrap` (focus in, Tab contained, focus restored).  
**Why:** Prevents the help text drifting from behaviour, and stops Space starting a render behind an open dialog.

## D23 — Muted text colour raised for contrast
**Date:** 2026-10-28  
**Decision:** `--color-text-muted` `#6b6b80` -> `#8c8ca6` (4.7:1 to 6.0:1 on the surface tokens; the old value was 2.9:1 to 3.8:1).  
**Why:** WCAG AA for body text.

## D24 — Decart behind a vendor-neutral port
**Date:** 2026-10-28  
**Decision:** `DecartRealtimeTryOn` (engine) depends on a small `RealtimeSdk` port; the only file importing `@decartai/sdk` is `apps/web/src/lib/decartAdapter.ts`. `RealtimeSession` gained state, error and billed-seconds events, and `RealtimeTryOnError` carries vendor-neutral codes.  
**Why:** Keeps vendor types out of the engine (brief rule), lets the provider be tested with a fake SDK, and means a future Meta video model is one new adapter.

## D25 — Live AI is opt-in at three levels
**Date:** 2026-10-28  
**Decision:** (1) server flag + key, reported through `/api/health` so the UI hides the button otherwise; (2) per-session consent naming Decart and what is sent; (3) hard session cap, stop on tab-hide or camera-off.  
**Why:** It streams video to a third party and costs money per second.

## D26 — Short-lived token, key stays server-side
**Date:** 2026-10-28  
**Decision:** `POST /api/token` mints a 120 s Decart client token (rate limited per client, `Cache-Control: no-store`, vendor errors hidden and keys redacted in logs). The browser SDK fetches a fresh one on every connect via `apiKeyProvider`. Active sessions outlive the token (per the docs).  
**Why:** The permanent key must never reach the browser.

## D27 — One provider registry in the web app
**Date:** 2026-10-28  
**Decision:** `lib/appRegistry.ts` builds the registry once, after asking the server which optional features exist. Optional providers register only when available. The render hook now uses it.  
**Why:** Config-only switching and no UI for features that cannot work.

