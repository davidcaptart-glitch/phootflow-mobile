// Revelador WebGL2: la misma clase sirve para la vista en vivo, las miniaturas de los filtros y la exportación.
import type { Box, Develop, Look } from "../engine/types";
import { BLUR, DOWN, MAIN, VERT } from "./shaders";
import { rotateCover } from "../engine/straighten";

export interface Mask { data: Uint8Array; width: number; height: number; /** 1 (por defecto) o 4 (RGBA). */ channels?: number; }

export interface RenderOptions {
  develop: Develop;
  look: Look;
  /** Versión en B/N. */
  bw?: boolean;
  /** Recorte normalizado (null = foto entera). */
  crop?: Box | null;
  /** Tamaño de salida en px. */
  width: number;
  height: number;
  /** Desenfoque y belleza solo si la foto es apta (si no, se ignoran). */
  bokeh?: boolean;
  beauty?: boolean;
  /** Giro para enderezar (grados; positivo = gira la foto en sentido horario). */
  angle?: number;
}

interface Target { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number; }

const ONE_WHITE = new Uint8Array([255]);

export class Renderer {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly gl: WebGL2RenderingContext;
  readonly maxSize: number;
  private progMain: WebGLProgram;
  private progDown: WebGLProgram;
  private progBlur: WebGLProgram;
  private src: WebGLTexture | null = null;
  private srcW = 1;
  private srcH = 1;
  private person: WebGLTexture;
  private skin: WebGLTexture;
  private sel: WebGLTexture;
  private face: WebGLTexture;
  private hasFace = false;
  private hasPerson = false;
  private hasSkin = false;
  private lut: WebGLTexture;
  private bwLut: WebGLTexture;
  private lutKey: string | null = null;
  private bwLutKey: string | null = null;
  private lutSize = 2;
  private blurS: Target | null = null;
  private blurB: Target | null = null;
  private blurKeyS = "";
  private blurKeyB = "";
  private tmp: Target[] = [];
  private vao: WebGLVertexArrayObject;

  constructor(canvas?: HTMLCanvasElement | OffscreenCanvas) {
    this.canvas = canvas ?? document.createElement("canvas");
    const gl = this.canvas.getContext("webgl2", { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error("Este navegador no tiene WebGL2. Actualízalo para usar PhootFlow.");
    this.gl = gl;
    this.maxSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 8192);
    this.progMain = this.program(MAIN);
    this.progDown = this.program(DOWN);
    this.progBlur = this.program(BLUR);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.person = this.tex2d();
    this.skin = this.tex2d();
    this.uploadMask(this.person, null);
    this.uploadMask(this.skin, null);
    this.sel = this.tex2d();
    this.setSelection(null);
    this.face = this.tex2d();
    this.setFace(null);
    this.lut = this.tex3d();
    this.bwLut = this.tex3d();
    this.setLut(null, null);
    this.setBwLut(null, null);
  }

  // ---------------------------------------------------------------- recursos
  private program(frag: string) {
    const gl = this.gl;
    const sh = (type: number, srcCode: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, srcCode);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(p, 0, "aPos");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "programa");
    return p;
  }

  private tex2d() {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private tex3d() {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, t);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

  private target(w: number, h: number): Target {
    const gl = this.gl;
    const tex = this.tex2d();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex, w, h };
  }

  private free(t: Target | null) {
    if (!t) return;
    this.gl.deleteFramebuffer(t.fb);
    this.gl.deleteTexture(t.tex);
  }

