// Componer las capas de retoque sobre la foto revelada (lienzos 2D). Se usa para la vista (con caché por capa:
// cambiar la de arriba no recalcula las de abajo), para la miniatura y para exportar a tamaño completo.
import type { Mask } from "../render/renderer";
import type { Pixels } from "../render/image";
import { portraitMask } from "../ai/portrait";
import { segment } from "../ai/vision";
import { removeArea } from "../ai/inpaint";
import {
  FONTS, strokesBox,
  type BackgroundLayer, type HealLayer, type Layer, type LogoLayer, type RemoveLayer, type Stroke, type TextLayer,
} from "./layers";
import { cloneHeal, findHealSource, maskBounds, personAlpha, portraitRetouch, rasterStrokes, type Region } from "./pixels";

export function canvas(w: number, h: number): Pixels {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}
export const ctx2d = (c: Pixels) => c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;

export function copyOf(src: Pixels): Pixels {
  const c = canvas(src.width, src.height);
  ctx2d(c).drawImage(src as CanvasImageSource, 0, 0);
  return c;
}

/** Máscaras de la IA para una capa de retrato o de fondo, calculadas sobre lo que esa capa tiene debajo. */
export interface LayerMasks {
  /** Retrato: R = ojos, G = iris, B = boca, A = ojeras; null si no hay caras. */
  face: Mask | null;
  skin: Mask | null;
  person: Mask | null;
}

/** Lo que necesitan las capas además de sus parámetros: máscaras de la IA (por capa) e imágenes decodificadas. */
export interface Assets {
  masks: Map<string, LayerMasks>;
  images: Map<Blob, ImageBitmap>;
}

export const emptyAssets = (): Assets => ({ masks: new Map(), images: new Map() });

const blobOf = (l: Layer) =>
  l.kind === "remove" ? l.patch : l.kind === "logo" ? l.image : l.kind === "background" && l.mode === "image" ? l.image : null;

/** Máscaras de la IA sobre una imagen (reducida a 1280 px para la IA). */
export async function computeMasks(img: Pixels, portrait: boolean): Promise<LayerMasks> {
  const s = Math.min(1, 1280 / Math.max(img.width, img.height));
  let sm = img;
  if (s < 1) {
    sm = canvas(Math.round(img.width * s), Math.round(img.height * s));
    ctx2d(sm).drawImage(img as CanvasImageSource, 0, 0, sm.width, sm.height);
  }
  const seg = await segment(sm);
  return {
    skin: seg?.masks.skin ?? null,
    person: seg?.masks.person ?? null,
    face: portrait ? await portraitMask(sm, 768) : null,
  };
}

/**
 * Prepara una capa para componerla sobre `below` (lo que tiene debajo): decodifica su imagen y, si es de
 * retrato o de fondo y aún no las tiene, calcula sus máscaras de la IA.
 */
export async function prepareLayer(l: Layer, below: Pixels, a: Assets): Promise<void> {
  const blob = blobOf(l);
  if (blob && blob.size && !a.images.has(blob)) {
    try { a.images.set(blob, await createImageBitmap(blob)); } catch { /* imagen dañada: se ignora */ }
  }
  if ((l.kind === "portrait" || l.kind === "background") && !a.masks.has(l.id)) a.masks.set(l.id, await computeMasks(below, l.kind === "portrait"));
}

/** Carga lo que falte para componer todas estas capas sobre `base` (cada una ve lo que tiene debajo). */
export async function loadAssets(layers: Layer[], base: Pixels, a: Assets = emptyAssets()): Promise<Assets> {
  let cur = base;
  for (const [i, l] of layers.entries()) {
    await prepareLayer(l, cur, a);
    if (i < layers.length - 1) cur = applyLayer(cur, l, a);
  }
  return a;
}

// ------------------------------------------------------------------ capas

function region(b: Region, W: number, H: number): Region {
  const x = Math.max(0, Math.floor(b.x)), y = Math.max(0, Math.floor(b.y));
  return { x, y, w: Math.max(1, Math.min(W, Math.ceil(b.x + b.w)) - x), h: Math.max(1, Math.min(H, Math.ceil(b.y + b.h)) - y) };
}

