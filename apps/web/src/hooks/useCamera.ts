/**
 * @module hooks/useCamera
 *
 * ONE CameraManager for the whole app. (Previously every component calling
 * `useCamera()` created and later destroyed its own manager, so the preview,
 * settings panel and tracking each talked to a different camera object.)
 *
 * The manager's state is mirrored into the Zustand camera store exactly once.
 */

import { useCallback } from 'react';
import { CameraManager, type ResolutionPreset } from '@tryanywhere/engine';
import { useCameraStore } from '../stores/cameraStore';

let manager: CameraManager | null = null;

/** The shared manager (created on first use). */
export function getCameraManager(): CameraManager {
  if (manager) return manager;

  const initial = useCameraStore.getState();
  const mgr = new CameraManager({
    resolution: initial.resolution,
    mirror: initial.mirror,
    fpsCap: initial.fpsCap,
  });

  mgr.onStateChange((state) => {
    const store = useCameraStore.getState();
    store.setCameraState(state);
    if (state === 'active') {
      const res = mgr.actualResolution;
      if (res) store.setActualResolution(res.width, res.height);
      store.setActualFps(mgr.actualFps);
      store.setDevices(mgr.devices);
      store.setErrorMessage(null);
    } else if (state === 'error' || state === 'denied') {
      store.setErrorMessage(mgr.lastError);
    } else if (state === 'idle') {
      store.setActualResolution(0, 0);
      store.setActualFps(0);
    }
  });

  manager = mgr;
  return mgr;
}

export function useCamera() {
  const cameraState = useCameraStore((s) => s.cameraState);
  const mirror = useCameraStore((s) => s.mirror);
  const resolution = useCameraStore((s) => s.resolution);
  const devices = useCameraStore((s) => s.devices);
  const activeDeviceId = useCameraStore((s) => s.activeDeviceId);
  const actualWidth = useCameraStore((s) => s.actualWidth);
  const actualHeight = useCameraStore((s) => s.actualHeight);
  const actualFps = useCameraStore((s) => s.actualFps);
  const errorMessage = useCameraStore((s) => s.errorMessage);

  const startCamera = useCallback(async () => {
    await getCameraManager().start();
  }, []);

  const stopCamera = useCallback(() => {
    getCameraManager().stop();
  }, []);

  const switchDevice = useCallback(async (deviceId: string) => {
    useCameraStore.getState().setActiveDeviceId(deviceId);
    await getCameraManager().setDevice(deviceId);
    const mgr = getCameraManager();
    useCameraStore.getState().setDevices(mgr.devices);
    if (mgr.actualResolution) {
      useCameraStore.getState().setActualResolution(mgr.actualResolution.width, mgr.actualResolution.height);
    }
  }, []);

  const switchResolution = useCallback(async (preset: ResolutionPreset) => {
    useCameraStore.getState().setResolution(preset);
    const mgr = getCameraManager();
    await mgr.setResolution(preset);
    const store = useCameraStore.getState();
    if (mgr.actualResolution) store.setActualResolution(mgr.actualResolution.width, mgr.actualResolution.height);
    store.setActualFps(mgr.actualFps);
  }, []);

  const toggleMirror = useCallback(() => {
    const store = useCameraStore.getState();
    const next = !store.mirror;
    store.setMirror(next);
    getCameraManager().setMirror(next);
  }, []);

  return {
    cameraState,
    mirror,
    resolution,
    devices,
    activeDeviceId,
    actualWidth,
    actualHeight,
    actualFps,
    errorMessage,
    startCamera,
    stopCamera,
    switchDevice,
    switchResolution,
    toggleMirror,
  };
}
