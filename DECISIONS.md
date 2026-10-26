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
