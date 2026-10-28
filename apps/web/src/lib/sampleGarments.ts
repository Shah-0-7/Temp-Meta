/**
 * @module lib/sampleGarments
 *
 * Synthetic demo garments shipped in /public/samples (drawn for this project, no
 * third-party artwork). They let the first run work with no product link, no
 * server and no network.
 */

import type { GarmentCandidateWithProxy } from '../stores/garmentStore';

export interface SampleGarment {
  id: string;
  label: string;
  file: string;
}

export const SAMPLE_GARMENTS: readonly SampleGarment[] = [
  { id: 'red-stripes', label: 'Red striped tee', file: 'samples/tee-red-stripes.png' },
  { id: 'navy-logo', label: 'Navy logo tee', file: 'samples/tee-navy-logo.png' },
  { id: 'green-pocket', label: 'Green pocket tee', file: 'samples/tee-green-pocket.png' },
];

export function sampleToCandidate(sample: SampleGarment, baseUrl: string): GarmentCandidateWithProxy {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return {
    url: `${base}${sample.file}`,
    alt: sample.label,
    score: 1,
    garmentType: 'top',
    attributes: {},
  };
}
