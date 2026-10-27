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
- **Cannot repaint what you are wearing.** Your own sleeves or collar can peek out around the garment. A plain, fitted top works best. Meta Muse Image removes this limitation once connected.
- **No generated folds.** Creases come from your own clothes via lighting transfer, not from simulated fabric.
- **Front view only.** Turn to face the camera; the app tells you when you are turned.
- **Cut-out limits.** White garments on white backgrounds, or stripes touching the garment edge, can be cut by the flood-fill segmenter. Use manual select, or Meta SAM once connected.

## Tier B — Realistic Photo (Meta Muse Image, server-side generation, not yet connected)

### What it can do
- Photorealistic try-on using Meta Muse Image
- Natural drape, folds, creases that match the person's pose and body
- Preserves face, identity, background, and lighting

### What it cannot do
- **Not real-time.** Generation takes 2–5 seconds per image.
- **Occasional artifacts.** AI generation may alter small details (logos, text on garments) or produce minor inconsistencies.
- **One garment at a time.** Multi-garment try-on (e.g., top + bottom) is not supported yet.

## General

- **Desktop Chrome only.** Other browsers and mobile are not tested.
- **Webcam quality matters.** Low-light or low-resolution cameras produce worse tracking and overlay quality.
- **URL resolution.** Some e-commerce sites block automated fetching. The app falls back to manual upload.
- **No size recommendation.** The app does not predict or recommend garment sizes.
