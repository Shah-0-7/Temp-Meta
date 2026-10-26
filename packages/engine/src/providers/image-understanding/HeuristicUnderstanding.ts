/**
 * @module providers/image-understanding/HeuristicUnderstanding
 *
 * Default ImageUnderstanding that ranks candidate images using
 * heuristics: dimensions, aspect ratio, alt-text keywords, and
 * JSON-LD field priority. No AI model needed.
 *
 * Will be replaced by Muse Spark (Meta) for smarter ranking and
 * structured garment descriptions.
 */

import type {
  ImageUnderstanding,
  ImageCandidate,
  GarmentCandidate,
  GarmentDescription,
  GarmentType,
  ProviderCapability,
} from '../types.js';

// Clothing keywords for alt-text scoring
const CLOTHING_KEYWORDS: Record<GarmentType, string[]> = {
  top: ['shirt', 't-shirt', 'tee', 'top', 'blouse', 'polo', 'tank', 'henley', 'sweater', 'pullover'],
  outerwear: ['jacket', 'coat', 'hoodie', 'blazer', 'cardigan', 'parka', 'windbreaker', 'vest', 'fleece'],
  bottom: ['pants', 'jeans', 'trousers', 'shorts', 'skirt', 'leggings', 'chinos'],
  dress: ['dress', 'gown', 'romper', 'jumpsuit'],
  hat: ['hat', 'cap', 'beanie', 'beret'],
  glasses: ['glasses', 'sunglasses', 'eyewear'],
  shoes: ['shoes', 'sneakers', 'boots', 'sandals', 'heels', 'loafers'],
};

export class HeuristicUnderstanding implements ImageUnderstanding {
  readonly name = 'heuristic';
  readonly capabilities: readonly ProviderCapability[] = ['image-understanding'];

  async initialize(): Promise<void> {
    // No setup needed for heuristics
  }

  async dispose(): Promise<void> {
    // Nothing to clean up
  }

  async rankCandidates(images: ImageCandidate[]): Promise<GarmentCandidate[]> {
    const scored = images.map((img) => {
      let score = 0;
      const alt = (img.alt ?? '').toLowerCase();

      // Dimension scoring: prefer images ≥ 600px on longest side
      const maxDim = Math.max(img.width ?? 0, img.height ?? 0);
      if (maxDim >= 600) score += 30;
      else if (maxDim >= 400) score += 15;
      else if (maxDim > 0) score += 5;

      // Aspect ratio: prefer portrait or square (typical product shots)
      if (img.width && img.height) {
        const ratio = img.width / img.height;
        if (ratio >= 0.6 && ratio <= 1.0) score += 20; // Portrait/square
        else if (ratio >= 0.4 && ratio <= 1.5) score += 10; // Acceptable
      }

      // Alt-text keyword matching
      const { type: garmentType, keywordScore } = this.detectGarmentType(alt);
      score += keywordScore;

      // Penalize tiny thumbnails, icons, logos
      if (maxDim > 0 && maxDim < 100) score -= 30;
      if (alt.includes('logo') || alt.includes('icon') || alt.includes('brand')) score -= 20;
      if (alt.includes('banner') || alt.includes('hero')) score -= 10;

      return {
        url: img.url,
        score,
        garmentType,
        attributes: {
          alt: img.alt ?? '',
          width: String(img.width ?? 'unknown'),
          height: String(img.height ?? 'unknown'),
        },
      };
    });

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  async describeGarment(image: ImageBitmap): Promise<GarmentDescription> {
    // Without an AI model, we can only make basic assumptions
    const ratio = image.width / image.height;
    const isPortrait = ratio < 1.0;

    // Default to 'top' — the most common garment type
    const type: GarmentType = isPortrait ? 'top' : 'top';

    return {
      type,
      attributes: {
        width: String(image.width),
        height: String(image.height),
        aspectRatio: ratio.toFixed(2),
        source: 'heuristic',
      },
      tryonPrompt: `A person wearing this ${type}, preserving the exact color, pattern, print and fabric texture of the reference garment. Natural fit with realistic drape, folds, and creases.`,
    };
  }

  private detectGarmentType(text: string): { type: GarmentType; keywordScore: number } {
    let bestType: GarmentType = 'top';
    let bestScore = 0;

    for (const [type, keywords] of Object.entries(CLOTHING_KEYWORDS) as [GarmentType, string[]][]) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          const score = 25;
          if (score > bestScore) {
            bestScore = score;
            bestType = type;
          }
        }
      }
    }

    return { type: bestType, keywordScore: bestScore };
  }
}
