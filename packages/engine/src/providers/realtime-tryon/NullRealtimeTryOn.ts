/**
 * @module providers/realtime-tryon/NullRealtimeTryOn
 *
 * Null implementation of RealtimeTryOn.
 * isFeatureEnabled() returns false — the UI hides the "Live Realistic" button.
 * All methods throw NotConfiguredError.
 *
 * Will be replaced by a Decart provider (M8) or a future Meta video model.
 */

import type {
  RealtimeTryOn,
  RealtimeSession,
  ProviderCapability,
} from '../types.js';
import { NotConfiguredError } from '../types.js';

export class NullRealtimeTryOn implements RealtimeTryOn {
  readonly name = 'null';
  readonly capabilities: readonly ProviderCapability[] = ['realtime-tryon'];

  async initialize(): Promise<void> {
    // No-op
  }

  async dispose(): Promise<void> {
    // No-op
  }

  isFeatureEnabled(): boolean {
    return false;
  }

  async connect(
    _stream: MediaStream,
    _garment: ImageBitmap,
    _onFrame: (stream: MediaStream) => void,
  ): Promise<RealtimeSession> {
    throw new NotConfiguredError(
      this.name,
      'No realtime try-on provider configured. Set FEATURE_REALTIME_TRYON=true and provide a Decart API key.',
    );
  }
}
