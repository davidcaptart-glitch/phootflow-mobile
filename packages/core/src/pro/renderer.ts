// Revelador de Pro: WebGL2, una foto, ajustes `Dev`. Sirve para la vista en vivo, las miniaturas de los presets
// y la exportación a resolución completa (los radios del detalle se miden respecto al lado largo de la foto).
import { BLUR, DOWN, VERT } from "../render/shaders";
import { rotateCover } from "../engine/straighten";
import { PRO_MAIN } from "./shaders";
import { curveTable, isLine, rotatedSize, type Dev } from "./dev";

interface Target { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number; }

/** Desenfoques que necesita el detalle, como fracción del lado largo (sigma). */
const SIGMAS = { b1: 0.0007, bt: 0.0028, b2: 0.012, b3: 0.045 } as const;
type BlurKey = keyof typeof SIGMAS;

export interface ProRenderOptions {
  width: number;
  height: number;
  /** Mostrar la foto sin ajustes (antes), con el mismo encuadre. */
  original?: boolean;
  /** Ignorar el recorte (para editar el encuadre sobre la foto entera). */
  noCrop?: boolean;
}

export class ProRenderer {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly gl: WebGL2RenderingContext;
  readonly maxSize: number;
  private main: WebGLProgram;
  private down: WebGLProgram;
  private blur: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private src: WebGLTexture | null = null;
  private srcW = 1;
  private srcH = 1;
  private white: WebGLTexture;
  private curve: WebGLTexture;
  private curveKey = "";
  private lut: WebGLTexture;
  private lutKey: string | null = null;
  private lutSize = 2;
  private blurs: Partial<Record<BlurKey, Target>> = {};
  private tmp: Target[] = [];
  private loc = new Map<string, WebGLUniformLocation | null>();

