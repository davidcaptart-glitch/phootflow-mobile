// Diseños para redes: un «tablero» de una o varias páginas puestas en fila. Las coordenadas van en unidades de
// página (x de 0 a `pages`, y de 0 a 1), así un elemento puede cruzar de una página a otra (carrusel
// continuo) y al exportar se corta en páginas. Los elementos se pueden girar, tienen capas (el orden de `items`)
// y las fotos pueden ir en marco (rectángulo, círculo, arco) o recortadas sin fondo.
import type { FormatId } from "../engine/types";
import { formatById } from "../engine/formats";
import type { Pixels } from "../render/image";

export type Frame = "rect" | "circle" | "arch";

export interface PhotoItem {
  kind: "photo";
  id: string;
  photo: string;           // id de la foto de la sesión
  x: number; y: number; w: number; h: number;
  zoom: number;            // 1 = llena el hueco
  ox: number; oy: number;  // desplazamiento -1..1 dentro del hueco
  radius: number;          // esquinas, fracción del lado corto del hueco
  rot?: number;            // grados
  frame?: Frame;
  border?: number;         // grosor del borde, fracción del lado corto
  borderColor?: string;
  /** La persona recortada, sin fondo (se dibuja entera, sin marco). */
  cutout?: boolean;
  shadow?: boolean;
}

export interface TextItem {
  kind: "text";
  id: string;
  text: string;
  x: number; y: number;    // centro
  size: number;            // alto de letra en fracción del alto de página
  font: FontId;
  color: string;
  weight: number;
  align: "left" | "center" | "right";
  box: string | null;      // color de fondo detrás del texto
  shadow: boolean;
  spacing: number;         // espaciado entre letras en em
  upper: boolean;
  rot?: number;
}

export interface StickerItem {
  kind: "sticker";
  id: string;
  emoji: string;
  x: number; y: number;
  size: number;
  rot?: number;
}

export interface ShapeItem {
  kind: "shape";
  id: string;
  shape: "rect" | "circle" | "line";
  x: number; y: number; w: number; h: number;
  fill: string;
  radius?: number;
  rot?: number;
  opacity?: number;
}

export type Item = PhotoItem | TextItem | StickerItem | ShapeItem;

export interface Board {
  format: FormatId;
  pages: number;
  bg: string;
  /** Degradado: el fondo va de `bg` a `grad.to` con ese ángulo (grados). */
  grad?: { to: string; angle: number } | null;
  items: Item[];
}

export const MAX_PAGES = 10;

export const FONTS = {
  moderna: { name: "Moderna", css: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  elegante: { name: "Elegante", css: "Didot, 'Bodoni 72', 'Bodoni MT', 'Playfair Display', Georgia, serif" },
  clasica: { name: "Clásica", css: "Georgia, 'Times New Roman', serif" },
  manuscrita: { name: "Manuscrita", css: "'Snell Roundhand', 'Segoe Script', 'Brush Script MT', 'Dancing Script', cursive" },
  impacto: { name: "Impacto", css: "Impact, 'Arial Black', 'Helvetica Neue', sans-serif" },
  maquina: { name: "Máquina", css: "'Courier New', Courier, monospace" },
} as const;
export type FontId = keyof typeof FONTS;

export const PALETTE = ["#ffffff", "#111111", "#f5efe6", "#d9c3a5", "#c8a2c8", "#e94f86", "#7b5cff", "#2f6f5e", "#f2c14e", "#e4572e"];
export const GRADIENTS: [string, string][] = [
  ["#f5efe6", "#d9c3a5"], ["#ffd6e0", "#c8a2c8"], ["#fbd3e9", "#bb377d"], ["#a1c4fd", "#c2e9fb"],
  ["#f6d365", "#fda085"], ["#0f2027", "#2c5364"], ["#232526", "#414345"], ["#e0eafc", "#cfdef3"],
];
export const STICKERS = ["❤️", "✨", "🤍", "💍", "🥂", "🎉", "🌸", "📸", "⚽", "🏆", "🎂", "☀️", "🌙", "⭐", "🔥", "👰", "🤵", "🎈",
  "🌿", "🍃", "🌊", "🎶", "💫", "🫶", "😍", "🥳", "📍", "✈️", "🏖️", "🌅", "🎄", "🐾"];

let n = 0;
export const newId = () => `e${Date.now().toString(36)}${(++n).toString(36)}`;

export function pageSize(b: Board, width = formatById(b.format).w) {
  const f = formatById(b.format);
  return { w: width, h: Math.round((width * f.h) / f.w) };
}

/** Clave de la imagen recortada (sin fondo) de una foto en el mapa de imágenes. */
export const cutKey = (photoId: string) => `${photoId}#recorte`;

function canvas(w: number, h: number): Pixels {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

/** Líneas de un texto (en mayúsculas si toca). */
export function textLines(t: TextItem) {
  return (t.upper ? t.text.toUpperCase() : t.text).split("\n");
}

function framePath(ctx: CanvasRenderingContext2D, it: PhotoItem, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  const f = it.frame ?? "rect";
  if (f === "circle") ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (f === "arch") {
    const r = w / 2;
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.arc(x + r, y + r, r, Math.PI, 0);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  } else ctx.roundRect(x, y, w, h, it.radius * Math.min(w, h));
}

/** Caja sin girar (px del tablero) y su centro. */
export function itemBox(ctx: CanvasRenderingContext2D, it: Item, pw: number, ph: number) {
  if (it.kind === "photo" || it.kind === "shape") return { x: it.x * pw, y: it.y * ph, w: it.w * pw, h: it.h * ph };
  if (it.kind === "sticker") {
    const s = it.size * ph;
    return { x: it.x * pw - s * 0.6, y: it.y * ph - s * 0.6, w: s * 1.2, h: s * 1.2 };
  }
  const size = it.size * ph;
  ctx.save();
  ctx.font = `${it.weight} ${size}px ${FONTS[it.font].css}`;
  ctx.letterSpacing = `${it.spacing * size}px`;
  const lines = textLines(it);
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width), size) + size * 0.6;
  ctx.restore();
  const h = size * 1.18 * lines.length + size * 0.6;
  const cx = it.x * pw;
  const x = it.align === "left" ? cx - size * 0.3 : it.align === "right" ? cx - w + size * 0.3 : cx - w / 2;
  return { x, y: it.y * ph - h / 2, w, h };
}

