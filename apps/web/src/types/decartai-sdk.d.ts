/**
 * Minimal types for the OPTIONAL `@decartai/sdk` package (only what lib/decartAdapter.ts uses).
 *
 * The SDK is not a dependency, so the lockfile stays valid and the app builds without it.
 * To turn on Live AI try-on, install it (see README) and the real package replaces
 * the stub at build time (vite.config.ts).
 */
declare module '@decartai/sdk' {
  export interface DecartRealtimeClient {
    on(event: string, listener: (...args: any[]) => void): void;
    set(input: { prompt: string; image: Blob; enhance: boolean }): Promise<void>;
    disconnect(): void;
    getConnectionState(): string;
  }
  export function createDecartClient(options: {
    apiKey?: string;
    apiKeyProvider?: () => Promise<string>;
  }): {
    realtime: {
      connect(stream: MediaStream, options: Record<string, unknown>): Promise<DecartRealtimeClient>;
    };
  };
  export const models: { realtime(id: string): unknown };
}
