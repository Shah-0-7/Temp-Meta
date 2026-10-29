# Manual QA checklist

Run in desktop Chrome with a real webcam. Tick each box; note the browser, machine and camera.

## First run

- [ ] `pnpm install`, `pnpm setup:assets`, `pnpm check:setup` finishes with no FAIL
- [ ] `pnpm typecheck` and `pnpm test` pass
- [ ] `pnpm dev` starts web (5173) and server (3001) with no errors in either console
- [ ] First visit opens the walkthrough; Skip and Start both close it; it does not reappear on reload
- [ ] `?` reopens it; the Keyboard shortcuts tab lists every shortcut
- [ ] Camera permission: Allow works; Block shows a readable reason and "Upload a Photo Instead" works

## Camera and performance

| Preset | Expected | OK |
|---|---|---|
| 480p | Preview smooth, tracking runs | [ ] |
| 720p | Preview smooth at 30 fps | [ ] |
| 1080p | Preview matches a plain `<video>` in sharpness; 30 fps on a mid-range laptop | [ ] |
| FPS cap Uncapped / 30 / 60 | Perf HUD (P) shows the cap being respected | [ ] |

- [ ] Switching resolution while live keeps the camera running (no black frame, no reload)
- [ ] Changing the camera device in Settings works; unplugging a camera shows an error, not a frozen frame
- [ ] Auto-adapt: run a heavy tab alongside; a notice reports the step down, and another reports the step back up after load drops
- [ ] Perf HUD (P) shows FPS, frame time, p95 and tracking time

## Tracking and guidance

- [ ] Standing too close shows "Step back"; too far shows "Move closer"; turned 45 degrees shows "Turn to face the camera"
- [ ] Shoulders out of frame shows "Make sure both shoulders are inside the frame"
- [ ] Hints appear after a short delay and clear within about half a second of fixing the pose (no flicker)
- [ ] Debug overlay (D) skeleton sits on the body and the mask matches the silhouette
- [ ] Landmarks are steady when standing still (no visible shaking)

## Garment and fit

- [ ] Each of the 3 samples loads with one click and no server
- [ ] Pasting 10 different product URLs (mix of large retailers and small shops): at least 8 resolve or fall back cleanly to upload
- [ ] Upload a photo and drag-and-drop both work
- [ ] The garment stays attached through arm raise, lean, and a head/torso turn up to about 30 degrees, with no flicker
- [ ] A hand across the chest renders in front of the garment; hair stays over the collar
- [ ] Leaving the frame fades the garment out; returning fades it back (no pop)
- [ ] Mirror toggle (M) flips the view without swapping left and right sleeves

## Realistic render and gallery

- [ ] Space renders; the compare slider works with mouse and keyboard arrows
- [ ] Download PNG opens as a valid, full-resolution image
- [ ] No person in frame gives a clear message with a Try again button; no garment selected offers "Choose a garment"
- [ ] Retake works; the result is saved to the gallery automatically
- [ ] Gallery (V): open, download, delete, "Delete all"; ticking two enables Compare; the third tick drops the oldest
- [ ] Reload empties the gallery (expected)

## Keyboard and accessibility

- [ ] Every shortcut works; none fires while typing in the URL box
- [ ] While any dialog is open, only Esc and ? respond; Esc closes the top-most panel first
- [ ] Tab stays inside open dialogs and focus returns to the opener on close
- [ ] Visible focus ring on every control
- [ ] Pose hints and the LIVE AI bar are announced by a screen reader
- [ ] The page works at 200% zoom

## Offline and privacy

- [ ] With the network off (after `pnpm setup:assets`), the camera, tracking, samples and Realistic render all work
- [ ] DevTools Network during live preview and Realistic render shows no request carrying image data to another host
- [ ] No keys or secrets in the browser bundle or network tab

## Optional: live AI try-on (only with the flag and a Decart key)

- [ ] The Live AI button appears only when `FEATURE_REALTIME_TRYON=true` and a key is set
- [ ] Starting shows the consent dialog naming Decart; Cancel starts nothing
- [ ] LIVE AI bar shows connecting, then the timer; Stop ends the session and restores the camera resolution
- [ ] Session stops at the time limit, when the tab is hidden, and when the camera is stopped
- [ ] Changing the garment while live swaps it without reconnecting
- [ ] `/api/token` called repeatedly is rate limited; the response never contains the permanent key

## Look and feel (check once in a real browser)

- [ ] Young Serif and Hanken Grotesk load (the wordmark and headings are serif, the interface is sans). Offline, system fonts take over and the layout should still hold.
- [ ] First screen: the pattern drawing animates in once, then stays. With "reduce motion" on, it appears already drawn.
- [ ] Garment, settings, gallery, help and consent are opaque paper, readable over the camera.
- [ ] Phone width (about 390 px): header fits without overlap, nothing scrolls sideways.
- [ ] Keyboard: Tab shows a visible ring on every control, and the closed garment panel is skipped.
