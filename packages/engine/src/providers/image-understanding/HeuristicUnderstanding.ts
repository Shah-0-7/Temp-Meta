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

// Clothing keywords for text scoring
const CLOTHING_KEYWORDS: Record<GarmentType, string[]> = {
  top: ['shirt', 't-shirt', 'tshirt', 'tee', 'top', 'blouse', 'polo', 'tank', 'henley', 'sweater', 'sweatshirt', 'pullover', 'jersey'],
  outerwear: ['jacket', 'coat', 'hoodie', 'blazer', 'cardigan', 'parka', 'windbreaker', 'vest', 'fleece', 'anorak', 'bomber'],
  bottom: ['pants', 'jeans', 'trousers', 'shorts', 'skirt', 'leggings', 'chinos'],
  dress: ['dress', 'gown', 'romper', 'jumpsuit'],
  hat: ['hat', 'cap', 'beanie', 'beret'],
  glasses: ['glasses', 'sunglasses', 'eyewear'],
  shoes: ['shoes', 'sneakers', 'boots', 'sandals', 'heels', 'loafers'],
};

/** When two types match equally, the more specific one wins ("shirt jacket" is a jacket). */
const TYPE_PRECEDENCE: GarmentType[] = ['outerwear', 'dress', 'bottom', 'top', 'shoes', 'glasses', 'hat'];

const KEYWORD_MATCHERS = (Object.entries(CLOTHING_KEYWORDS) as [GarmentType, string[]][]).map(
  ([type, words]) => ({
    type,
    // Whole words only (so "laptop" is not a top and "capture" is not a cap), with an optional plural.
    re: new RegExp(`(?:^|[^a-z0-9])(?:${words.map((w) => w.replace(/[-]/g, '[- ]?')).join('|')})s?(?=$|[^a-z0-9])`, 'g'),
  }),
);

/**
 * Guesses what kind of garment some text (alt text, a file name, a page title) describes.
 * Returns `matched: false` and the default type `top` when nothing in the text is recognisable.
 */
export function detectGarmentType(text: string): { type: GarmentType; matched: boolean; hits: number } {
  const lower = text.toLowerCase();
  let best: GarmentType = 'top';
  let bestHits = 0;
  for (const { type, re } of KEYWORD_MATCHERS) {
    const hits = lower.match(re)?.length ?? 0;
    if (hits === 0) continue;
    const better =
      hits > bestHits || (hits === bestHits && TYPE_PRECEDENCE.indexOf(type) < TYPE_PRECEDENCE.indexOf(best));
    if (better) {
      best = type;
      bestHits = hits;
    }
  }
  return { type: best, matched: bestHits > 0, hits: bestHits };
}

/** Where an image was found, as a score: structured product data beats a stray <img>. */
const SOURCE_SCORE: Record<string, number> = { direct: 40, 'json-ld': 25, og: 15, link: 8, twitter: 5, img: 0 };

/** Words in a URL or alt that mean the image is page furniture, not the product. */
const JUNK_RE = /(?:^|[^a-z0-9])(?:logo|icon|sprite|avatar|badge|flag|favicon|placeholder|spacer|pixel|blank|banner|payment|social|swatch)(?:s)?(?=$|[^a-z0-9])/i;

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
      const fileName = fileNameOf(img.url);

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

      // Clothing words in the alt text, or failing that in the file name ("mens-fleece-jacket.jpg")
      const fromAlt = detectGarmentType(alt);
      const fromName = fromAlt.matched ? fromAlt : detectGarmentType(fileName);
      const garmentType = fromName.type;
      if (fromAlt.matched) score += 25;
      else if (fromName.matched) score += 15;

      // Where it came from
      score += SOURCE_SCORE[img.source ?? 'img'] ?? 0;

      // Penalize tiny thumbnails, icons, logos
      if (maxDim > 0 && maxDim < 100) score -= 30;
      if (JUNK_RE.test(alt) || JUNK_RE.test(fileName)) score -= 30;
      if (alt.includes('hero')) score -= 10;
      if (/\.(svg|gif)(?:$|\?)/i.test(img.url)) score -= 25;

      return {
        url: img.url,
        score,
        garmentType,
        attributes: {
          alt: img.alt ?? '',
          source: img.source ?? 'img',
          width: String(img.width ?? 'unknown'),
          height: String(img.height ?? 'unknown'),
        },
      };
    });

    // Highest score first; equal scores keep the order they had on the page.
    return scored
      .map((c, i) => ({ c, i }))
      .sort((a, b) => b.c.score - a.c.score || a.i - b.i)
      .map(({ c }) => c);
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
}

function fileNameOf(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '').replace(/\.[a-z0-9]+$/i, '');
  } catch {
    return '';
  }
}
