/**
 * @module renderer/shaders/warp
 *
 * Shaders for drawing the garment on a CPU-warped mesh (see WarpMesh).
 *
 * The mesh vertices already sit where the garment should be on screen, so the
 * vertex shader only forwards them. The fragment shader:
 *   - samples the garment (uploaded PREMULTIPLIED + mipmapped, so there are no
 *     light/dark halos at the cut-out edge and no shimmering when minified),
 *   - optionally transfers the lighting of the user's own clothes onto the new
 *     garment (folds, shoulder creases, soft shadows) from the camera frame.
 *
 * Output is premultiplied alpha (blend func ONE, ONE_MINUS_SRC_ALPHA), which keeps
 * the canvas alpha at 1 over the opaque camera image.
 */

/** Default grid subdivision. Stills use a finer grid. */
export const WARP_GRID_SIZE = 16;

export const WARP_VERT = /* glsl */ `#version 300 es
precision highp float;

in vec2 aPosition; // clip space
in vec2 aUV;       // garment texture UV [0, 1]

out vec2 vUV;

void main() {
  vUV = aUV;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const WARP_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uGarment;   // premultiplied RGBA, mipmapped
uniform sampler2D uVideo;     // camera frame, mipmapped (for lighting transfer)
uniform vec2  uResolution;    // canvas size in pixels
uniform float uMirror;        // 1.0 when the video is drawn mirrored
uniform float uOpacity;       // global opacity incl. tracking fade [0, 1]
uniform float uEdgeFade;      // fade at the garment image border [0, 0.2]
uniform float uShading;       // lighting transfer strength [0, 1]; 0 = off
uniform float uLodFine;       // mip levels used to estimate local / coarse light
uniform float uLodCoarse;

in vec2 vUV;
out vec4 fragColor;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec4 g = texture(uGarment, vUV);

  float edgeDist = min(min(vUV.x, 1.0 - vUV.x), min(vUV.y, 1.0 - vUV.y));
  float edgeAlpha = uEdgeFade > 0.0 ? smoothstep(0.0, uEdgeFade, edgeDist) : 1.0;

  float shade = 1.0;
  if (uShading > 0.0) {
    vec2 s = gl_FragCoord.xy / uResolution;               // origin bottom-left
    vec2 vuv = vec2(uMirror > 0.5 ? 1.0 - s.x : s.x, 1.0 - s.y);
    float fine   = luma(textureLod(uVideo, vuv, uLodFine).rgb);
    float coarse = luma(textureLod(uVideo, vuv, uLodCoarse).rgb);
    // Ratio of local to regional brightness = folds and creases of what the user wears now.
    float detail = (fine + 0.05) / (coarse + 0.05);
    shade = mix(1.0, clamp(detail, 0.75, 1.25), uShading);
  }

  fragColor = vec4(g.rgb * shade, g.a) * (edgeAlpha * uOpacity);
}
`;