  constructor(canvas?: HTMLCanvasElement | OffscreenCanvas) {
    this.canvas = canvas ?? document.createElement("canvas");
    const gl = this.canvas.getContext("webgl2", { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error("Este navegador no tiene WebGL2. Actualízalo para usar PhootFlow.");
    this.gl = gl;
    this.maxSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 8192);
    this.main = this.program(PRO_MAIN);
    this.down = this.program(DOWN);
    this.blur = this.program(BLUR);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.white = this.tex2d();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([255]));
    this.curve = this.tex2d();
    this.lut = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, this.lut);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.lutKey = "__";
    this.setLut(null, null);
  }

  private program(frag: string) {
    const gl = this.gl;
    const sh = (type: number, code: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, code);
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

  private free(t: Target | undefined | null) {
    if (!t) return;
    this.gl.deleteFramebuffer(t.fb);
    this.gl.deleteTexture(t.tex);
  }

  private bind(p: WebGLProgram, name: string, unit: number, tex: WebGLTexture, target: number = this.gl.TEXTURE_2D) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target, tex);
    gl.uniform1i(gl.getUniformLocation(p, name), unit);
  }

  /** La foto de trabajo (ya reducida a lo que admite la GPU). Calcula de una vez los desenfoques del detalle. */
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
    const long = Math.max(img.width, img.height);
    for (const k of Object.keys(SIGMAS) as BlurKey[]) this.blurs[k] = this.blurOf(this.blurs[k] ?? null, Math.max(0.6, SIGMAS[k] * long));
  }

  get sourceSize() { return { width: this.srcW, height: this.srcH }; }

  setLut(key: string | null, table: Uint8Array | null, size = 33) {
    if (key === this.lutKey) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_3D, this.lut);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (table) gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB8, size, size, size, 0, gl.RGB, gl.UNSIGNED_BYTE, table);
    else gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB8, 1, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array(3));
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    this.lutKey = table ? key : null;
    if (table) this.lutSize = size;
  }

  /** Desenfoque gaussiano de la foto entera (sigma en px de la foto de trabajo). */
  private blurOf(prev: Target | null, sigma: number): Target {
    const gl = this.gl;
    const f = Math.max(1, Math.min(32, sigma / 3));
    const w = Math.max(8, Math.round(this.srcW / f)), h = Math.max(8, Math.round(this.srcH / f));
    const a = prev && prev.w === w && prev.h === h ? prev : (this.free(prev), this.target(w, h));
    let b = this.tmp.find((t) => t.w === w && t.h === h);
    if (!b) { b = this.target(w, h); this.tmp.push(b); }
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.down);
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb);
    this.bind(this.down, "uSrc", 0, this.src!);
    this.bind(this.down, "uMask", 1, this.white);
    gl.uniform1f(gl.getUniformLocation(this.down, "uUseMask"), 0);
    gl.uniform4f(gl.getUniformLocation(this.down, "uRect"), 0, 0, 1, 1);
    gl.uniform1f(gl.getUniformLocation(this.down, "uFlip"), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(this.blur);
    gl.uniform1f(gl.getUniformLocation(this.blur, "uFlip"), 0);
    const step = sigma / f / (2 * Math.SQRT2);
    for (let i = 0; i < 2; i++) {
      for (const [dx, dy, from, to] of [[step / w, 0, a, b], [0, step / h, b, a]] as const) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, to.fb);
        this.bind(this.blur, "uTex", 0, from.tex);
        gl.uniform2f(gl.getUniformLocation(this.blur, "uDir"), dx, dy);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return a;
  }

  private u(name: string) {
    if (!this.loc.has(name)) this.loc.set(name, this.gl.getUniformLocation(this.main, name));
    return this.loc.get(name)!;
  }

  render(d: Dev, o: ProRenderOptions) {
    const gl = this.gl;
    if (!this.src) return;
    const canvas = this.canvas;
    if (canvas.width !== o.width || canvas.height !== o.height) { canvas.width = o.width; canvas.height = o.height; }
    gl.viewport(0, 0, o.width, o.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const p = this.main;
    gl.useProgram(p);
    this.bind(p, "uSrc", 0, this.src);
    this.bind(p, "uB1", 1, this.blurs.b1!.tex);
    this.bind(p, "uBT", 2, this.blurs.bt!.tex);
    this.bind(p, "uB2", 3, this.blurs.b2!.tex);
    this.bind(p, "uB3", 4, this.blurs.b3!.tex);
    const curveOn = !(isLine(d.curves.master) && isLine(d.curves.r) && isLine(d.curves.g) && isLine(d.curves.b));
    if (curveOn) {
      const key = JSON.stringify(d.curves);
      if (key !== this.curveKey) {
        gl.bindTexture(gl.TEXTURE_2D, this.curve);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, curveTable(d.curves));
        this.curveKey = key;
      }
    }
    this.bind(p, "uCurve", 5, this.curve);
    this.bind(p, "uLut", 6, this.lut, gl.TEXTURE_3D);
    const u = (n: string) => this.u(n);
    const f1 = (n: string, v: number) => gl.uniform1f(u(n), v);
    const c = o.noCrop ? { x: 0, y: 0, w: 1, h: 1 } : d.crop;
    gl.uniform1f(u("uFlip"), 1);
    gl.uniform4f(u("uCrop"), c.x, c.y, c.w, c.h);
    gl.uniform2f(u("uOut"), o.width, o.height);
    const r = rotatedSize(this.srcW, this.srcH, d.rotate);
    f1("uAspect", r.w / r.h);
    f1("uAngle", (d.angle * Math.PI) / 180);
    f1("uZoom", rotateCover(d.angle, r.w, r.h));
    f1("uFlipH", d.flipH ? 1 : 0);
    f1("uRot", d.rotate / 90);
    f1("uOriginal", o.original ? 1 : 0);
    gl.uniform2f(u("uWb"), d.wbR, d.wbB);
    f1("uTemp", d.temp / 100); f1("uTint", d.tint / 100);
    f1("uExposure", d.exposure); f1("uContrast", d.contrast / 100);
    f1("uHigh", d.highlights / 100); f1("uShadow", d.shadows / 100);
    f1("uWhites", d.whites / 100); f1("uBlacks", d.blacks / 100);
    f1("uVib", d.vibrance / 100); f1("uSat", d.saturation / 100);
    f1("uTexture", d.texture / 100); f1("uClarity", d.clarity / 100); f1("uDehaze", d.dehaze / 100);
    f1("uHasCurve", curveOn ? 1 : 0);
    const hslOn = d.hsl.some((x) => x.h || x.s || x.l);
    f1("uHasHsl", hslOn ? 1 : 0);
    gl.uniform3fv(u("uHsl"), new Float32Array(d.hsl.flatMap((x) => [x.h / 100, x.s / 100, x.l / 100])));
    const g = d.grade;
    const gv = (x: { hue: number; sat: number; lum: number }) => [x.hue / 360, x.sat / 100, x.lum / 100] as const;
    gl.uniform3f(u("uGradeS"), ...gv(g.shadows));
    gl.uniform3f(u("uGradeM"), ...gv(g.mid));
    gl.uniform3f(u("uGradeH"), ...gv(g.highlights));
    gl.uniform3f(u("uGradeG"), ...gv(g.global));
    f1("uBlend", g.blending / 100); f1("uBalance", g.balance / 100);
    f1("uHasGrade", [g.shadows, g.mid, g.highlights, g.global].some((x) => x.sat || x.lum) ? 1 : 0);
    f1("uSharpen", d.sharpen / 100); f1("uSharpMask", d.sharpenMask / 100);
    f1("uNoise", d.noise / 100); f1("uColorNoise", d.colorNoise / 100);
    f1("uVignette", d.vignette / 100); f1("uVigMid", d.vignetteMid / 100);
    f1("uGrain", d.grain / 100); f1("uGrainSize", d.grainSize / 100); f1("uSeed", 17);
    f1("uHasLut", this.lutKey && d.lut === this.lutKey ? 1 : 0);
    f1("uLutAmount", d.lutAmount / 100); f1("uLutSize", this.lutSize);
    f1("uBw", d.bw ? 1 : 0);
    gl.uniform1fv(u("uBwMix"), new Float32Array(d.bwMix.map((v) => v / 100)));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Histograma (R, G, B, luminancia; 64 cajas) de lo último revelado, leyendo una muestra de píxeles. */
  histogram(bins = 64): Float32Array[] {
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const out = [0, 1, 2, 3].map(() => new Float32Array(bins));
    const step = Math.max(1, Math.floor((w * h) / 60000)) * 4;
    for (let i = 0; i < px.length; i += step) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      out[0][(r * bins) >> 8]++;
      out[1][(g * bins) >> 8]++;
      out[2][(b * bins) >> 8]++;
      out[3][((0.2126 * r + 0.7152 * g + 0.0722 * b) * bins) >> 8]++;
    }
    return out;
  }

  async toBlob(type = "image/jpeg", quality = 0.92): Promise<Blob> {
    const c = this.canvas;
    if ("convertToBlob" in c) return c.convertToBlob({ type, quality });
    return new Promise((res, rej) => (c as HTMLCanvasElement).toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), type, quality));
  }

  dispose() {
    Object.values(this.blurs).forEach((t) => this.free(t));
    this.tmp.forEach((t) => this.free(t));
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
