/**
 * @module renderer/WebGLContext
 *
 * Thin wrapper around WebGL2 context creation and lifecycle.
 * Handles canvas sizing with devicePixelRatio, context loss/restore,
 * and shared WebGL state.
 */

export interface WebGLContextOptions {
  /** Canvas element to use. If not provided, one will be created. */
  canvas?: HTMLCanvasElement;
  /** Whether to preserve the drawing buffer (needed for screenshots). */
  preserveDrawingBuffer?: boolean;
  /** Whether to request alpha channel. Default: true */
  alpha?: boolean;
}

export class WebGLContext {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;

  private _resizeObserver: ResizeObserver | null = null;
  private _contextLost = false;
  private _onContextLost: (() => void) | null = null;
  private _onContextRestored: (() => void) | null = null;

  constructor(options: WebGLContextOptions = {}) {
    this.canvas = options.canvas ?? document.createElement('canvas');

    const gl = this.canvas.getContext('webgl2', {
      alpha: options.alpha ?? true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
      antialias: false,
      desynchronized: true, // lower latency on supported browsers
      powerPreference: 'high-performance',
    });

    if (!gl) {
      throw new Error(
        'WebGL2 not available. TryAnywhere requires a browser with WebGL2 support (Chrome 56+, Firefox 51+, Edge 79+).',
      );
    }

    this.gl = gl;

    // Context loss handling
    this.canvas.addEventListener('webglcontextlost', this._handleContextLost);
    this.canvas.addEventListener('webglcontextrestored', this._handleContextRestored);
  }

  // ---- Sizing ---------------------------------------------------------------

  /**
   * Size the canvas to match its CSS display size × devicePixelRatio.
   * Returns true if the canvas was resized.
   */
  resize(width: number, height: number, dpr?: number): boolean {
    const pixelRatio = dpr ?? (typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1);
    const drawWidth = Math.round(width * pixelRatio);
    const drawHeight = Math.round(height * pixelRatio);

    if (this.canvas.width === drawWidth && this.canvas.height === drawHeight) {
      return false;
    }

    this.canvas.width = drawWidth;
    this.canvas.height = drawHeight;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.gl.viewport(0, 0, drawWidth, drawHeight);
    return true;
  }

  /**
   * Auto-resize whenever the canvas container changes size.
   * Returns cleanup function.
   */
  autoResize(container: HTMLElement): () => void {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.resize(width, height);
        }
      }
    });
    observer.observe(container);
    this._resizeObserver = observer;

    return () => {
      observer.disconnect();
      this._resizeObserver = null;
    };
  }

  // ---- Shader utilities -----------------------------------------------------

  /** Compile a shader from source. */
  compileShader(type: GLenum, source: string): WebGLShader {
    const { gl } = this;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Failed to create shader');

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error: ${info}`);
    }

    return shader;
  }

  /** Link a vertex and fragment shader into a program. */
  createProgram(vertexSource: string, fragmentSource: string): WebGLProgram {
    const { gl } = this;
    const vs = this.compileShader(gl.VERTEX_SHADER, vertexSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);

    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create program');

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Program link error: ${info}`);
    }

    // Shaders are no longer needed after linking
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    return program;
  }

  /** Create a texture from a video frame / image. */
  createTexture(): WebGLTexture {
    const { gl } = this;
    const tex = gl.createTexture();
    if (!tex) throw new Error('Failed to create texture');

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    return tex;
  }

  /** Upload a video / image / canvas to a texture. */
  updateTexture(
    texture: WebGLTexture,
    source: TexImageSource,
  ): void {
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  // ---- Context loss ---------------------------------------------------------

  get isContextLost(): boolean {
    return this._contextLost;
  }

  onContextLost(callback: () => void): void {
    this._onContextLost = callback;
  }

  onContextRestored(callback: () => void): void {
    this._onContextRestored = callback;
  }

  private _handleContextLost = (event: Event): void => {
    event.preventDefault();
    this._contextLost = true;
    console.warn('[WebGLContext] Context lost');
    this._onContextLost?.();
  };

  private _handleContextRestored = (): void => {
    this._contextLost = false;
    console.log('[WebGLContext] Context restored');
    this._onContextRestored?.();
  };

  // ---- Lifecycle ------------------------------------------------------------

  dispose(): void {
    this._resizeObserver?.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this._handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this._handleContextRestored);
    // WebGL context is GC'd with the canvas
  }
}
