// Alfas de las máscaras de una foto: la foto a ≤ 1024 px, la IA (segmentación de persona y puntos de la cara)
// solo cuando una máscara la necesita, y una caché por zona para no recalcular lo que no cambia.
import { faceLandmarks, pixelsOf, pro, segment, shrink, type Pixels } from "@phootflow/core";

const SIDE = 1024;
type Mask = { data: Uint8Array; width: number; height: number };

/** Remuestreo bilineal de una máscara 0..255 a w×h (0..1). */
function resize(m: Mask | undefined, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  if (!m) return out;
  const { data, width: mw, height: mh } = m;
  for (let y = 0; y < h; y++) {
    const fy = Math.max(0, Math.min(mh - 1, ((y + 0.5) / h) * mh - 0.5)), y0 = Math.floor(fy), y1 = Math.min(mh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.max(0, Math.min(mw - 1, ((x + 0.5) / w) * mw - 0.5)), x0 = Math.floor(fx), x1 = Math.min(mw - 1, x0 + 1), tx = fx - x0;
      const a = data[y0 * mw + x0] * (1 - tx) + data[y0 * mw + x1] * tx;
      const b = data[y1 * mw + x0] * (1 - tx) + data[y1 * mw + x1] * tx;
      out[y * w + x] = (a * (1 - ty) + b * ty) / 255;
    }
  }
  return out;
}

export class MaskWork {
  readonly ctx: pro.masks.MaskContext;
  private small: Pixels;
  private zones = new Map<string, Float32Array>();
  private segP: Promise<void> | null = null;
  private faceP: Promise<void> | null = null;
  /** Avisos para la interfaz (IA sin conexión, sin caras…). */
  note = "";

  constructor(work: Pixels) {
    this.small = shrink(work, SIDE);
    const px = pixelsOf(this.small);
    const rgb = new Float32Array(px.width * px.height * 3);
    for (let i = 0, j = 0; i < px.data.length; i += 4, j += 3) {
      rgb[j] = px.data[i] / 255; rgb[j + 1] = px.data[i + 1] / 255; rgb[j + 2] = px.data[i + 2] / 255;
    }
    this.ctx = { w: px.width, h: px.height, rgb, cache: {} };
  }

  private ensureSeg() {
    this.segP ??= (async () => {
      const s = await segment(this.small);
      const { w, h } = this.ctx;
      if (!s) { this.note = "No se ha podido cargar la IA (¿sin conexión la primera vez?)."; this.ctx.seg = null; return; }
      const M = s.masks;
      const bg = M.background ? resize(M.background, w, h) : (() => { const p = resize(s.person, w, h); return p.map((v) => 1 - v); })();
      const face = resize(M.face, w, h), skin = resize(M.skin, w, h);
      const body = skin.map((v, i) => Math.max(0, v - face[i]));
      this.ctx.seg = [bg, resize(M.hair, w, h), body, face, resize(M.clothes, w, h), resize(M.accessories, w, h)];
    })();
    return this.segP;
  }

  private ensureFaces() {
    this.faceP ??= (async () => {
      const f = await faceLandmarks(this.small);
      this.ctx.faces = f;
      if (!f.length) this.note = "No se ha encontrado ninguna cara en esta foto.";
    })();
    return this.faceP;
  }

  /** Alfa de la máscara en bytes (w×h de la foto reducida). */
  async alpha(m: pro.LocalMask): Promise<{ data: Uint8Array; w: number; h: number }> {
    const zones = [m, ...m.parts.filter((p) => p.enabled !== false)];
    if (zones.some((z) => pro.masks.needsAI(z.type) || z.type === "beard")) await this.ensureSeg();
    if (zones.some((z) => pro.masks.needsFaces(z.type))) await this.ensureFaces();
    // la caché de zonas se queda con las que siguen existiendo
    if (this.zones.size > 40) this.zones.clear();
    return { data: pro.masks.toBytes(pro.masks.maskAlpha(m, this.ctx, this.zones)), w: this.ctx.w, h: this.ctx.h };
  }

  /** Sube al revelador los alfas que falten o hayan cambiado. Devuelve true si ha cambiado alguno. */
  async sync(r: pro.ProRenderer, masks: pro.LocalMask[]): Promise<boolean> {
    r.keepMasks(masks.map((m) => m.id));
    let changed = false;
    for (const m of masks) {
      const key = pro.masks.maskKey(m);
      if (r.hasMaskAlpha(m.id, key)) continue;
      const a = await this.alpha(m);
      r.setMaskAlpha(m.id, key, a.data, a.w, a.h);
      changed = true;
    }
    return changed;
  }
}
