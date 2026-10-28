/**
 * Stand-in used by the build when the optional `@decartai/sdk` package is not installed
 * (see vite.config.ts). It keeps the app building and fails with a clear message only if
 * someone actually starts a live AI session.
 */

const MISSING =
  'Live AI try-on needs the Decart SDK, which is not installed in this build. Run: pnpm add @decartai/sdk --filter @tryanywhere/web --filter @tryanywhere/server';

export function createDecartClient(): never {
  throw new Error(MISSING);
}

export const models = {
  realtime(): never {
    throw new Error(MISSING);
  },
};
