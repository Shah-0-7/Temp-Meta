/**
 * @module server/prompts/tryon-v1
 *
 * Structured prompt template for virtual try-on generation.
 * Versioned separately from provider code so prompts can be
 * iterated without touching the provider layer.
 */

import type { GarmentType } from '@tryanywhere/engine';

export interface TryOnPromptParams {
  garmentType: GarmentType;
  garmentDescription?: string;
  preserveBackground?: boolean;
}

/**
 * Build a structured prompt for the TryOnGenerator.
 * Designed for Muse Image but generic enough for any image-edit model.
 */
export function buildTryOnPrompt(params: TryOnPromptParams): string {
  const { garmentType, garmentDescription, preserveBackground = true } = params;

  const garmentLabel = garmentDescription ?? `this ${garmentType}`;

  const lines = [
    `Perform a virtual try-on: dress the person in the second reference image with ${garmentLabel} shown in the first reference image.`,
    '',
    'STRICT requirements:',
    '- Preserve the person\'s face, identity, skin tone, hairstyle, pose, hand positions, and body proportions EXACTLY.',
    preserveBackground
      ? '- Keep the original background and lighting conditions unchanged.'
      : '- Use a clean, neutral background.',
    '- Replace ONLY the person\'s current ' + garmentType + ' with the reference garment.',
    '- Reproduce the garment\'s exact color, pattern, logo, print, graphic, and fabric texture from the reference.',
    '- Render natural fabric drape, folds, creases, and wrinkles that match the person\'s pose and body shape.',
    '- The garment should fit naturally — not painted on, not floating.',
    '- Maintain proper occlusion: arms in front of torso should be visible over the garment.',
    '- Do NOT alter any other clothing items the person is wearing (e.g. pants, shoes, accessories).',
    '- Output a photorealistic result at the highest quality.',
  ];

  return lines.join('\n');
}

/**
 * Prompt version identifier for tracking and debugging.
 */
export const TRYON_PROMPT_VERSION = 'tryon-v1';