/** Compatibilidad: caja sin girar. */
export const itemBounds = itemBox;

/** Pinta el tablero entero (todas las páginas en fila). `pw` = ancho de una página en px. */
export function paintBoard(ctx: CanvasRenderingContext2D, b: Board, photos: Map<string, Pixels>, pw: number, ph: number) {
  ctx.save();
  const W = pw * b.pages;
  if (b.grad) {
    const a = (b.grad.angle * Math.PI) / 180, cx = W / 2, cy = ph / 2, L = Math.abs(W * Math.cos(a)) / 2 + Math.abs(ph * Math.sin(a)) / 2;
    const g = ctx.createLinearGradient(cx - Math.cos(a) * L, cy - Math.sin(a) * L, cx + Math.cos(a) * L, cy + Math.sin(a) * L);
    g.addColorStop(0, b.bg);
    g.addColorStop(1, b.grad.to);
    ctx.fillStyle = g;
  } else ctx.fillStyle = b.bg;
  ctx.fillRect(0, 0, W, ph);
  for (const it of b.items) {
    const box = itemBox(ctx, it, pw, ph);
    ctx.save();
    if (it.rot) {
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      ctx.translate(cx, cy);
      ctx.rotate((it.rot * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }
    if (it.kind === "photo") paintPhoto(ctx, it, photos, box);
    else if (it.kind === "shape") {
      ctx.globalAlpha = it.opacity ?? 1;
      ctx.fillStyle = it.fill;
      ctx.beginPath();
      if (it.shape === "circle") ctx.ellipse(box.x + box.w / 2, box.y + box.h / 2, box.w / 2, box.h / 2, 0, 0, Math.PI * 2);
      else ctx.roundRect(box.x, box.y, box.w, box.h, (it.radius ?? 0) * Math.min(box.w, box.h));
      ctx.fill();
    } else if (it.kind === "text") paintText(ctx, it, pw, ph);
    else {
      const size = it.size * ph;
      ctx.font = `${size}px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(it.emoji, it.x * pw, it.y * ph);
    }
    ctx.restore();
  }
  ctx.restore();
}

function paintPhoto(ctx: CanvasRenderingContext2D, it: PhotoItem, photos: Map<string, Pixels>, box: { x: number; y: number; w: number; h: number }) {
  const { x, y, w, h } = box;
  if (it.cutout) {
    // persona sin fondo: entera dentro de la caja, con sombra suave
    const img = photos.get(cutKey(it.photo));
    if (!img) return;
    const s = Math.min(w / img.width, h / img.height);
    const dw = img.width * s, dh = img.height * s;
    if (it.shadow !== false) { ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = Math.min(w, h) * 0.04; ctx.shadowOffsetY = Math.min(w, h) * 0.015; }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img as CanvasImageSource, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    return;
  }
  const img = photos.get(it.photo);
  ctx.save();
  if (it.shadow) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = Math.min(w, h) * 0.05; ctx.shadowOffsetY = Math.min(w, h) * 0.02;
    framePath(ctx, it, x, y, w, h);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.restore();
  }
  framePath(ctx, it, x, y, w, h);
  ctx.clip();
  if (img) {
    const s = Math.max(w / img.width, h / img.height) * it.zoom;
    const dw = img.width * s, dh = img.height * s;
    const dx = x + (w - dw) / 2 + (it.ox * (dw - w)) / 2;
    const dy = y + (h - dh) / 2 + (it.oy * (dh - h)) / 2;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img as CanvasImageSource, dx, dy, dw, dh);
  } else {
    ctx.fillStyle = "rgba(128,128,128,.35)";
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
  if (it.border) {
    framePath(ctx, it, x, y, w, h);
    ctx.lineWidth = it.border * Math.min(w, h) * 2;
    ctx.strokeStyle = it.borderColor ?? "#ffffff";
    ctx.save();
    framePath(ctx, it, x, y, w, h);
    ctx.clip(); // borde hacia dentro
    ctx.stroke();
    ctx.restore();
  }
}

function paintText(ctx: CanvasRenderingContext2D, it: TextItem, pw: number, ph: number) {
  const size = it.size * ph;
  ctx.font = `${it.weight} ${size}px ${FONTS[it.font].css}`;
  ctx.letterSpacing = `${it.spacing * size}px`;
  ctx.textAlign = it.align;
  ctx.textBaseline = "middle";
  const lines = textLines(it);
  const lh = size * 1.18;
  const maxW = Math.max(...lines.map((l) => ctx.measureText(l).width), 1);
  const cx = it.x * pw, cy = it.y * ph;
  const top = cy - (lh * lines.length) / 2 + lh / 2;
  if (it.box) {
    const pad = size * 0.45;
    const bx = it.align === "left" ? cx - pad : it.align === "right" ? cx - maxW - pad : cx - maxW / 2 - pad;
    ctx.fillStyle = it.box;
    ctx.beginPath();
    ctx.roundRect(bx, cy - (lh * lines.length) / 2 - pad * 0.6, maxW + pad * 2, lh * lines.length + pad * 1.2, size * 0.25);
    ctx.fill();
  }
  if (it.shadow) { ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = size * 0.35; ctx.shadowOffsetY = size * 0.06; }
  ctx.fillStyle = it.color;
  lines.forEach((l, i) => ctx.fillText(l, cx, top + i * lh));
}

/** Pasa un punto del tablero a las coordenadas sin girar del elemento. */
export function toLocal(ctx: CanvasRenderingContext2D, it: Item, px: number, py: number, pw: number, ph: number) {
  const b = itemBox(ctx, it, pw, ph);
  if (!it.rot) return { x: px, y: py, box: b };
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, a = (-it.rot * Math.PI) / 180;
  const dx = px - cx, dy = py - cy;
  return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a), box: b };
}

/** Elemento bajo el punto (px del tablero); el de más arriba primero. Tiene en cuenta el giro. */
export function hitTest(ctx: CanvasRenderingContext2D, b: Board, px: number, py: number, pw: number, ph: number): Item | null {
  for (let i = b.items.length - 1; i >= 0; i--) {
    const { x, y, box: r } = toLocal(ctx, b.items[i], px, py, pw, ph);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return b.items[i];
  }
  return null;
}

/** Capas: mueve un elemento arriba (+1), abajo (−1), al frente (+∞) o al fondo (−∞). */
export function moveLayer(b: Board, id: string, dir: number): Board {
  const i = b.items.findIndex((x) => x.id === id);
  if (i < 0) return b;
  const items = b.items.slice();
  const [it] = items.splice(i, 1);
  const j = dir === Infinity ? items.length : dir === -Infinity ? 0 : Math.max(0, Math.min(items.length, i + dir));
  items.splice(j, 0, it);
  return { ...b, items };
}

/** Páginas listas para subir (JPEG), en orden. */
export async function exportBoard(b: Board, photos: Map<string, Pixels>, baseName = "phootflow"): Promise<File[]> {
  const { w, h } = pageSize(b);
  const all = canvas(w * b.pages, h);
  paintBoard(all.getContext("2d") as CanvasRenderingContext2D, b, photos, w, h);
  const files: File[] = [];
  for (let i = 0; i < b.pages; i++) {
    const pc = canvas(w, h);
    (pc.getContext("2d") as CanvasRenderingContext2D).drawImage(all as CanvasImageSource, -i * w, 0);
    const blob = "convertToBlob" in pc
      ? await pc.convertToBlob({ type: "image/jpeg", quality: 0.93 })
      : await new Promise<Blob>((res) => (pc as HTMLCanvasElement).toBlob((x) => res(x!), "image/jpeg", 0.93));
    files.push(new File([blob], `${baseName}_${String(i + 1).padStart(2, "0")}.jpg`, { type: "image/jpeg" }));
  }
  return files;
}