function applyHeal(src: Pixels, l: HealLayer): Pixels {
  const W = src.width, H = src.height;
  const nb = strokesBox(l.strokes, W / H, 0.004);
  if (!nb) return src;
  const dx = Math.round(l.dx * W), dy = Math.round(l.dy * H);
  // trozo que abarca destino y origen (más un margen para el borde del corrector)
  const pad = 4;
  const bx0 = nb.x * W, by0 = nb.y * H, bx1 = (nb.x + nb.w) * W, by1 = (nb.y + nb.h) * H;
  const R = region({
    x: Math.min(bx0, bx0 + dx) - pad, y: Math.min(by0, by0 + dy) - pad,
    w: Math.max(bx1, bx1 + dx) - Math.min(bx0, bx0 + dx) + 2 * pad, h: Math.max(by1, by1 + dy) - Math.min(by0, by0 + dy) + 2 * pad,
  }, W, H);
  const out = copyOf(src), c = ctx2d(out);
  const img = c.getImageData(R.x, R.y, R.w, R.h);
  const mask = rasterStrokes(l.strokes, W, H, R, l.mode === "heal" ? 0.5 : 0.7);
  const res = cloneHeal(img, mask, dx, dy, l.mode === "heal");
  c.putImageData(new ImageData(res.data as unknown as Uint8ClampedArray<ArrayBuffer>, R.w, R.h), R.x, R.y);
  return out;
}

function applyRemove(src: Pixels, l: RemoveLayer, a: Assets): Pixels {
  const bmp = l.patch && a.images.get(l.patch);
  if (!bmp) return src;
  const out = copyOf(src), W = src.width, H = src.height;
  ctx2d(out).drawImage(bmp, l.box.x * W, l.box.y * H, l.box.w * W, l.box.h * H);
  return out;
}

function applyPortrait(src: Pixels, l: Layer & { kind: "portrait" }, a: Assets): Pixels {
  const m = a.masks.get(l.id);
  if (!m || (!m.face && !m.skin)) return src;
  const out = copyOf(src), c = ctx2d(out);
  const img = c.getImageData(0, 0, out.width, out.height);
  const res = portraitRetouch(img, { face: m.face, skin: m.skin }, l);
  c.putImageData(new ImageData(res.data as unknown as Uint8ClampedArray<ArrayBuffer>, out.width, out.height), 0, 0);
  return out;
}

function applyBackground(src: Pixels, l: BackgroundLayer, a: Assets): Pixels {
  const person = a.masks.get(l.id)?.person;
  if (!person) return src;
  const W = src.width, H = src.height;
  // la persona recortada
  const alpha = personAlpha(person, W, H, l.feather);
  const cut = copyOf(src), cc = ctx2d(cut);
  const id = cc.getImageData(0, 0, W, H);
  for (let i = 0; i < W * H; i++) id.data[i * 4 + 3] = alpha[i];
  cc.putImageData(id, 0, 0);
  // el fondo nuevo
  const out = canvas(W, H), c = ctx2d(out);
  if (l.mode === "color") { c.fillStyle = l.color; c.fillRect(0, 0, W, H); }
  else if (l.mode === "blur") {
    const r = Math.max(1, (l.blur / 100) * Math.max(W, H) * 0.025);
    // se desenfoca con márgenes para que no entre negro por los bordes
    c.filter = `blur(${r}px)`;
    c.drawImage(src as CanvasImageSource, -r * 2, -r * 2, W + r * 4, H + r * 4);
    c.filter = "none";
  } else if (l.mode === "image") {
    const bmp = l.image && a.images.get(l.image);
    if (bmp) {
      const s = Math.max(W / bmp.width, H / bmp.height); // cubrir
      c.drawImage(bmp, (W - bmp.width * s) / 2, (H - bmp.height * s) / 2, bmp.width * s, bmp.height * s);
    } else { c.fillStyle = "#ffffff"; c.fillRect(0, 0, W, H); }
  }
  c.drawImage(cut as CanvasImageSource, 0, 0);
  return out;
}

