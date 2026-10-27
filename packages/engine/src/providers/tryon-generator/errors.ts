/** Errors specific to try-on generators that are not worth a place in providers/types. */

/** The pose models could not be loaded (offline with no local assets, blocked CDN...). */
export class PoseModelUnavailableError extends Error {
  constructor(cause?: unknown) {
    super(
      'The body-tracking models could not be loaded, so the render cannot run. ' +
        'Check your connection, or run `pnpm setup:assets` to bundle the models locally.',
    );
    this.name = 'PoseModelUnavailableError';
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}
