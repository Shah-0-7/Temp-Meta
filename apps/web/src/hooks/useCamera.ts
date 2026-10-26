/**
 * @module hooks/useCamera
 *
 * React hook that manages the CameraManager lifecycle.
 * Creates, starts/stops the camera, and syncs state to the Zustand store.
 */

import { useRef, useCallback, useEffect } from 'react';
import { CameraManager } from '@tryanywhere/engine';
import { useCameraStore } from '../stores/cameraStore';

/** Singleton CameraManager — shared across components. */
let cameraManagerInstance: CameraManager | null = null;

export function getCameraManager(): CameraManager | null {
  return cameraManagerInstance;
}

export function useCamera() {
  const store = useCameraStore();
  const managerRef = useRef<CameraManager | null>(null);

  // Create manager on mount
  useEffect(() => {
    if (!managerRef.current) {
      const mgr = new CameraManager({
        resolution: store.resolution,
        mirror: store.mirror,
        fpsCap: store.fpsCap,
      });
      managerRef.current = mgr;
      cameraManagerInstance = mgr;

      // Sync state changes to store
      mgr.onStateChange((state) => {
        store.setCameraState(state);
        if (state === 'active') {
          const res = mgr.actualResolution;
          if (res) {
            store.setActualResolution(res.width, res.height);
          }
          store.setDevices(mgr.devices);
        }
      });
    }

    return () => {
      managerRef.current?.stop();
      managerRef.current = null;
      cameraManagerInstance = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCamera = useCallback(async () => {
    const mgr = managerRef.current;
    if (!mgr) return;
    await mgr.start();
  }, []);

  const stopCamera = useCallback(() => {
    const mgr = managerRef.current;
    if (!mgr) return;
    mgr.stop();
  }, []);

  const switchDevice = useCallback(async (deviceId: string) => {
    const mgr = managerRef.current;
    if (!mgr) return;
    store.setActiveDeviceId(deviceId);
    await mgr.setDevice(deviceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchResolution = useCallback(async (preset: Parameters<typeof store.setResolution>[0]) => {
    const mgr = managerRef.current;
    if (!mgr) return;
    store.setResolution(preset);
    await mgr.setResolution(preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMirror = useCallback(() => {
    const mgr = managerRef.current;
    if (!mgr) return;
    const next = !store.mirror;
    store.setMirror(next);
    mgr.setMirror(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ...store,
    manager: managerRef.current,
    startCamera,
    stopCamera,
    switchDevice,
    switchResolution,
    toggleMirror,
  };
}
