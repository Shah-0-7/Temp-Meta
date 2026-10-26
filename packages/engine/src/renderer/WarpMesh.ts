/**
 * @module renderer/WarpMesh
 *
 * Builds and updates the warped grid mesh used by the TierA renderer.
 *
 * Algorithm:
 *   1. Start with an N×N regular grid of vertices in garment UV space
 *   2. For each vertex, compute displacement from each control point:
 *        weight = gaussian(distance(vertex.srcUV, cp.srcUV))
 *        displacement = cp.dstUV - cp.srcUV
 *        vertex.dstUV += weight * displacement
 *   3. Convert final dstUV to clip-space for the vertex buffer
 *   4. Upload to GPU
 *
 * The result is a WebGL vertex buffer ready for WARP_VERT shader.
 */

import type { ControlPoint } from '../tracking/GarmentKeypoints.js';
import { WARP_GRID_SIZE } from './shaders/warp.js';

const N = WARP_GRID_SIZE;
const VERTS_PER_SIDE = N + 1;
const TOTAL_VERTS = VERTS_PER_SIDE * VERTS_PER_SIDE;

// Each vertex: [posX, posY, uvX, uvY] = 4 floats
const FLOATS_PER_VERT = 4;
const TOTAL_FLOATS = TOTAL_VERTS * FLOATS_PER_VERT;

/** Gaussian influence falloff. Sigma controls the spread of each control point. */
function gaussianWeight(distSq: number, sigma: number): number {
  return Math.exp(-distSq / (2 * sigma * sigma));
}

export class WarpMesh {
  private _vertexData: Float32Array;
  private _indexData: Uint16Array;
  private _vbo: WebGLBuffer;
  private _ebo: WebGLBuffer;
  private _vao: WebGLVertexArrayObject;
  private _indexCount: number;

  // Attribute locations
  private _aPosition: number;
  private _aUV: number;

  constructor(
    private _gl: WebGL2RenderingContext,
    program: WebGLProgram,
  ) {
    const gl = _gl;

    this._aPosition = gl.getAttribLocation(program, 'aPosition');
    this._aUV = gl.getAttribLocation(program, 'aUV');

    // Allocate CPU buffers
    this._vertexData = new Float32Array(TOTAL_FLOATS);
    this._indexData = buildIndexBuffer();
    this._indexCount = this._indexData.length;

    // Create GPU buffers
    this._vao = gl.createVertexArray()!;
    gl.bindVertexArray(this._vao);

    this._vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this._vertexData, gl.DYNAMIC_DRAW);

    this._ebo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._indexData, gl.STATIC_DRAW);

    // Attributes: stride = 4 floats × 4 bytes = 16 bytes
    const stride = FLOATS_PER_VERT * 4;
    gl.enableVertexAttribArray(this._aPosition);
    gl.vertexAttribPointer(this._aPosition, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this._aUV);
    gl.vertexAttribPointer(this._aUV, 2, gl.FLOAT, false, stride, 2 * 4);

    gl.bindVertexArray(null);

    // Initialize with identity (no warp)
    this.updateIdentity();
  }

  /**
   * Build identity grid (garment fills a rect centered on screen).
   * Used before any control points arrive.
   */
  updateIdentity(
    /** Garment rect in clip space: [x0, y0, x1, y1] defaults to fullscreen */
    rect: [number, number, number, number] = [-0.5, -0.7, 0.5, 0.7],
  ): void {
    const [x0, y0, x1, y1] = rect;

    let vi = 0;
    for (let row = 0; row <= N; row++) {
      for (let col = 0; col <= N; col++) {
        const u = col / N;
        const v = row / N;
        this._vertexData[vi++] = x0 + u * (x1 - x0); // posX
        this._vertexData[vi++] = y1 - v * (y1 - y0); // posY (flip Y for clip)
        this._vertexData[vi++] = u;                    // uvX
        this._vertexData[vi++] = v;                    // uvY
      }
    }
    this._uploadVertices();
  }

  /**
   * Warp the grid using control points.
   * @param controlPoints  src→dst UV mappings from GarmentKeypoints
   * @param sigma  Gaussian spread (0.15 works well for a 16-point grid)
   */
  update(controlPoints: ControlPoint[], sigma = 0.15): void {
    if (controlPoints.length === 0) {
      this.updateIdentity();
      return;
    }

    let vi = 0;
    for (let row = 0; row <= N; row++) {
      for (let col = 0; col <= N; col++) {
        const srcU = col / N;
        const srcV = row / N;

        // Compute weighted displacement from all control points
        let dispU = 0;
        let dispV = 0;
        let totalWeight = 0;

        for (const cp of controlPoints) {
          const du = srcU - cp.srcU;
          const dv = srcV - cp.srcV;
          const distSq = du * du + dv * dv;
          const w = gaussianWeight(distSq, sigma) * cp.weight;
          dispU += w * (cp.dstU - cp.srcU);
          dispV += w * (cp.dstV - cp.srcV);
          totalWeight += w;
        }

        if (totalWeight > 1e-6) {
          dispU /= totalWeight;
          dispV /= totalWeight;
        }

        const dstU = Math.max(0, Math.min(1, srcU + dispU));
        const dstV = Math.max(0, Math.min(1, srcV + dispV));

        // Convert UV [0,1]² to clip space [-1,1]²
        const posX = dstU * 2 - 1;
        const posY = 1 - dstV * 2; // Flip Y

        this._vertexData[vi++] = posX;
        this._vertexData[vi++] = posY;
        this._vertexData[vi++] = srcU;
        this._vertexData[vi++] = srcV;
      }
    }

    this._uploadVertices();
  }

  /** Bind VAO and draw the mesh. */
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

  private _uploadVertices(): void {
    const gl = this._gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._vertexData);
  }
}

/** Build a triangle index buffer for an N×N quad grid. */
function buildIndexBuffer(): Uint16Array {
  const indices: number[] = [];
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      const tl = row * VERTS_PER_SIDE + col;
      const tr = tl + 1;
      const bl = tl + VERTS_PER_SIDE;
      const br = bl + 1;
      // Two triangles per quad
      indices.push(tl, bl, tr);
      indices.push(tr, bl, br);
    }
  }
  return new Uint16Array(indices);
}
