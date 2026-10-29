/**
 * @module components/layout/TopBar
 *
 * Brand, the two things you do most (pick a garment, open the gallery), and the
 * app-level controls. Pressed state is a filled pill so it is clear what is open.
 */

import { Icon } from '../ui/Icon';
import { useAppStore } from '../../stores/appStore';
import { useGarmentStore } from '../../stores/garmentStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSnapshotStore } from '../../stores/snapshotStore';

export function TopBar() {
  const { engineReady, error, setHelpOpen } = useAppStore();
  const { toggleGarmentPanel, garmentPanelOpen, selectedGarment } = useGarmentStore();
  const { toggleSettings, settingsOpen } = useSettingsStore();
  const snapshotCount = useSnapshotStore((s) => s.snapshots.length);
  const galleryOpen = useSnapshotStore((s) => s.open);

  const state = error ? 'error' : engineReady ? 'ready' : 'busy';
  const statusText = error ? 'Error' : engineReady ? 'Ready' : 'Starting up…';

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">
          <Icon name="hanger" size={22} strokeWidth={1.9} />
        </span>
        <h1 className="wordmark">TryAnywhere</h1>
      </div>

      <div className="topbar-actions">
        <button
          onClick={toggleGarmentPanel}
          aria-pressed={garmentPanelOpen}
          className="tool"
          title="Choose garment (G)"
          aria-label={selectedGarment ? 'Change garment' : 'Add garment'}
        >
          {selectedGarment ? (
            <img src={selectedGarment.proxyUrl ?? selectedGarment.url} alt="" className="tool-thumb" />
          ) : (
            <Icon name="hanger" size={18} />
          )}
          <span className="tool-label">{selectedGarment ? 'Change garment' : 'Add garment'}</span>
        </button>

        <button
          onClick={() => useSnapshotStore.getState().toggleOpen()}
          aria-pressed={galleryOpen}
          className="tool"
          title="Snapshot gallery (V)"
          aria-label={`Snapshot gallery, ${snapshotCount} saved`}
        >
          <Icon name="gallery" size={18} />
          <span className="tool-label">Gallery</span>
          {snapshotCount > 0 && <span className="tool-count">{snapshotCount}</span>}
        </button>

        <div className="status" role="status">
          <span className="status-dot" data-state={state} />
          <span className="status-text">{statusText}</span>
        </div>

        <button
          onClick={toggleSettings}
          aria-pressed={settingsOpen}
          className="tool icon-btn"
          title="Settings"
          aria-label="Settings"
        >
          <Icon name="sliders" size={19} />
        </button>

        <button
          onClick={() => setHelpOpen(true)}
          className="tool icon-btn"
          title="Help and shortcuts (?)"
          aria-label="Help and keyboard shortcuts"
        >
          <Icon name="help" size={19} />
        </button>
      </div>
    </header>
  );
}
