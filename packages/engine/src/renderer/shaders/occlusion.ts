/**
 * @module renderer/shaders/occlusion
 *
 * Re-draws the camera image over the garment wherever the occlusion mask says a
 * body part (face, hair, hands) is in front of it. Uses the same full-screen
 * triangle and the same mirror/flip convention as the passthrough pass.
 */

import { PASSTHROUGH_VERT } from './passthrough.js';

export const OCCLUSION_VERT = PASSTHROUGH_VERT;

export const OCCLUSION_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uVideo;
uniform sampler2D uMask; // R8, same orientation as the camera image
uniform float uMirror;

in vec2 vUV;
out vec4 fragColor;

void main() {
  vec2 uv = vec2(vUV.x, 1.0 - vUV.y);
  if (uMirror > 0.5) uv.x = 1.0 - uv.x;

  float m = smoothstep(0.35, 0.65, texture(uMask, uv).r);
  vec3 c = texture(uVideo, uv).rgb;
  fragColor = vec4(c * m, m); // premultiplied
}
`;
