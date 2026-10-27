/**
 * @module renderer/PassthroughRenderer
 *
 * Draws camera frames to a WebGL2 canvas at full resolution.
 * This is the base render pass — Tier A overlay composites on top of this.
 *
 * Uses a full-screen triangle with no vertex buffer (gl_VertexID trick)
 * for maximum simplicity and zero allocation per frame.
 */

import { WebGLContext } from './WebGLContext.js';
import { PASSTHROUGH_VERT, PASSTHROUGH_FRAG } from './shaders/passthrough.js';

export class PassthroughRenderer {
  private _ctx: WebGLContext;
  private _program: WebGLProgram;
  private _vao: WebGLVertexArrayObject;
  private _texture: WebGLTexture;

  // Uniform locations
  private _uTexture: WebGLUniformLocation;
  private _uMirror: WebGLUniformLocation;

  private _mirror = true;

  constructor(ctx: WebGLContext) {
    this._ctx = ctx;
    const { gl } = ctx;

    // Compile shaders + link program
    this._program = ctx.createProgram(PASSTHROUGH_VERT, PASSTHROUGH_FRAG);

    // Uniform locations
    this._uTexture = gl.getUniformLocation(this._program, 'uTexture')!;
    this._uMirror = gl.getUniformLocation(this._program, 'uMirror')!;

    // Empty VAO (full-screen triangle uses gl_VertexID)
    this._vao = gl.createVertexArray()!;

    // Create camera texture
    this._texture = ctx.createTexture();
  }

  set mirror(value: boolean) {
    this._mirror = value;
  }

  get mirror(): boolean {
    return this._mirror;
  }

  /** The camera-frame texture (valid after the first draw). Shared with later passes. */
  get texture(): WebGLTexture {
    return this._texture;
  }

  /**
   * Draw a video frame to the canvas.
   * Call this once per render frame.
   * @param mipmaps build the mip chain so later passes can read blurred versions of the frame
   */
  draw(source: TexImageSource, mipmaps = false): void {
    const { gl } = this._ctx;

    if (this._ctx.isContextLost) return;

    // Upload video frame to texture
    this._ctx.updateTexture(this._texture, source, { mipmaps });

    // Clear and draw
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this._program);
    gl.bindVertexArray(this._vao);

    // Bind texture to unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    gl.uniform1i(this._uTexture, 0);
    gl.uniform1f(this._uMirror, this._mirror ? 1.0 : 0.0);

    // Draw full-screen triangle (3 vertices, no buffer)
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindVertexArray(null);
  }

  dispose(): void {
    const { gl } = this._ctx;
    gl.deleteProgram(this._program);
    gl.deleteVertexArray(this._vao);
    gl.deleteTexture(this._texture);
  }
}