/** Medidas del texto en una foto W×H: líneas, alto de línea y caja (sin girar) centrada en (x, y). */
export function textMetrics(l: TextLayer, W: number, H: number, ctx: CanvasRenderingContext2D) {
  const px = Math.max(4, l.size * W);
  ctx.font = `${l.bold ? 800 : 500} ${px}px ${FONTS[l.font].css}`;
  const lines = (l.text || " ").split("\n");
  const lh = px * 1.18;
  const tw = Math.max(...lines.map((s) => ctx.measureText(s).width));
  const padX = l.box ? px * 0.45 : px * 0.1, padY = l.box ? px * 0.3 : px * 0.05;
  return { px, lines, lh, w: tw + padX * 2, h: lh * lines.length + padY * 2, padX, padY, tw };
}

function drawText(c: CanvasRenderingContext2D, l: TextLayer, W: number, H: number) {
  const m = textMetrics(l, W, H, c);
  c.save();
  c.translate(l.x * W, l.y * H);
  c.rotate((l.rotation * Math.PI) / 180);
  if (l.box) {
    c.fillStyle = l.box;
    const r = m.px * 0.25;
    c.beginPath();
    c.roundRect(-m.w / 2, -m.h / 2, m.w, m.h, r);
    c.fill();
  }
  c.fillStyle = l.color;
  c.textBaseline = "middle";
  c.textAlign = l.align;
  if (l.shadow && !l.box) { c.shadowColor = "rgba(0,0,0,0.55)"; c.shadowBlur = m.px * 0.18; c.shadowOffsetY = m.px * 0.05; }
  const x = l.align === "left" ? -m.tw / 2 : l.align === "right" ? m.tw / 2 : 0;
  m.lines.forEach((s, i) => c.fillText(s, x, -m.h / 2 + m.padY + m.lh * (i + 0.5)));
  c.restore();
}

/** Caja del logo (sin girar) centrada en (x, y), en px. */
export function logoSize(l: LogoLayer, W: number, bmp: { width: number; height: number } | undefined) {
  const w = l.scale * W, h = bmp ? (w * bmp.height) / bmp.width : w;
  return { w, h };
}

function drawLogo(c: CanvasRenderingContext2D, l: LogoLayer, W: number, H: number, a: Assets) {
  const bmp = l.image ? a.images.get(l.image) : undefined;
  if (!bmp) return;
  const { w, h } = logoSize(l, W, bmp);
  c.save();
  c.translate(l.x * W, l.y * H);
  c.rotate((l.rotation * Math.PI) / 180);
  c.drawImage(bmp, -w / 2, -h / 2, w, h);
  c.restore();
}

/** Aplica una capa (con su opacidad) y devuelve un lienzo nuevo (o el mismo si no cambia nada). */
export function applyLayer(src: Pixels, l: Layer, a: Assets): Pixels {
  if (!l.visible || l.opacity <= 0) return src;
  if (l.kind === "text" || l.kind === "logo") {
    const out = copyOf(src), c = ctx2d(out);
    c.globalAlpha = l.opacity;
    if (l.kind === "text") drawText(c, l, src.width, src.height); else drawLogo(c, l, src.width, src.height, a);
    return out;
  }
  const res = l.kind === "heal" ? applyHeal(src, l)
    : l.kind === "remove" ? applyRemove(src, l, a)
      : l.kind === "portrait" ? applyPortrait(src, l, a)
        : applyBackground(src, l, a);
  if (res === src || l.opacity >= 1) return res;
  const out = copyOf(src), c = ctx2d(out);
  c.globalAlpha = l.opacity;
  c.drawImage(res as CanvasImageSource, 0, 0);
  return out;
}

/** Compone todas las capas (sin caché): para exportar y para las miniaturas. */
export function composeAll(base: Pixels, layers: Layer[], a: Assets): Pixels {
  let cur = base;
  for (const l of layers) cur = applyLayer(cur, l, a);
  return cur;
}

/** Composición con caché: guarda el resultado tras cada capa y reutiliza lo que no ha cambiado. */
export class Composer {
  private steps: { layer: Layer; out: Pixels }[] = [];
  constructor(public base: Pixels, public assets: Assets = emptyAssets()) {}
  setBase(base: Pixels) { this.base = base; this.steps = []; }
  /** Olvida lo calculado (p. ej., tras cargar máscaras nuevas). */
  reset() { this.steps = []; }
  /** Resultado bajo la capa `i` (lo que ve esa capa como entrada). */
  below(layers: Layer[], i: number): Pixels { return this.compose(layers.slice(0, i)); }
  compose(layers: Layer[]): Pixels {
    let k = 0;
    while (k < layers.length && k < this.steps.length && this.steps[k].layer === layers[k]) k++;
    this.steps.length = k;
    let cur = k ? this.steps[k - 1].out : this.base;
    for (let i = k; i < layers.length; i++) {
      cur = applyLayer(cur, layers[i], this.assets);
      this.steps.push({ layer: layers[i], out: cur });
    }
    return cur;
  }
}

