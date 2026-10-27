/**
 * @module renderer/OcclusionPass
 *
 * Final pass of the Tier A pipeline: puts face, hair and hands back on top of
 * the garment, using the occlusion mask from the segmentation model.
 */

import { WebGLContext } from './WebGLContext.js';
import { OCCLUSION_VERT, OCCLUSION_FRAG } from './shaders/occlusion.js';
import type { OcclusionMask } from '../tracking/types.js';

export class OcclusionPass {
  private readonly _program: WebGLProgram;
  private readonly _vao: WebGLVertexArrayObject;
  private readonly _maskTexture: WebGLTexture;
  private readonly _uVideo: WebGLUniformLocation | null;
  private readonly _uMask: WebGLUniformLocation | null;
  private readonly _uMirror: WebGLUniformLocation | null;
  private _hasMask = false;

  constructor(private readonly _ctx: WebGLContext) {
    const { gl } = _ctx;
    this._program = _ctx.createProgram(OCCLUSION_VERT, OCCLUSION_FRAG);
    this._uVideo = gl.getUniformLocation(this._program, 'uVideo');
    this._uMask = gl.getUniformLocation(this._program, 'uMask');
    this._uMirror = gl.getUniformLocation(this._program, 'uMirror');
    this._vao = gl.createVertexArray()!;
    this._maskTexture = _ctx.createTexture();
  }

  get hasMask(): boolean {
    return this._hasMask;
  }

  setMask(mask: OcclusionMask | null): void {
    if (!mask) {
      this._hasMask = false;
      return;
    }
    this._ctx.updateMaskTexture(this._maskTexture, mask.data, mask.width, mask.height);
    this._hasMask = true;
  }

  /** Draw. Expects premultiplied blending (ONE, ONE_MINUS_SRC_ALPHA) to be active. */
  draw(videoTexture: WebGLTexture, mirror: boolean): void {
    if (!this._hasMask) return;
    const { gl } = this._ctx;

    gl.useProgram(this._program);
    gl.bindVertexArray(this._vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    gl.uniform1i(this._uVideo, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._maskTexture);
    gl.uniform1i(this._uMask, 1);

    gl.uniform1f(this._uMirror, mirror ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const { gl } = this._ctx;
    gl.deleteProgram(this._program);
    gl.deleteVertexArray(this._vao);
    gl.deleteTexture(this._maskTexture);
  }
}
