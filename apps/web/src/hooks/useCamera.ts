/**
 * @module hooks/useCamera
 *
 * React hook that manages the CameraManager lifecycle.
 * Creates, starts/stops the camera, and syncs state to the Zustand store.
 */

import { useCallback, useEffect } from 'react';
import { CameraManager, type ResolutionPreset } from '@tryanywhere/engine';
import { useCameraStore } from '../stores/cameraStore';

/** Singleton CameraManager — shared across components. */
let cameraManagerInstance: CameraManager | null = null;

export function getCameraManager(): CameraManager {
  if (!cameraManagerInstance) {
    cameraManagerInstance = new CameraManager();
  }
  return cameraManagerInstance;
}

export function useCamera() {
  const cameraState = useCameraStore((s) => s.cameraState);
  const resolution = useCameraStore((s) => s.resolution);
  const mirror = useCameraStore((s) => s.mirror);
  const fpsCap = useCameraStore((s) => s.fpsCap);
  const feedSource = useCameraStore((s) => s.feedSource);
  const devices = useCameraStore((s) => s.devices);
  const activeDeviceId = useCameraStore((s) => s.activeDeviceId);
  const actualWidth = useCameraStore((s) => s.actualWidth);
  const actualHeight = useCameraStore((s) => s.actualHeight);
  const isFeedBlack = useCameraStore((s) => s.isFeedBlack);

  const mgr = getCameraManager();

  // Sync state changes to store (subscribes once on mount)
  useEffect(() => {
    // Initial sync
    if (useCameraStore.getState().cameraState !== mgr.state) {
      useCameraStore.getState().setCameraState(mgr.state);
    }

    const unsub = mgr.onStateChange((state) => {
      useCameraStore.getState().setCameraState(state);
      if (state === 'active') {
        const res = mgr.actualResolution;
        if (res) {
          useCameraStore.getState().setActualResolution(res.width, res.height);
        }
        useCameraStore.getState().setDevices(mgr.devices);
      }
    });

    return unsub;
  }, [mgr]);

  const startCamera = useCallback(async () => {
    useCameraStore.getState().setFeedSource('webcam');
    await mgr.start();
  }, [mgr]);

  const startDemo = useCallback(async (preset = 'female') => {
    useCameraStore.getState().setFeedSource('demo');
    await mgr.startDemo(preset);
  }, [mgr]);

  const startWithImage = useCallback(async (source: HTMLImageElement | string) => {
    useCameraStore.getState().setFeedSource('photo');
    await mgr.startWithImage(source);
  }, [mgr]);

  const stopCamera = useCallback(() => {
    mgr.stop();
  }, [mgr]);

  const switchDevice = useCallback(async (deviceId: string) => {
    useCameraStore.getState().setActiveDeviceId(deviceId);
    await mgr.setDevice(deviceId);
  }, [mgr]);

  const switchResolution = useCallback(async (preset: ResolutionPreset) => {
    useCameraStore.getState().setResolution(preset);
    await mgr.setResolution(preset);
  }, [mgr]);

  const toggleMirror = useCallback(() => {
    const next = !useCameraStore.getState().mirror;
    useCameraStore.getState().setMirror(next);
    mgr.setMirror(next);
  }, [mgr]);

  return {
    cameraState,
    resolution,
    mirror,
    fpsCap,
    feedSource,
    devices,
    activeDeviceId,
    actualWidth,
    actualHeight,
    isFeedBlack,
    manager: mgr,
    startCamera,
    startDemo,
    startWithImage,
    stopCamera,
    switchDevice,
    switchResolution,
    toggleMirror,
  };
}
