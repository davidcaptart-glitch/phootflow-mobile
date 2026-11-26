// Diseños para redes: un «tablero» de una o varias páginas puestas en fila. Las coordenadas van en unidades de
// página (x de 0 a `pages`, y de 0 a 1), así un elemento puede cruzar de una página a otra (carrusel
// continuo) y al exportar se corta en páginas. Los elementos se pueden girar, tienen capas (el orden de `items`)
// y las fotos pueden ir en marco (rectángulo, círculo, arco) o recortadas sin fondo.
//
// Fase 2 (Pro): todo lo nuevo es OPCIONAL para que los diseños guardados se abran igual (ver normalize.ts):
// bloquear/ocultar/agrupar, opacidad y animación en cualquier elemento; texto con interlineado, contorno, sombra
// configurable, caja, curva y efectos; formas nuevas con degradado y contorno; fotos «contain» (logos).
import type { FormatId } from "../engine/types";
import { formatById } from "../engine/formats";
import type { Pixels } from "../render/image";
import { animAt, type Anim } from "./anim";
import { arcLayout, resolveTextStyle, type TextEffect, type TextShadow, type TextStroke } from "./text";
import { arrowGeometry, polygonPoints, starPoints, type Pt, type ShapeKind } from "./shapes";

export type Frame = "rect" | "circle" | "arch";

/** Campos comunes a todos los elementos (todos opcionales salvo el id). */
export interface ItemBase {
  id: string;
  rot?: number;            // grados
  /** Bloqueado: no se mueve, escala ni gira con las funciones de capas. */
  locked?: boolean;
  /** Oculto: no se pinta ni se puede tocar. */
  hidden?: boolean;
  /** Id del grupo: los elementos con el mismo grupo se mueven, escalan y giran juntos. */
  group?: string | null;
  /** 0..1 (por defecto 1). */
  opacity?: number;
  /** Animación de entrada (vídeo / GIF). */
  anim?: Anim | null;
}

export interface PhotoItem extends ItemBase {
  kind: "photo";
  photo: string;           // id de la foto de la sesión (o clave de imagen: logo de marca, recorte…)
  x: number; y: number; w: number; h: number;
  zoom: number;            // 1 = llena el hueco
  ox: number; oy: number;  // desplazamiento -1..1 dentro del hueco
  radius: number;          // esquinas, fracción del lado corto del hueco
  frame?: Frame;
  border?: number;         // grosor del borde, fracción del lado corto
  borderColor?: string;
  /** La persona recortada, sin fondo (se dibuja entera, sin marco). */
  cutout?: boolean;
  shadow?: boolean;
  /** «contain»: la imagen entera dentro de la caja, sin recortar ni fondo (logos). Por defecto «cover». */
  fit?: "cover" | "contain";
}

export interface TextItem extends ItemBase {
  kind: "text";
  text: string;
  x: number; y: number;    // centro (o borde izquierdo/derecho según `align`)
  size: number;            // alto de letra en fracción del alto de página
  font: FontId;
  color: string;
  weight: number;
  align: "left" | "center" | "right";
  box: string | null;      // color de fondo detrás del texto
  shadow: boolean;
  spacing: number;         // espaciado entre letras en em
  upper: boolean;
  /** Interlineado (múltiplo del tamaño). Por defecto 1.18. */
  lineHeight?: number;
  /** Contorno (ancho en em). */
  stroke?: TextStroke | null;
  /** Sombra configurable (em). Si está, manda sobre `shadow`. */
  shadowStyle?: TextShadow | null;
  /** Relleno y radio de la caja de fondo (em). Por defecto 0.45 y 0.25. */
  boxPad?: number;
  boxRadius?: number;
  /** Texto curvo: grados de arco (+ ∩, − ∪). 0 = recto. */
  curve?: number;
  effect?: TextEffect;
}

export interface StickerItem extends ItemBase {
  kind: "sticker";
  emoji: string;
  x: number; y: number;
  size: number;
}

export interface ShapeItem extends ItemBase {
  kind: "shape";
  shape: ShapeKind;
  x: number; y: number; w: number; h: number;
  fill: string;
  radius?: number;         // esquinas (rect, roundrect, frame), fracción del lado corto
  /** Degradado del relleno: de `fill` a `grad.to` con ese ángulo (grados). */
  grad?: { to: string; angle: number } | null;
  /** Contorno de la forma (o color de la línea/flecha). */
  stroke?: string | null;
  /** Grosor del contorno, de la línea/flecha o del marco, en fracción del alto de página. */
  strokeWidth?: number;
  /** Estrella: puntas y radio interior (0..1). Polígono: lados. */
  points?: number;
  inner?: number;
  sides?: number;
}