// ------------------------------------------------------------------ crear capas que necesitan cálculo

/** Corrector: elige solo el origen (sobre la imagen que hay debajo) y devuelve el desplazamiento normalizado. */
export function healOffset(below: Pixels, strokes: Stroke[]): { dx: number; dy: number } {
  const W = below.width, H = below.height;
  const img = ctx2d(below).getImageData(0, 0, W, H);
  const mask = rasterStrokes(strokes, W, H);
  const d = findHealSource(img, mask);
  return { dx: d.dx / W, dy: d.dy / H };
}

/**
 * Quitar: rellena con la IA lo pintado (o la máscara `hole` del mismo tamaño) sobre la imagen de debajo y guarda
 * solo el trozo cambiado como PNG con borde suave.
 */
export async function computeRemovePatch(below: Pixels, l: RemoveLayer, hole?: Uint8Array): Promise<RemoveLayer> {
  const W = below.width, H = below.height;
  const a = hole ?? rasterStrokes(l.strokes, W, H, undefined, 0.8);
  const b = maskBounds(a, W, H);
  if (!b) return l;
  const holeC = canvas(W, H), hc = ctx2d(holeC);
  const hd = hc.createImageData(W, H);
  for (let i = 0; i < W * H; i++) { hd.data[i * 4 + 3] = a[i]; }
  hc.putImageData(hd, 0, 0);
  const filled = await removeArea(below, holeC);
  // el trozo: la caja del hueco, agrandada lo que agranda el relleno
  const g = Math.max(2, Math.round(Math.max(W, H) * 0.008)) * 3;
  const R = region({ x: b.x - g, y: b.y - g, w: b.w + 2 * g, h: b.h + 2 * g }, W, H);
  const patch = canvas(R.w, R.h), pc = ctx2d(patch);
  // alfa del parche: el hueco ensanchado y suavizado
  const am = canvas(R.w, R.h), ac = ctx2d(am);
  ac.filter = `blur(${g / 2}px)`;
  ac.drawImage(holeC as CanvasImageSource, -R.x, -R.y);
  ac.filter = "none";
  const ad = ac.getImageData(0, 0, R.w, R.h).data;
  pc.drawImage(filled as CanvasImageSource, R.x, R.y, R.w, R.h, 0, 0, R.w, R.h);
  const pd = pc.getImageData(0, 0, R.w, R.h);
  for (let i = 0; i < R.w * R.h; i++) pd.data[i * 4 + 3] = Math.min(255, ad[i * 4 + 3] * 5);
  pc.putImageData(pd, 0, 0);
  const blob = "convertToBlob" in patch
    ? await patch.convertToBlob({ type: "image/png" })
    : await new Promise<Blob>((res, rej) => (patch as HTMLCanvasElement).toBlob((x) => (x ? res(x) : rej(new Error("toBlob"))), "image/png"));
  return { ...l, patch: blob, box: { x: R.x / W, y: R.y / H, w: R.w / W, h: R.h / H } };
}

/** Lienzo a Blob. */
export async function toBlob(c: Pixels, type: string, quality?: number): Promise<Blob> {
  if ("convertToBlob" in c) return c.convertToBlob({ type, quality });
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), type, quality));
}

/** Aplana sobre un color (para JPEG, que no tiene transparencia). */
export function flatten(c: Pixels, color = "#ffffff"): Pixels {
  const out = canvas(c.width, c.height), x = ctx2d(out);
  x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(c as CanvasImageSource, 0, 0);
  return out;
}

/** ¿Alguna capa deja zonas transparentes? */
export const hasTransparency = (ls: Layer[]) => ls.some((l) => l.visible && l.kind === "background" && l.mode === "transparent");
