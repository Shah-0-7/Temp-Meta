/**
 * @module camera/CameraManager
 *
 * Manages the webcam lifecycle: permission, stream acquisition,
 * device enumeration, resolution switching, and the frame loop
 * via `requestVideoFrameCallback` (with `requestAnimationFrame` fallback).
 *
 * The CameraManager is framework-agnostic — the React layer observes
 * state changes through callbacks.
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

export class CameraManager {
  // ---- State ---------------------------------------------------------------

  private _state: CameraState = 'idle';
  private _stream: MediaStream | null = null;
  private _video: HTMLVideoElement | null = null;
  private _devices: CameraDevice[] = [];
  private _options: CameraOptions;
  private _actualResolution: Resolution | null = null;

  // ---- Frame loop ----------------------------------------------------------

  private _frameCallbacks: Set<FrameCallback> = new Set();
  private _animFrameId: number | null = null;
  private _rVFCHandle: number | null = null;
  private _useRVFC: boolean = false;
  private _lastFrameTime: number = 0;
  private _minFrameInterval: number = 0; // ms, 0 = no cap
  private _customCleanup: (() => void) | null = null;

  // ---- State listeners -----------------------------------------------------

  private _stateListeners: Set<(state: CameraState) => void> = new Set();

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

  get state(): CameraState {
    return this._state;
  }

  get stream(): MediaStream | null {
    return this._stream;
  }

  get video(): HTMLVideoElement | null {
    return this._video;
  }

  get devices(): CameraDevice[] {
    return [...this._devices];
  }

  get actualResolution(): Resolution | null {
    return this._actualResolution;
  }

  get options(): Readonly<CameraOptions> {
    return { ...this._options };
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  onStateChange(listener: (state: CameraState) => void): () => void {
    this._stateListeners.add(listener);
    return () => this._stateListeners.delete(listener);
  }

  /** Register a callback invoked on every video frame. */
  onFrame(callback: FrameCallback): () => void {
    this._frameCallbacks.add(callback);
    return () => this._frameCallbacks.delete(callback);
  }

  /** Enumerate available camera devices. */
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

  /** Start the camera with the current options. */
  async start(): Promise<void> {
    if (this._state === 'active') return;

    this._setState('requesting');

    try {
      const preset = RESOLUTION_PRESETS[this._options.resolution];
      const constraints: MediaStreamConstraints = {
        video: {
          ...(this._options.deviceId
            ? { deviceId: { exact: this._options.deviceId } }
            : { facingMode: this._options.facingMode }),
          ...(preset.width > 0
            ? {
                width: { ideal: preset.width },
                height: { ideal: preset.height },
              }
            : {}),
        },
        audio: false,
      };

      this._stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Create video element
      this._video = document.createElement('video');
      this._video.srcObject = this._stream;
      this._video.muted = true;
      this._video.playsInline = true;
      this._video.autoplay = true;

      // Keep in DOM offscreen so browser compositor treats it as an active media surface
      this._video.style.position = 'fixed';
      this._video.style.top = '0';
      this._video.style.left = '0';
      this._video.style.width = '1px';
      this._video.style.height = '1px';
      this._video.style.opacity = '0.001';
      this._video.style.pointerEvents = 'none';
      this._video.style.zIndex = '-99999';
      if (typeof document !== 'undefined' && document.body) {
        document.body.appendChild(this._video);
      }

      await this._video.play();

      // Record actual resolution
      const track = this._stream.getVideoTracks()[0];
      const settings = track.getSettings();
      this._actualResolution = {
        width: settings.width ?? this._video.videoWidth,
        height: settings.height ?? this._video.videoHeight,
        label: this._options.resolution,
      };

      console.log(
        `[CameraManager] Started: ${this._actualResolution.width}×${this._actualResolution.height}` +
          ` (requested: ${this._options.resolution})`,
      );

      // Enumerate devices now that we have permission
      await this.enumerateDevices();

      this._setState('active');

      // Start frame loop
      this._startFrameLoop();
    } catch (err) {
      const error = err as Error;
      if (
        error.name === 'NotAllowedError' ||
        error.name === 'PermissionDeniedError'
      ) {
        this._setState('denied');
      } else {
        console.error('[CameraManager] Failed to start camera:', error);
        this._setState('error');
      }
      throw err;
    }
  }

  /** Stop the camera and release resources. */
  stop(): void {
    this._stopFrameLoop();

    if (this._customCleanup) {
      this._customCleanup();
      this._customCleanup = null;
    }

    if (this._stream) {
      for (const track of this._stream.getTracks()) {
        track.stop();
      }
      this._stream = null;
    }

    if (this._video) {
      if (this._video.parentNode) {
        this._video.parentNode.removeChild(this._video);
      }
      this._video.srcObject = null;
      this._video = null;
    }

    this._actualResolution = null;
    this._setState('idle');
  }

  /**
   * Start a simulated live feed using an image or animation canvas.
   * Useful when physical webcam is black, blocked, or unavailable.
   */
  async startWithImage(imageSource: HTMLImageElement | string): Promise<void> {
    this.stop();
    this._setState('requesting');

    let img: HTMLImageElement;
    if (typeof imageSource === 'string') {
      img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image for simulated camera'));
        img.src = imageSource;
      });
    } else {
      img = imageSource;
    }

    const w = img.naturalWidth || 720;
    const h = img.naturalHeight || 960;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    let startTime = performance.now();
    let animId: number;

    const renderLoop = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      ctx.save();
      ctx.clearRect(0, 0, w, h);
      // Subtle idle breathing sway (0.5 degree tilt and 2px translation)
      const sway = Math.sin(elapsed * 1.5) * 2;
      ctx.translate(sway, 0);
      ctx.drawImage(img, 0, 0, w, h);
      ctx.restore();
      animId = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    // Create stream from animated canvas
    this._stream = (canvas as any).captureStream ? (canvas as any).captureStream(30) : null;
    this._customCleanup = () => cancelAnimationFrame(animId);

    this._video = document.createElement('video');
    if (this._stream) {
      this._video.srcObject = this._stream;
    } else {
      this._video.src = typeof imageSource === 'string' ? imageSource : img.src;
    }
    this._video.muted = true;
    this._video.playsInline = true;
    this._video.autoplay = true;

    // Attach offscreen in DOM
    this._video.style.position = 'fixed';
    this._video.style.top = '0';
    this._video.style.left = '0';
    this._video.style.width = '1px';
    this._video.style.height = '1px';
    this._video.style.opacity = '0.001';
    this._video.style.pointerEvents = 'none';
    this._video.style.zIndex = '-99999';
    if (typeof document !== 'undefined' && document.body) {
      document.body.appendChild(this._video);
    }

    try {
      await this._video.play();
    } catch {
      // ignore autoplay restriction
    }

    this._actualResolution = {
      width: w,
      height: h,
      label: 'native',
    };

    this._setState('active');
    this._startFrameLoop();
  }

  /**
   * Start built-in demo model feed.
   */
  async startDemo(preset = 'female'): Promise<void> {
    const localUrls: Record<string, string> = {
      female: '/models/demo_female.jpg',
      male: '/models/demo_male.jpg',
    };
    const fallbackUrls: Record<string, string> = {
      female: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=720&auto=format&fit=crop&q=80',
      male: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=720&auto=format&fit=crop&q=80',
    };

    const targetUrl = localUrls[preset] ?? localUrls.female;
    try {
      await this.startWithImage(targetUrl);
    } catch (err) {
      console.warn('[CameraManager] Local demo model failed, attempting fallback URL...', err);
      const fallbackUrl = fallbackUrls[preset] ?? fallbackUrls.female;
      await this.startWithImage(fallbackUrl);
    }
  }

  /** Switch resolution while camera is active. */
  async setResolution(preset: ResolutionPreset): Promise<void> {
    if (this._options.resolution === preset) return;
    this._options.resolution = preset;

    if (this._state === 'active') {
      this.stop();
      await this.start();
    }
  }

  /** Switch to a different camera device. */
  async setDevice(deviceId: string): Promise<void> {
    if (this._options.deviceId === deviceId) return;
    this._options.deviceId = deviceId;

    if (this._state === 'active') {
      this.stop();
      await this.start();
    }
  }

  /** Update FPS cap. */
  setFpsCap(fps: number): void {
    this._options.fpsCap = fps;
    this._updateMinFrameInterval();
  }

  /** Toggle mirror mode. */
  setMirror(mirror: boolean): void {
    this._options.mirror = mirror;
  }

  // ---- Frame Loop ----------------------------------------------------------

  private _startFrameLoop(): void {
    if (!this._video) return;

    // Use requestAnimationFrame loop for continuous, non-stalling rendering
    this._rAFLoop();
  }

  private _stopFrameLoop(): void {
    if (this._rVFCHandle !== null && this._video && this._useRVFC) {
      try {
        (this._video as any).cancelVideoFrameCallback(this._rVFCHandle);
      } catch {
        // ignore
      }
      this._rVFCHandle = null;
    }
    if (this._animFrameId !== null) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
  }

  /** requestVideoFrameCallback loop — synced to actual camera frames. */
  private _rVFCLoop(): void {
    if (!this._video || this._state !== 'active') return;

    this._rVFCHandle = (this._video as any).requestVideoFrameCallback(
      (_now: DOMHighResTimeStamp, _metadata: { mediaTime: number }) => {
        const now = performance.now();
        if (this._shouldSkipFrame(now)) {
          this._rVFCLoop();
          return;
        }

        this._lastFrameTime = now;
        this._dispatchFrame(now);
        this._rVFCLoop();
      },
    );
  }

  /** requestAnimationFrame fallback loop. */
  private _rAFLoop(): void {
    if (!this._video || this._state !== 'active') return;

    this._animFrameId = requestAnimationFrame(() => {
      if (!this._video || this._state !== 'active') return;
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
    return now - this._lastFrameTime < this._minFrameInterval;
  }

  private _dispatchFrame(timestamp: DOMHighResTimeStamp): void {
    if (!this._video) return;
    if (this._video.videoWidth === 0 || this._video.videoHeight === 0) return;

    for (const cb of this._frameCallbacks) {
      try {
        cb(this._video, timestamp);
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
