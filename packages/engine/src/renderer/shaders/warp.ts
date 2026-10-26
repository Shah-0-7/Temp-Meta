/**
 * @module renderer/shaders/warp
 *
 * TPS (Thin-Plate Spline) warp shader for garment overlay.
 *
 * Strategy:
 * The vertex shader receives a grid of control points (src→dst mappings).
 * For each fragment, it computes where in the garment texture to sample
 * using a bilinear grid warp — a practical approximation of TPS that
 * runs entirely on GPU without computing the full TPS kernel per fragment.
 *
 * Grid approach:
 *   - Subdivide the garment quad into a N×N grid
 *   - Each grid vertex is displaced by weighted sum of control point offsets
 *   - Fragment shader samples garment texture with the warped UV
 *
 * Decision: grid warp (not full TPS) for performance.
 * Full TPS requires O(n²) shader ops per fragment; grid warp is O(n²) at
 * vertex stage only, making it suitable for 60fps real-time use.
 */

/** Grid subdivision count. Higher = more accurate warp, more vertices. */
export const WARP_GRID_SIZE = 16; // 16×16 = 256 quads = 512 triangles

/** Vertex shader — takes a pre-warped grid position + UV. */
export const WARP_VERT = /* glsl */ `#version 300 es
precision highp float;

// Attributes: position and UV come from the warped grid buffer
in vec2 aPosition; // clip space [-1, 1]
in vec2 aUV;       // garment texture UV [0, 1]

out vec2 vUV;

void main() {
  vUV = aUV;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/** Fragment shader — samples garment texture with edge fade. */
export const WARP_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uGarment;
uniform sampler2D uMask;       // Clothes segmentation mask (alpha)
uniform float uOpacity;        // Global opacity [0, 1]
uniform float uBlendMode;      // 0=normal, 1=screen, 2=multiply
uniform float uEdgeFade;       // Edge softness [0, 0.2]

in vec2 vUV;
out vec4 fragColor;

void main() {
  // Discard fragments outside garment UV bounds
  if (vUV.x < 0.0 || vUV.x > 1.0 || vUV.y < 0.0 || vUV.y > 1.0) {
    discard;
  }

  vec4 garment = texture(uGarment, vUV);

  // Edge fade: smooth alpha at UV boundaries
  float edgeDist = min(
    min(vUV.x, 1.0 - vUV.x),
    min(vUV.y, 1.0 - vUV.y)
  );
  float edgeAlpha = smoothstep(0.0, uEdgeFade, edgeDist);

  // Mask alpha (from segmentation — clothes region)
  float maskAlpha = texture(uMask, vUV).r;

  float alpha = garment.a * edgeAlpha * uOpacity * max(maskAlpha, 0.3);

  fragColor = vec4(garment.rgb, alpha);
}
`;

/** Passthrough for garment during mesh building — no warp needed for UV preview. */
export const WARP_PREVIEW_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uGarment;
uniform float uOpacity;

in vec2 vUV;
out vec4 fragColor;

void main() {
  if (vUV.x < 0.0 || vUV.x > 1.0 || vUV.y < 0.0 || vUV.y > 1.0) {
    discard;
  }
  vec4 g = texture(uGarment, vUV);
  fragColor = vec4(g.rgb, g.a * uOpacity);
}
`;