export type Item = PhotoItem | TextItem | StickerItem | ShapeItem;

export interface Board {
  /** Versión del formato guardado (ver normalize.ts). */
  v?: number;
  format: FormatId;
  pages: number;
  bg: string;
  /** Degradado: el fondo va de `bg` a `grad.to` con ese ángulo (grados). */
  grad?: { to: string; angle: number } | null;
  items: Item[];
}

export const MAX_PAGES = 10;

/** Fuentes: las del sistema van en cadena de alternativas seguras para iOS, Android y escritorio.
 *  «Jakarta» viene incluida en la app (@fontsource-variable/plus-jakarta-sans). */
export const FONTS = {
  moderna: { name: "Moderna", css: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  elegante: { name: "Elegante", css: "Didot, 'Bodoni 72', 'Bodoni MT', 'Playfair Display', Georgia, serif" },
  clasica: { name: "Clásica", css: "Georgia, 'Times New Roman', serif" },
  manuscrita: { name: "Manuscrita", css: "'Snell Roundhand', 'Segoe Script', 'Brush Script MT', 'Dancing Script', cursive" },
  impacto: { name: "Impacto", css: "Impact, 'Arial Black', 'Helvetica Neue', sans-serif" },
  maquina: { name: "Máquina", css: "'Courier New', Courier, monospace" },
  jakarta: { name: "Jakarta", css: "'Plus Jakarta Sans Variable', 'Plus Jakarta Sans', 'Helvetica Neue', Arial, sans-serif" },
  sistema: { name: "Sistema", css: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  redonda: { name: "Redonda", css: "ui-rounded, 'SF Pro Rounded', 'Arial Rounded MT Bold', 'Varela Round', 'Nunito', sans-serif" },
  geometrica: { name: "Geométrica", css: "Futura, 'Century Gothic', 'Avenir Next', 'Trebuchet MS', sans-serif" },
  condensada: { name: "Condensada", css: "'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue Condensed', 'sans-serif-condensed', sans-serif-condensed, sans-serif" },
  humanista: { name: "Humanista", css: "Optima, Candara, 'Segoe UI', 'Noto Sans', Roboto, sans-serif" },
  editorial: { name: "Editorial", css: "Charter, 'Iowan Old Style', Cambria, 'Noto Serif', 'Droid Serif', serif" },
  palatino: { name: "Palatino", css: "Palatino, 'Palatino Linotype', 'Book Antiqua', 'URW Palladio L', serif" },
} as const;
export type FontId = keyof typeof FONTS;

/** Lista de fuentes para el selector, con su tipo (incluida en la app o del sistema) y estilo. */
export const FONT_LIST: { id: FontId; name: string; css: string; source: "incluida" | "sistema"; style: "sans" | "serif" | "script" | "display" | "mono" }[] = [
  { id: "jakarta", source: "incluida", style: "sans" },
  { id: "moderna", source: "sistema", style: "sans" },
  { id: "sistema", source: "sistema", style: "sans" },
  { id: "redonda", source: "sistema", style: "sans" },
  { id: "geometrica", source: "sistema", style: "sans" },
  { id: "humanista", source: "sistema", style: "sans" },
  { id: "condensada", source: "sistema", style: "display" },
  { id: "impacto", source: "sistema", style: "display" },
  { id: "elegante", source: "sistema", style: "serif" },
  { id: "clasica", source: "sistema", style: "serif" },
  { id: "editorial", source: "sistema", style: "serif" },
  { id: "palatino", source: "sistema", style: "serif" },
  { id: "manuscrita", source: "sistema", style: "script" },
  { id: "maquina", source: "sistema", style: "mono" },
].map((f) => ({ ...f, name: FONTS[f.id as FontId].name, css: FONTS[f.id as FontId].css })) as never;

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

export function canvas(w: number, h: number): Pixels {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

/** Líneas de un texto (en mayúsculas si toca). */
export function textLines(t: TextItem) {
  return (t.upper ? t.text.toUpperCase() : t.text).split("\n");
}

export const DEFAULT_LINE_HEIGHT = 1.18;

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

function fontOf(it: TextItem, size: number) {
  return `${it.weight} ${size}px ${(FONTS[it.font] ?? FONTS.moderna).css}`;
}

/** Ancho (px) de cada línea; con curva se mide letra a letra (como se pinta). */
function lineWidths(ctx: CanvasRenderingContext2D, it: TextItem, lines: string[], size: number) {
  if (!it.curve) return lines.map((l) => ctx.measureText(l).width);
  ctx.letterSpacing = "0px";
  const sp = it.spacing * size;
  return lines.map((l) => [...l].reduce((a, ch) => a + ctx.measureText(ch).width + sp, 0));
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
  ctx.font = fontOf(it, size);
  ctx.letterSpacing = `${it.spacing * size}px`;
  const lines = textLines(it);
  const w = Math.max(...lineWidths(ctx, it, lines, size), size) + size * 0.6;
  ctx.restore();
  const sag = it.curve ? arcLayout([w - size * 0.6], it.curve).sagitta : 0;
  const h = size * (it.lineHeight ?? DEFAULT_LINE_HEIGHT) * lines.length + size * 0.6 + sag;
  const cx = it.x * pw;
  const x = it.curve ? cx - w / 2 : it.align === "left" ? cx - size * 0.3 : it.align === "right" ? cx - w + size * 0.3 : cx - w / 2;
  return { x, y: it.y * ph - h / 2, w, h };
}

/** Compatibilidad: caja sin girar. */
export const itemBounds = itemBox;

export interface PaintOptions {
  /** Instante (s) para las animaciones de entrada. Sin él, todo se pinta en su estado final. */
  time?: number;
  /** Pinta también los elementos ocultos (atenuados), para el editor. */
  showHidden?: boolean;
}

function linear(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, from: string, to: string, angle: number) {
  const a = (angle * Math.PI) / 180, cx = x + w / 2, cy = y + h / 2, L = Math.abs(w * Math.cos(a)) / 2 + Math.abs(h * Math.sin(a)) / 2;
  const g = ctx.createLinearGradient(cx - Math.cos(a) * L, cy - Math.sin(a) * L, cx + Math.cos(a) * L, cy + Math.sin(a) * L);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  return g;
}

/** Pinta el tablero entero (todas las páginas en fila). `pw` = ancho de una página en px. */
export function paintBoard(ctx: CanvasRenderingContext2D, b: Board, photos: Map<string, Pixels>, pw: number, ph: number, opts: PaintOptions = {}) {
  ctx.save();
  const W = pw * b.pages;
  ctx.fillStyle = b.grad ? linear(ctx, 0, 0, W, ph, b.bg, b.grad.to, b.grad.angle) : b.bg;
  ctx.fillRect(0, 0, W, ph);
  for (const it of b.items) {
    if (it.hidden && !opts.showHidden) continue;
    const st = opts.time === undefined ? null : animAt(it.anim, opts.time);
    if (st && st.alpha <= 0) continue;
    const box = itemBox(ctx, it, pw, ph);
    ctx.save();
    let alpha = (it.opacity ?? 1) * (st ? st.alpha : 1);
    if (it.hidden) alpha *= 0.3;
    if (alpha < 1) ctx.globalAlpha = alpha;
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    if (st && (st.dx || st.dy)) ctx.translate(st.dx * pw, st.dy * ph);
    const rot = (it.rot ?? 0) + (st ? st.rot : 0);
    const scale = st ? st.scale : 1;
    if (rot || scale !== 1) {
      ctx.translate(cx, cy);
      if (rot) ctx.rotate((rot * Math.PI) / 180);
      if (scale !== 1) ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
    }
    if (it.kind === "photo") paintPhoto(ctx, it, photos, box);
    else if (it.kind === "shape") paintShape(ctx, it, box, ph);
    else if (it.kind === "text") paintText(ctx, it, pw, ph);
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

/** Pinta solo la página `i` en un lienzo del tamaño de una página. */
export function paintPage(ctx: CanvasRenderingContext2D, b: Board, photos: Map<string, Pixels>, i: number, pw: number, ph: number, opts: PaintOptions = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, pw, ph);
  ctx.clip();
  ctx.translate(-i * pw, 0);
  paintBoard(ctx, b, photos, pw, ph, opts);
  ctx.restore();
}

function paintPhoto(ctx: CanvasRenderingContext2D, it: PhotoItem, photos: Map<string, Pixels>, box: { x: number; y: number; w: number; h: number }) {
  const { x, y, w, h } = box;
  if (it.cutout || it.fit === "contain") {
    // persona sin fondo (o logo): entera dentro de la caja
    const img = photos.get(it.cutout ? cutKey(it.photo) : it.photo);
    if (!img) return;
    const s = Math.min(w / img.width, h / img.height);
    const dw = img.width * s, dh = img.height * s;
    if (it.cutout ? it.shadow !== false : it.shadow) { ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = Math.min(w, h) * 0.04; ctx.shadowOffsetY = Math.min(w, h) * 0.015; }
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

function poly(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
}

function paintShape(ctx: CanvasRenderingContext2D, it: ShapeItem, box: { x: number; y: number; w: number; h: number }, ph: number) {
  const { x, y, w, h } = box;
  const paint = it.grad ? linear(ctx, x, y, w, h, it.fill, it.grad.to, it.grad.angle) : it.fill;
  const m = Math.min(w, h);
  ctx.beginPath();
  if (it.shape === "line" || it.shape === "arrow") {
    // Línea antigua (sin grosor): un rectángulo relleno, como antes.
    if (it.shape === "line" && it.strokeWidth === undefined) {
      ctx.fillStyle = paint;
      ctx.roundRect(x, y, w, h, (it.radius ?? 0) * m);
      ctx.fill();
      return;
    }
    const t = Math.max(0.5, (it.strokeWidth ?? 0.008) * ph);
    ctx.strokeStyle = it.stroke && !it.grad ? it.stroke : paint;
    ctx.lineWidth = t;
    ctx.lineCap = "round";
    if (it.shape === "line") {
      ctx.moveTo(x, y + h / 2);
      ctx.lineTo(x + w, y + h / 2);
      ctx.stroke();
      return;
    }
    const g = arrowGeometry(x, y, w, h, t);
    ctx.moveTo(...g.shaft[0]);
    ctx.lineTo(...g.shaft[1]);
    ctx.stroke();
    ctx.beginPath();
    poly(ctx, g.head);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineJoin = "round";
    ctx.fill();
    return;
  }
  if (it.shape === "circle") ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (it.shape === "star") poly(ctx, starPoints(x, y, w, h, it.points ?? 5, it.inner ?? 0.45));
  else if (it.shape === "polygon") poly(ctx, polygonPoints(x, y, w, h, it.sides ?? 6));
  else if (it.shape === "frame") {
    const t = Math.min(m / 2 - 0.5, (it.strokeWidth ?? 0.02) * ph);
    const r = (it.radius ?? 0) * m;
    ctx.roundRect(x, y, w, h, r);
    ctx.roundRect(x + t, y + t, w - 2 * t, h - 2 * t, Math.max(0, r - t));
    ctx.fillStyle = paint;
    ctx.fill("evenodd");
    return;
  } else ctx.roundRect(x, y, w, h, (it.radius ?? (it.shape === "roundrect" ? 0.2 : 0)) * m);
  ctx.fillStyle = paint;
  ctx.fill();
  if (it.stroke) {
    ctx.lineWidth = Math.max(0.5, (it.strokeWidth ?? 0.005) * ph);
    ctx.strokeStyle = it.stroke;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
}

function paintText(ctx: CanvasRenderingContext2D, it: TextItem, pw: number, ph: number) {
  const size = it.size * ph;
  ctx.font = fontOf(it, size);
  ctx.letterSpacing = `${it.spacing * size}px`;
  ctx.textAlign = it.curve ? "center" : it.align;
  ctx.textBaseline = "middle";
  const lines = textLines(it);
  const lh = size * (it.lineHeight ?? DEFAULT_LINE_HEIGHT);
  const widths = lineWidths(ctx, it, lines, size);
  if (it.curve) ctx.letterSpacing = "0px";
  const maxW = Math.max(...widths, 1);
  const cx = it.x * pw, cy = it.y * ph;
  const top = cy - (lh * lines.length) / 2 + lh / 2;
  if (it.box) {
    const pad = size * (it.boxPad ?? 0.45);
    const align = it.curve ? "center" : it.align;
    const sag = it.curve ? arcLayout([maxW], it.curve).sagitta : 0;
    const bx = align === "left" ? cx - pad : align === "right" ? cx - maxW - pad : cx - maxW / 2 - pad;
    ctx.fillStyle = it.box;
    ctx.beginPath();
    ctx.roundRect(bx, cy - (lh * lines.length + sag) / 2 - pad * 0.6, maxW + pad * 2, lh * lines.length + sag + pad * 1.2, size * (it.boxRadius ?? 0.25));
    ctx.fill();
  }
  const look = resolveTextStyle(it);
  // Pinta todas las líneas con una operación (fill o stroke), rectas o curvas.
  const run = (op: (s: string, x: number, y: number) => void, ox = 0, oy = 0) => {
    lines.forEach((l, i) => {
      const ly = top + i * lh + oy;
      if (!it.curve) return op(l, cx + ox, ly);
      const chars = [...l], sp = it.spacing * size;
      const { glyphs } = arcLayout(chars.map((ch) => ctx.measureText(ch).width + sp), it.curve);
      chars.forEach((ch, k) => {
        const g = glyphs[k];
        ctx.save();
        ctx.translate(cx + ox + g.x, ly + g.y);
        ctx.rotate(g.angle);
        op(ch, 0, 0);
        ctx.restore();
      });
    });
  };
  const fill = (s: string, x: number, y: number) => ctx.fillText(s, x, y);
  const stroke = (s: string, x: number, y: number) => ctx.strokeText(s, x, y);
  const shadow = (s: TextShadow | null) => {
    ctx.shadowColor = s ? s.color : "transparent";
    ctx.shadowBlur = s ? s.blur * size : 0;
    ctx.shadowOffsetX = s ? s.dx * size : 0;
    ctx.shadowOffsetY = s ? s.dy * size : 0;
  };
  const baseAlpha = ctx.globalAlpha;
  // eco: copias desvaídas detrás
  for (const e of look.echoes) {
    ctx.globalAlpha = baseAlpha * e.alpha;
    ctx.fillStyle = look.fill ?? it.color;
    run(fill, e.dx * size, e.dy * size);
  }
  ctx.globalAlpha = baseAlpha;
  const sh = look.shadows;
  if (look.stroke) {
    ctx.lineJoin = "round";
    ctx.strokeStyle = look.stroke.color;
    ctx.lineWidth = look.stroke.width * size * (look.stroke.outside ? 2 : 1);
  }
  if (look.fill) {
    ctx.fillStyle = look.fill;
    // sombras extra (todas menos la última) en pasadas propias
    for (let i = 0; i < sh.length - 1; i++) { shadow(sh[i]); run(fill); }
    if (look.stroke?.outside) {
      // contorno por fuera: debajo del relleno, con la última sombra
      shadow(sh[sh.length - 1] ?? null);
      run(stroke);
      shadow(null);
      run(fill);
    } else {
      shadow(sh[sh.length - 1] ?? null);
      run(fill);
      if (look.stroke) { shadow(null); run(stroke); }
    }
  } else if (look.stroke) {
    shadow(sh[sh.length - 1] ?? null);
    run(stroke);
  }
}

/** Pasa un punto del tablero a las coordenadas sin girar del elemento. */
export function toLocal(ctx: CanvasRenderingContext2D, it: Item, px: number, py: number, pw: number, ph: number) {
  const b = itemBox(ctx, it, pw, ph);
  if (!it.rot) return { x: px, y: py, box: b };
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, a = (-it.rot * Math.PI) / 180;
  const dx = px - cx, dy = py - cy;
  return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a), box: b };
}

/** Elemento bajo el punto (px del tablero); el de más arriba primero. Tiene en cuenta el giro. Los ocultos no se tocan. */
export function hitTest(ctx: CanvasRenderingContext2D, b: Board, px: number, py: number, pw: number, ph: number): Item | null {
  for (let i = b.items.length - 1; i >= 0; i--) {
    if (b.items[i].hidden) continue;
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

export async function canvasToBlob(c: Pixels, type: string, quality?: number): Promise<Blob> {
  return "convertToBlob" in c
    ? c.convertToBlob({ type, quality })
    : new Promise<Blob>((res, rej) => (c as HTMLCanvasElement).toBlob((x) => (x ? res(x) : rej(new Error("No se pudo exportar"))), type, quality));
}

/** Páginas listas para subir (JPEG), en orden. */
export async function exportBoard(b: Board, photos: Map<string, Pixels>, baseName = "phootflow"): Promise<File[]> {
  const { w, h } = pageSize(b);
  const files: File[] = [];
  for (let i = 0; i < b.pages; i++) {
    const pc = canvas(w, h);
    paintPage(pc.getContext("2d") as CanvasRenderingContext2D, b, photos, i, w, h);
    const blob = await canvasToBlob(pc, "image/jpeg", 0.93);
    files.push(new File([blob], `${baseName}_${String(i + 1).padStart(2, "0")}.jpg`, { type: "image/jpeg" }));
  }
  return files;
}