  private uploadMask(tex: WebGLTexture, m: Mask | null) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (m) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, m.width, m.height, 0, gl.RED, gl.UNSIGNED_BYTE, m.data);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, ONE_WHITE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  /** Máscaras de retrato (RGBA: ojos, iris, boca, ojeras). */
  setFace(m: Mask | null) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.face);
    if (m) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, m.width, m.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, m.data);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    this.hasFace = !!m;
  }

  /** Máscara de los elementos elegidos (color selectivo). null = la foto no los tiene: nada se queda en color. */
  setSelection(m: Mask | null) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.sel);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (m) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, m.width, m.height, 0, gl.RED, gl.UNSIGNED_BYTE, m.data);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(1));
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  private uploadLut(tex: WebGLTexture, table: Uint8Array | null, size: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (table) gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB8, size, size, size, 0, gl.RGB, gl.UNSIGNED_BYTE, table);
    else gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB8, 2, 2, 2, 0, gl.RGB, gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255, 0, 0, 0, 255, 0, 255, 255, 0, 0, 0, 255, 255, 0, 255, 0, 255, 255, 255, 255, 255]));
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  // ---------------------------------------------------------------- entradas
  /** Foto de trabajo. Si es más grande que lo que admite la GPU, quien llama debe reducirla antes. */
  setSource(img: TexImageSource & { width: number; height: number }) {
    const gl = this.gl;
    if (!this.src) this.src = this.tex2d();
    gl.bindTexture(gl.TEXTURE_2D, this.src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    this.srcW = img.width;
    this.srcH = img.height;
    this.blurKeyS = this.blurKeyB = "";
  }

  get sourceSize() { return { width: this.srcW, height: this.srcH }; }

  setMasks(person: Mask | null, skin: Mask | null) {
    this.uploadMask(this.person, person);
    this.uploadMask(this.skin, skin);
    this.hasPerson = !!person;
    this.hasSkin = !!skin;
    this.blurKeyS = this.blurKeyB = "";
  }

  setLut(key: string | null, table: Uint8Array | null, size = 33) {
    if (key === this.lutKey) return;
    this.uploadLut(this.lut, table, size);
    this.lutKey = table ? key : null;
    if (table) this.lutSize = size;
  }

  setBwLut(key: string | null, table: Uint8Array | null, size = 33) {
    if (key === this.bwLutKey) return;
    this.uploadLut(this.bwLut, table, size);
    this.bwLutKey = table ? key : null;
  }

  // ---------------------------------------------------------------- desenfoques
  /** Desenfoque normalizado por máscara de la foto entera: sigma en px de la foto de trabajo. */
  private maskedBlur(prev: Target | null, sigma: number, useMask: number, maskTex: WebGLTexture): Target {
    const gl = this.gl;
    // reducir hasta que la sigma quede en ~3 px: misma calidad con cualquier radio
    const f = Math.max(1, Math.min(32, sigma / 3));
    const w = Math.max(8, Math.round(this.srcW / f)), h = Math.max(8, Math.round(this.srcH / f));
    let a = prev && prev.w === w && prev.h === h ? prev : (this.free(prev), this.target(w, h));
    let b = this.tmp.find((t) => t.w === w && t.h === h);
    if (!b) { b = this.target(w, h); this.tmp.push(b); }
    gl.viewport(0, 0, w, h);
    // reducir y ponderar
    gl.useProgram(this.progDown);
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb);
    this.bind(this.progDown, "uSrc", 0, this.src!);
    this.bind(this.progDown, "uMask", 1, maskTex);
    gl.uniform1f(gl.getUniformLocation(this.progDown, "uUseMask"), useMask);
    gl.uniform4f(gl.getUniformLocation(this.progDown, "uRect"), 0, 0, 1, 1);
    gl.uniform1f(gl.getUniformLocation(this.progDown, "uFlip"), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // dos pasadas H+V: sigma total ≈ 2·paso·√2 ≈ 3 px a esta escala
    gl.useProgram(this.progBlur);
    gl.uniform1f(gl.getUniformLocation(this.progBlur, "uFlip"), 0);
    const step = (sigma / f) / (2 * Math.SQRT2);
    for (let i = 0; i < 2; i++) {
      for (const [dx, dy, from, to] of [[step / w, 0, a, b], [0, step / h, b, a]] as const) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, to.fb);
        this.bind(this.progBlur, "uTex", 0, from.tex);
        gl.uniform2f(gl.getUniformLocation(this.progBlur, "uDir"), dx, dy);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return a;
  }

  private bind(p: WebGLProgram, name: string, unit: number, tex: WebGLTexture, target: number = this.gl.TEXTURE_2D) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target, tex);
    gl.uniform1i(gl.getUniformLocation(p, name), unit);
  }

  // ---------------------------------------------------------------- revelar
  render(o: RenderOptions) {
    const gl = this.gl;
    if (!this.src) return;
    const { look, develop: d } = o;
    const long = Math.max(this.srcW, this.srcH);
    const bokeh = o.bokeh !== false && look.bokeh > 0 && this.hasPerson;
    const beauty = o.beauty !== false && look.beauty > 0 && this.hasSkin;
    if (bokeh) {
      // radio máximo ≈ 3 % del lado largo, como en escritorio
      const sigma = (look.bokeh / 100) * 0.03 * long * 0.5 + 1;
      const key = `${sigma.toFixed(1)}`;
      if (key !== this.blurKeyB) { this.blurB = this.maskedBlur(this.blurB, sigma, -1, this.person); this.blurKeyB = key; }
    }
    if (beauty) {
      const sigma = 0.0045 * long;
      const key = `${sigma.toFixed(1)}`;
      if (key !== this.blurKeyS) { this.blurS = this.maskedBlur(this.blurS, sigma, 1, this.skin); this.blurKeyS = key; }
    }
    const canvas = this.canvas;
    if (canvas.width !== o.width || canvas.height !== o.height) { canvas.width = o.width; canvas.height = o.height; }
    gl.viewport(0, 0, o.width, o.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const p = this.progMain;
    gl.useProgram(p);
    const u = (n: string) => gl.getUniformLocation(p, n);
    this.bind(p, "uSrc", 0, this.src);
    this.bind(p, "uBlurS", 1, this.blurS?.tex ?? this.src);
    this.bind(p, "uBlurB", 2, this.blurB?.tex ?? this.src);
    this.bind(p, "uPerson", 3, this.person);
    this.bind(p, "uSkin", 4, this.skin);
    this.bind(p, "uLut", 5, this.lut, gl.TEXTURE_3D);
    this.bind(p, "uBwLut", 6, this.bwLut, gl.TEXTURE_3D);
    this.bind(p, "uSel", 7, this.sel);
    this.bind(p, "uFace", 8, this.face);
    const fOn = o.beauty !== false && this.hasFace ? 1 : 0;
    gl.uniform1f(u("uEyes"), (fOn * look.beautyEyes) / 100);
    gl.uniform1f(u("uTeeth"), (fOn * look.beautyTeeth) / 100);
    gl.uniform1f(u("uUnder"), (fOn * look.beautyUnder) / 100);
    const c = o.crop ?? { x: 0, y: 0, w: 1, h: 1 };
    gl.uniform1f(u("uFlip"), 1);
    gl.uniform4f(u("uCrop"), c.x, c.y, c.w, c.h);
    gl.uniform2f(u("uOut"), o.width, o.height);
    gl.uniform1f(u("uExposure"), d.exposure);
    gl.uniform1f(u("uContrast"), d.contrast / 100);
    gl.uniform1f(u("uWarmth"), d.warmth / 100);
    gl.uniform1f(u("uTint"), d.tint / 100);
    gl.uniform1f(u("uSat"), d.saturation / 100);
    gl.uniform1f(u("uHigh"), d.highlights / 100);
    gl.uniform1f(u("uShadow"), d.shadows / 100);
    gl.uniform2f(u("uWb"), d.wbR, d.wbB);
    gl.uniform1f(u("uHasLut"), this.lutKey && look.lut ? 1 : 0);
    gl.uniform1f(u("uLutAmount"), look.lutAmount);
    gl.uniform1f(u("uLutSize"), this.lutSize);
    gl.uniform1f(u("uBw"), o.bw ? 1 : 0);
    gl.uniform1f(u("uHasBwLut"), this.bwLutKey && look.bwLut ? 1 : 0);
    gl.uniform1f(u("uBokeh"), bokeh ? look.bokeh / 100 : 0);
    gl.uniform1f(u("uBeauty"), beauty ? look.beauty / 100 : 0);
    gl.uniform1f(u("uGrain"), look.grain / 100);
    gl.uniform1f(u("uVignette"), look.vignette / 100);
    gl.uniform1f(u("uSeed"), 17.0);
    const ang = ((o.angle ?? 0) * Math.PI) / 180;
    gl.uniform1f(u("uAngle"), ang);
    gl.uniform1f(u("uAspect"), this.srcW / this.srcH);
    gl.uniform1f(u("uZoom"), rotateCover(o.angle ?? 0, this.srcW, this.srcH));
    const spd = o.bokeh !== false && look.speed > 0 && this.hasPerson ? look.speed / 100 : 0;
    gl.uniform1f(u("uSpeed"), spd);
    const sa = (look.speedAngle * Math.PI) / 180, span = spd * 0.07 / 12; // hasta un 7 % del ancho
    gl.uniform2f(u("uSpeedDir"), Math.cos(sa) * span, -Math.sin(sa) * span * (this.srcW / this.srcH));
    const sp = look.splash;
    const hues = sp.hues.slice(0, 4);
    gl.uniform1f(u("uSplash"), sp.on && (hues.length || sp.parts.length) ? 1 : 0);
    gl.uniform1f(u("uHueCount"), hues.length);
    gl.uniform4f(u("uHues"), ...([0, 1, 2, 3].map((i) => ((hues[i] ?? 0) % 360) / 360) as [number, number, number, number]));
    gl.uniform1f(u("uHueTol"), sp.tolerance / 360);
    gl.uniform1f(u("uUseSel"), sp.parts.length ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** JPEG de lo último que se ha revelado. */
  async toBlob(quality = 0.92): Promise<Blob> {
    const c = this.canvas;
    if ("convertToBlob" in c) return c.convertToBlob({ type: "image/jpeg", quality });
    return new Promise((res, rej) => (c as HTMLCanvasElement).toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/jpeg", quality));
  }

  dispose() {
    this.free(this.blurS); this.free(this.blurB);
    this.tmp.forEach((t) => this.free(t));
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
