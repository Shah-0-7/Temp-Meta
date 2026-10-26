/**
 * Vitest global setup — polyfills browser APIs that aren't available in Node.
 * Only used for testing engine code that references browser globals.
 */

// Polyfill ImageData for Node (used by BrowserSAMSegmenter stub)
if (typeof globalThis.ImageData === 'undefined') {
  class ImageDataPolyfill {
    readonly width: number;
    readonly height: number;
    readonly data: Uint8ClampedArray;

    constructor(width: number, height: number);
    constructor(data: Uint8ClampedArray, width: number, height?: number);
    constructor(widthOrData: number | Uint8ClampedArray, heightOrWidth: number, maybeHeight?: number) {
      if (widthOrData instanceof Uint8ClampedArray) {
        this.data = widthOrData;
        this.width = heightOrWidth;
        this.height = maybeHeight ?? (widthOrData.length / 4 / heightOrWidth);
      } else {
        this.width = widthOrData;
        this.height = heightOrWidth;
        this.data = new Uint8ClampedArray(widthOrData * heightOrWidth * 4);
      }
    }
  }

  // @ts-expect-error — polyfill
  globalThis.ImageData = ImageDataPolyfill;
}
