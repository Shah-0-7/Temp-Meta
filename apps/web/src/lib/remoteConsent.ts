/**
 * @module lib/remoteConsent
 *
 * Wording for the "send my photo to an online model?" dialog.
 */

/** Who receives the photo, in the order they are tried. */
export type RemoteKind = 'meta' | 'free-community';

/**
 * What the consent dialog says. It must be true for whichever service gets the photo, so the
 * wording follows what the server reports instead of assuming one provider.
 */
export function describeRemote(label: string, kinds: readonly RemoteKind[]) {
  const meta = kinds.includes('meta');
  const community = kinds.includes('free-community');
  const provider = label || (meta ? 'Meta Muse Image' : 'a free online AI model');

  const notes: string[] = [];
  if (meta) {
    notes.push('Meta processes it through its Model API. Meta\u2019s own terms say how it is handled, and this app cannot control that.');
  }
  if (community) {
    notes.push(
      meta
        ? 'If the Meta service is busy or down, the server may try a free, community-hosted model instead. That service is run by someone else, so what it keeps is up to its operator.'
        : 'It is processed by a free, community-hosted service that this app does not control, so what that service keeps is up to its operator.',
    );
    notes.push('Free usage is small and shared.');
  }
  notes.push('If it is busy, used up or fails, you automatically get the on-device render instead.');
  notes.push('Choose Cancel to get the on-device render. Nothing is uploaded then.');

  return {
    provider,
    title: meta ? 'Make the render with Meta\u2019s AI?' : 'Make the render with a free online AI model?',
    sends: [
      'The snapshot or photo of you (it shows you), sent through this app\u2019s server.',
      'The garment image.',
    ],
    notes,
  };
}
