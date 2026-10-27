/**
 * @module camera/CameraManager
 *
 * Manages the webcam lifecycle: permission, stream acquisition, device
 * enumeration, resolution switching, recovery, and the frame loop via
 * `requestVideoFrameCallback` (with `requestAnimationFrame` fallback).
 *
 * Framework-agnostic: the React layer observes state through callbacks.
 *
 * Robustness notes
 *   - Constraint fallback chain: saved device -> any camera -> any resolution, so a
 *     stale deviceId or an unsupported 1080p never leaves the user with a dead preview.
 *   - Resolution changes use `applyConstraints` on the live track (no black flash,
 *     no re-prompt); a full restart is only the fallback.
 *   - Concurrent `start()` calls are coalesced.
 *   - Unplugging the camera or another app grabbing it moves the state to `error`
 *     with a readable message instead of freezing on the last frame.
 *   - The <video> is attached to the DOM (hidden): some browsers throttle or stall
 *     detached video elements.
 */

import type {
  CameraState,
  CameraDevice,
  CameraOptions,
  FrameCallback,
  ResolutionPreset,
  Resolution,
} from './types.js';
import { RESOLUTION_PRESETS } from './types.js';

type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export class CameraManager {
  // ---- State ---------------------------------------------------------------

  private _state: CameraState = 'idle';
  private _stream: MediaStream | null = null;
  private _video: VideoWithRVFC | null = null;
  private _devices: CameraDevice[] = [];
  private _options: CameraOptions;
  private _actualResolution: Resolution | null = null;
  private _actualFps = 0;
  private _lastError: string | null = null;
  private _starting: Promise<void> | null = null;

  // ---- Frame loop ----------------------------------------------------------

  private _frameCallbacks = new Set<FrameCallback>();
  private _animFrameId: number | null = null;
  private _rVFCHandle: number | null = null;
  private _useRVFC = false;
  private _lastFrameTime = 0;
  private _minFrameInterval = 0; // ms, 0 = no cap

  // ---- Listeners -----------------------------------------------------------

  private _stateListeners = new Set<(state: CameraState) => void>();
  private _onDeviceChange = (): void => {
    void this.enumerateDevices();
  };

  constructor(options?: Partial<CameraOptions>) {
    this._options = {
      resolution: options?.resolution ?? '720p',
      deviceId: options?.deviceId,
      facingMode: options?.facingMode ?? 'user',
      fpsCap: options?.fpsCap ?? 0,
      mirror: options?.mirror ?? true,
    };
    this._updateMinFrameInterval();
  }

  // ---- Public API ----------------------------------------------------------

  get state(): CameraState { return this._state; }
  get stream(): MediaStream | null { return this._stream; }
  get video(): HTMLVideoElement | null { return this._video; }
  get devices(): CameraDevice[] { return [...this._devices]; }
  get actualResolution(): Resolution | null { return this._actualResolution; }
  /** Frame rate the camera driver reports (0 if unknown). */
  get actualFps(): number { return this._actualFps; }
  /** Human-readable reason for the last `error` / `denied` state. */
  get lastError(): string | null { return this._lastError; }
  get options(): Readonly<CameraOptions> { return { ...this._options }; }

  onStateChange(listener: (state: CameraState) => void): () => void {
    this._stateListeners.add(listener);
    return () => this._stateListeners.delete(listener);
  }

  onFrame(callback: FrameCallback): () => void {
    this._frameCallbacks.add(callback);
    return () => this._frameCallbacks.delete(callback);
  }

  async enumerateDevices(): Promise<CameraDevice[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this._devices = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${d.deviceId.slice(0, 4)}`,
        }));
      return this._devices;
    } catch {
      console.warn('[CameraManager] Failed to enumerate devices');
      return [];
    }
  }

  /** Start the camera with the current options. Safe to call repeatedly. */
  start(): Promise<void> {
    if (this._state === 'active') return Promise.resolve();
    if (this._starting) return this._starting;
    this._starting = this._start().finally(() => {
      this._starting = null;
    });
    return this._starting;
  }

  /** Stop the camera and release resources. */
  stop(): void {
    this._teardown();
    this._lastError = null;
    this._setState('idle');
  }

  /** Switch resolution; applies to the live track when possible. */
  async setResolution(preset: ResolutionPreset): Promise<void> {
    if (this._options.resolution === preset) return;
    this._options.resolution = preset;
    if (this._state !== 'active') return;

    const track = this._stream?.getVideoTracks()[0];
    const size = RESOLUTION_PRESETS[preset];
    if (track && size.width > 0) {
      try {
        await track.applyConstraints({
          width: { ideal: size.width },
          height: { ideal: size.height },
        });
        this._recordActualFormat();
        return;
      } catch (err) {
        console.warn('[CameraManager] applyConstraints failed, restarting stream:', err);
      }
    }
    this._teardown();
    await this.start();
  }

  /** Switch to a different camera device (restarts the stream). */
  async setDevice(deviceId: string): Promise<void> {
    if (this._options.deviceId === deviceId) return;
    this._options.deviceId = deviceId;
    if (this._state === 'active') {
      this._teardown();
      await this.start();
    }
  }

  setFpsCap(fps: number): void {
    this._options.fpsCap = fps;
    this._updateMinFrameInterval();
  }

  setMirror(mirror: boolean): void {
    this._options.mirror = mirror;
  }

  // ---- Start / teardown ----------------------------------------------------

  private async _start(): Promise<void> {
    this._lastError = null;
    this._setState('requesting');

    try {
      this._stream = await this._acquireStream();

      const video = document.createElement('video') as VideoWithRVFC;
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.disablePictureInPicture = true;
      // Keep it in the DOM but invisible: detached <video> can stall in Safari.
      Object.assign(video.style, {
        position: 'fixed', width: '1px', height: '1px', opacity: '0',
        pointerEvents: 'none', left: '0', top: '0',
      });
      video.srcObject = this._stream;
      document.body.appendChild(video);
      this._video = video;

      await video.play();
      if (video.videoWidth === 0) await this._waitForFrameSize(video, 3000);

      const track = this._stream.getVideoTracks()[0];
      track.addEventListener('ended', this._onTrackEnded);
      this._recordActualFormat();

      console.log(
        `[CameraManager] Started: ${this._actualResolution?.width}x${this._actualResolution?.height}` +
          ` @ ${this._actualFps || '?'}fps (requested ${this._options.resolution})`,
      );

      navigator.mediaDevices.addEventListener?.('devicechange', this._onDeviceChange);
      await this.enumerateDevices();

      this._setState('active');
      this._startFrameLoop();
    } catch (err) {
      this._teardown();
      const error = err as Error;
      this._lastError = describeCameraError(error);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        this._setState('denied');
      } else {
        console.error('[CameraManager] Failed to start camera:', error);
        this._setState('error');
      }
      throw err;
    }
  }

  /** Try progressively looser constraints so a stale device or odd resolution still works. */
  private async _acquireStream(): Promise<MediaStream> {
    const preset = RESOLUTION_PRESETS[this._options.resolution];
    const size: MediaTrackConstraints =
      preset.width > 0
        ? { width: { ideal: preset.width }, height: { ideal: preset.height } }
        : {};
    const rate: MediaTrackConstraints = { frameRate: { ideal: 30 } };

    const attempts: MediaTrackConstraints[] = [];
    if (this._options.deviceId) {
      attempts.push({ deviceId: { exact: this._options.deviceId }, ...size, ...rate });
    }
    attempts.push({ facingMode: this._options.facingMode, ...size, ...rate });
    attempts.push({ ...size });
    attempts.push({});

    let lastErr: unknown;
    for (const video of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia({ video, audio: false });
      } catch (err) {
        lastErr = err;
        const name = (err as Error).name;
        // Permission / hardware problems will not be fixed by looser constraints.
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'NotReadableError') {
          throw err;
        }
        if (name === 'OverconstrainedError' || name === 'NotFoundError' || name === 'TypeError') {
          // A saved device that no longer exists must not be retried.
          if (this._options.deviceId && 'deviceId' in video) this._options.deviceId = undefined;
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  private _waitForFrameSize(video: HTMLVideoElement, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        video.removeEventListener('loadeddata', done);
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      video.addEventListener('loadeddata', done);
    });
  }

  private _recordActualFormat(): void {
    const track = this._stream?.getVideoTracks()[0];
    const video = this._video;
    if (!track || !video) return;
    const s = track.getSettings();
    this._actualResolution = {
      width: s.width ?? video.videoWidth,
      height: s.height ?? video.videoHeight,
      label: this._options.resolution,
    };
    this._actualFps = s.frameRate ?? 0;
  }

  private _onTrackEnded = (): void => {
    if (this._state !== 'active') return;
    console.warn('[CameraManager] Camera track ended (device unplugged or taken by another app)');
    this._teardown();
    this._lastError = 'The camera was disconnected or is being used by another app.';
    this._setState('error');
  };

  private _teardown(): void {
    this._stopFrameLoop();
    navigator.mediaDevices?.removeEventListener?.('devicechange', this._onDeviceChange);

    if (this._stream) {
      for (const track of this._stream.getTracks()) {
        track.removeEventListener('ended', this._onTrackEnded);
        track.stop();
      }
      this._stream = null;
    }
    if (this._video) {
      this._video.pause();
      this._video.srcObject = null;
      this._video.remove();
      this._video = null;
    }
    this._actualResolution = null;
    this._actualFps = 0;
  }

  // ---- Frame Loop ----------------------------------------------------------

  private _startFrameLoop(): void {
    if (!this._video) return;
    this._useRVFC = typeof this._video.requestVideoFrameCallback === 'function';
    if (this._useRVFC) this._rVFCLoop();
    else this._rAFLoop();
  }

  private _stopFrameLoop(): void {
    if (this._rVFCHandle !== null && this._video && this._useRVFC) {
      this._video.cancelVideoFrameCallback?.(this._rVFCHandle);
    }
    this._rVFCHandle = null;
    if (this._animFrameId !== null) cancelAnimationFrame(this._animFrameId);
    this._animFrameId = null;
  }

  /** Synced to real camera frames: no wasted renders, no duplicate frames. */
  private _rVFCLoop(): void {
    const video = this._video;
    if (!video || this._state !== 'active' || !video.requestVideoFrameCallback) return;

    this._rVFCHandle = video.requestVideoFrameCallback(() => {
      const now = performance.now();
      if (!this._shouldSkipFrame(now)) {
        this._lastFrameTime = now;
        this._dispatchFrame(now);
      }
      this._rVFCLoop();
    });
  }

  private _rAFLoop(): void {
    if (!this._video || this._state !== 'active') return;
    this._animFrameId = requestAnimationFrame(() => {
      const now = performance.now();
      if (!this._shouldSkipFrame(now)) {
        this._lastFrameTime = now;
        this._dispatchFrame(now);
      }
      this._rAFLoop();
    });
  }

  private _shouldSkipFrame(now: number): boolean {
    if (this._minFrameInterval <= 0) return false;
    // 1.5 ms slack: a 30 fps cap on a 30 fps camera must not drop every other frame.
    return now - this._lastFrameTime < this._minFrameInterval - 1.5;
  }

  private _dispatchFrame(timestamp: DOMHighResTimeStamp): void {
    const video = this._video;
    if (!video) return;
    for (const cb of this._frameCallbacks) {
      try {
        cb(video, timestamp);
      } catch (err) {
        console.error('[CameraManager] Frame callback error:', err);
      }
    }
  }

  // ---- Private helpers -----------------------------------------------------

  private _setState(state: CameraState): void {
    if (this._state === state) return;
    this._state = state;
    for (const listener of this._stateListeners) {
      try {
        listener(state);
      } catch (err) {
        console.error('[CameraManager] State listener error:', err);
      }
    }
  }

  private _updateMinFrameInterval(): void {
    const fps = this._options.fpsCap ?? 0;
    this._minFrameInterval = fps > 0 ? 1000 / fps : 0;
  }
}

/** Plain-language explanation of a getUserMedia failure. */
export function describeCameraError(error: Error): string {
  switch (error.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Camera permission was denied. Allow camera access in your browser settings and try again.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera was found. Plug one in and try again.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The camera is in use by another app or tab. Close it and try again.';
    case 'OverconstrainedError':
      return 'The camera does not support the requested settings.';
    case 'SecurityError':
      return 'The browser blocked camera access. Camera needs HTTPS or localhost.';
    default:
      return error.message || 'Could not start the camera.';
  }
}
