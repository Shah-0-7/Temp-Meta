/**
 * @module renderer/WarpMesh
 *
 * Builds and updates the warped grid mesh drawn by the Tier A renderer.
 *
 * Algorithm:
 *   1. Start with an N x N regular grid over the garment image (UV space).
 *   2. Move every vertex with Moving Least Squares (similarity) deformation
 *      driven by the control points (see ./mls.ts). The maths runs in an isotropic
 *      space, so garment-image and screen aspect ratios are taken into account.
 *   3. Convert the result to clip space and upload.
 *
 * The garment UV of each vertex stays fixed, so the texture is sampled
 * undistorted; only the geometry moves.
 */

import type { ControlPoint } from '../tracking/GarmentKeypoints.js';
import { WARP_GRID_SIZE } from './shaders/warp.js';
import { mlsSimilarity, type MlsPoint } from './mls.js';

const FLOATS_PER_VERT = 4; // posX, posY, uvX, uvY

export class WarpMesh {
  private readonly _n: number;
  private readonly _vertexData: Float32Array;
  private readonly _indexData: Uint16Array;
  private readonly _vbo: WebGLBuffer;
  private readonly _ebo: WebGLBuffer;
  private readonly _vao: WebGLVertexArrayObject;
  private readonly _indexCount: number;

  private _garmentAspect = 0.8;
  private _screenAspect = 16 / 9;

  constructor(
    private readonly _gl: WebGL2RenderingContext,
    program: WebGLProgram,
    gridSize: number = WARP_GRID_SIZE,
  ) {
    const gl = _gl;
    this._n = Math.max(2, Math.min(60, Math.floor(gridSize)));
    const vertsPerSide = this._n + 1;
    this._vertexData = new Float32Array(vertsPerSide * vertsPerSide * FLOATS_PER_VERT);
    this._indexData = buildIndexBuffer(this._n);
    this._indexCount = this._indexData.length;

    const aPosition = gl.getAttribLocation(program, 'aPosition');
    const aUV = gl.getAttribLocation(program, 'aUV');

    this._vao = gl.createVertexArray()!;
    gl.bindVertexArray(this._vao);

    this._vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this._vertexData, gl.DYNAMIC_DRAW);

    this._ebo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._indexData, gl.STATIC_DRAW);

    const stride = FLOATS_PER_VERT * 4;
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, stride, 2 * 4);

    gl.bindVertexArray(null);

    this.updateIdentity();
  }

  get gridSize(): number {
    return this._n;
  }

  /** Aspect ratios (width / height) of the garment image and of the output canvas. */
  setAspects(garmentAspect: number, screenAspect: number): void {
    if (garmentAspect > 0) this._garmentAspect = garmentAspect;
    if (screenAspect > 0) this._screenAspect = screenAspect;
  }

  /**
   * Build the un-warped grid (garment drawn as a rect centred on screen).
   * Used before any control points arrive.
   * @param rect clip-space [x0, y0, x1, y1]
   */
  updateIdentity(rect: [number, number, number, number] = [-0.4, -0.75, 0.4, 0.75]): void {
    const [x0, y0, x1, y1] = rect;
    const n = this._n;
    let vi = 0;
    for (let row = 0; row <= n; row++) {
      for (let col = 0; col <= n; col++) {
        const u = col / n;
        const v = row / n;
        this._vertexData[vi++] = x0 + u * (x1 - x0);
        this._vertexData[vi++] = y1 - v * (y1 - y0);
        this._vertexData[vi++] = u;
        this._vertexData[vi++] = v;
      }
    }
    this._upload();
  }

  /**
   * Warp the grid with the control points.
   * @param alpha MLS falloff exponent (1.0 global/smooth .. 2.0 local). Default 1.2.
   */
  update(controlPoints: readonly ControlPoint[], alpha = 1.2): void {
    if (controlPoints.length === 0) {
      this.updateIdentity();
      return;
    }

    const gA = this._garmentAspect;
    const sA = this._screenAspect;
    const pts: MlsPoint[] = controlPoints.map((c) => ({
      px: c.srcU * gA,
      py: c.srcV,
      qx: c.dstU * sA,
      qy: c.dstV,
      w: c.weight,
    }));

    const n = this._n;
    let vi = 0;
    for (let row = 0; row <= n; row++) {
      for (let col = 0; col <= n; col++) {
        const u = col / n;
        const v = row / n;
        const [fx, fy] = mlsSimilarity(pts, u * gA, v, alpha);
        const dstU = fx / sA;
        const dstV = fy;
        // UV [0,1] -> clip space. No clamping: parts of the garment may leave the frame.
        this._vertexData[vi++] = dstU * 2 - 1;
        this._vertexData[vi++] = 1 - dstV * 2;
        this._vertexData[vi++] = u;
        this._vertexData[vi++] = v;
      }
    }
    this._upload();
  }

  draw(): void {
    const gl = this._gl;
    gl.bindVertexArray(this._vao);
    gl.drawElements(gl.TRIANGLES, this._indexCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this._gl;
    gl.deleteBuffer(this._vbo);
    gl.deleteBuffer(this._ebo);
    gl.deleteVertexArray(this._vao);
  }

  private _upload(): void {
    const gl = this._gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._vertexData);
  }
}

/** Triangle index buffer for an n x n quad grid. */
function buildIndexBuffer(n: number): Uint16Array {
  const vps = n + 1;
  const indices = new Uint16Array(n * n * 6);
  let k = 0;
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const tl = row * vps + col;
      const tr = tl + 1;
      const bl = tl + vps;
      const br = bl + 1;
      indices[k++] = tl; indices[k++] = bl; indices[k++] = tr;
      indices[k++] = tr; indices[k++] = bl; indices[k++] = br;
    }
  }
  return indices;
}
