/**
 * @module renderer/shaders/passthrough
 *
 * Passthrough vertex + fragment shaders for drawing a camera
 * texture to the full canvas at native resolution.
 */

/** Full-screen quad vertex shader — maps a clip-space quad with UVs. */
export const PASSTHROUGH_VERT = /* glsl */ `#version 300 es
precision highp float;

// Full-screen triangle (3 vertices, no VBO needed)
// Uses vertex ID to compute position + UV
out vec2 vUV;

void main() {
  // Generate a full-screen triangle from gl_VertexID
  // Vertex 0: (-1, -1), Vertex 1: (3, -1), Vertex 2: (-1, 3)
  float x = float((gl_VertexID & 1) << 2) - 1.0;
  float y = float((gl_VertexID & 2) << 1) - 1.0;
  vUV = vec2((x + 1.0) * 0.5, (y + 1.0) * 0.5);
  gl_Position = vec4(x, y, 0.0, 1.0);
}
`;

/** Passthrough fragment shader — samples the camera texture. */
export const PASSTHROUGH_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uTexture;
uniform float uMirror; // 1.0 = mirror, 0.0 = normal

in vec2 vUV;
out vec4 fragColor;

void main() {
  vec2 uv = vUV;
  // Flip Y because video texture is top-down, GL is bottom-up
  uv.y = 1.0 - uv.y;
  // Mirror horizontally for selfie mode
  if (uMirror > 0.5) {
    uv.x = 1.0 - uv.x;
  }
  fragColor = texture(uTexture, uv);
}
`;
