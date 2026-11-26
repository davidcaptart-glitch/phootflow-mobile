// Cálculos de píxeles del retoque, sin lienzos (se prueban en Node con imágenes sintéticas): pincel suave,
// desenfoques rápidos, corrector (copiar y fundir el color resolviendo una membrana, como el «healing» de
// Photoshop), tampón y retoque de retrato (piel, ojos, dientes, ojeras).
import type { Mask } from "../render/renderer";
import type { Stroke } from "./layers";

/** RGBA 8 bits (compatible con ImageData). */
export interface Rgba { data: Uint8ClampedArray; width: number; height: number; }

/** Zona de la foto en píxeles (para trabajar solo en un trozo). */
export interface Region { x: number; y: number; w: number; h: number; }

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/**
 * Pincel: alfa 0..255 de los trazos en un lienzo `region` (por defecto la foto entera) de una foto W×H.
 * `hard` = parte del radio a opacidad plena (el resto se funde).
 */
export function rasterStrokes(strokes: Stroke[], W: number, H: number, region: Region = { x: 0, y: 0, w: W, h: H }, hard = 0.6): Uint8Array {
  const out = new Uint8Array(region.w * region.h);
  const L = Math.max(W, H);
  for (const s of strokes) {
    const r = Math.max(0.5, s.r * L), rIn = r * hard;
    const n = s.pts.length / 2;
    for (let k = 0; k < Math.max(1, n - 1); k++) {
      const ax = s.pts[k * 2] * W, ay = s.pts[k * 2 + 1] * H;
      const bx = n > 1 ? s.pts[k * 2 + 2] * W : ax, by = n > 1 ? s.pts[k * 2 + 3] * H : ay;
      const x0 = Math.max(region.x, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(region.x + region.w - 1, Math.ceil(Math.max(ax, bx) + r));
      const y0 = Math.max(region.y, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(region.y + region.h - 1, Math.ceil(Math.max(ay, by) + r));
      const vx = bx - ax, vy = by - ay, vv = vx * vx + vy * vy || 1;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5 - ax, py = y + 0.5 - ay;
          const t = clamp((px * vx + py * vy) / vv, 0, 1);
          const d = Math.hypot(px - t * vx, py - t * vy);
          if (d >= r) continue;
          const a = d <= rIn ? 255 : Math.round(255 * (1 - (d - rIn) / (r - rIn)));
          const i = (y - region.y) * region.w + (x - region.x);
          if (a > out[i]) out[i] = a;
        }
      }
    }
  }
  return out;
}

/** Desenfoque de caja separable sobre un canal en coma flotante (3 pasadas ≈ gaussiano). */
export function blurChannel(src: Float32Array, w: number, h: number, r: number, passes = 3): Float32Array {
  r = Math.max(0, Math.round(r));
  if (!r) return src.slice();
  let a = src.slice(), b = new Float32Array(src.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) boxLine(a, b, y * w, 1, w, r);
    for (let x = 0; x < w; x++) boxLine(b, a, x, w, h, r);
  }
  return a;
}

function boxLine(src: Float32Array, dst: Float32Array, start: number, step: number, n: number, r: number) {
  const inv = 1 / (2 * r + 1);
  const at = (i: number) => src[start + clamp(i, 0, n - 1) * step];
  let acc = 0;
  for (let i = -r; i <= r; i++) acc += at(i);
  for (let i = 0; i < n; i++) {
    dst[start + i * step] = acc * inv;
    acc += at(i + r + 1) - at(i - r);
  }
}

/** Separa RGBA en tres canales flotantes. */
export function channels(img: Rgba): [Float32Array, Float32Array, Float32Array] {
  const n = img.width * img.height, c = [new Float32Array(n), new Float32Array(n), new Float32Array(n)] as [Float32Array, Float32Array, Float32Array];
  for (let i = 0; i < n; i++) { c[0][i] = img.data[i * 4]; c[1][i] = img.data[i * 4 + 1]; c[2][i] = img.data[i * 4 + 2]; }
  return c;
}

/** Máscara (1 canal, o el canal `ch` de una RGBA) remuestreada con interpolación a w×h, o a una región de w×h. */
export function upsampleMask(m: Mask, W: number, H: number, ch = 0, region: Region = { x: 0, y: 0, w: W, h: H }): Uint8Array {
  const C = m.channels ?? 1, out = new Uint8Array(region.w * region.h);
  const sx = m.width / W, sy = m.height / H;
  for (let y = 0; y < region.h; y++) {
    const fy = clamp((y + region.y + 0.5) * sy - 0.5, 0, m.height - 1), y0 = Math.floor(fy), y1 = Math.min(m.height - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < region.w; x++) {
      const fx = clamp((x + region.x + 0.5) * sx - 0.5, 0, m.width - 1), x0 = Math.floor(fx), x1 = Math.min(m.width - 1, x0 + 1), tx = fx - x0;
      const g = (xx: number, yy: number) => m.data[(yy * m.width + xx) * C + ch];
      out[y * region.w + x] = Math.round((g(x0, y0) * (1 - tx) + g(x1, y0) * tx) * (1 - ty) + (g(x0, y1) * (1 - tx) + g(x1, y1) * tx) * ty);
    }
  }
  return out;
}

/** Caja de los píxeles con alfa > 0 de una máscara w×h, o null. */
export function maskBounds(a: Uint8Array, w: number, h: number): Region | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (a[y * w + x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// ------------------------------------------------------------------ corrector y tampón

/**
 * Corrector puntual: busca alrededor del hueco (8 direcciones, 2 distancias) el sitio que mejor encaja con el
 * borde del hueco. Devuelve el desplazamiento en px (origen = destino + d).
 */
export function findHealSource(img: Rgba, mask: Uint8Array): { dx: number; dy: number } {
  const { width: w, height: h, data } = img;
  const b = maskBounds(mask, w, h);
  if (!b) return { dx: 0, dy: 0 };
  // anillo: píxeles fuera del hueco, a poca distancia de él (se toman de la caja agrandada)
  const pad = Math.max(2, Math.round(Math.max(b.w, b.h) * 0.25));
  const ring: number[] = [];
  const stepS = Math.max(1, Math.round(Math.max(b.w, b.h) / 40));
  for (let y = Math.max(0, b.y - pad); y < Math.min(h, b.y + b.h + pad); y += stepS) {
    for (let x = Math.max(0, b.x - pad); x < Math.min(w, b.x + b.w + pad); x += stepS) {
      if (!mask[y * w + x]) ring.push(x, y);
    }
  }
  let best = { dx: 0, dy: 0 }, bestCost = Infinity;
  for (const dist of [1.15, 1.7]) {
    const D = Math.max(b.w, b.h) * dist + pad;
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      const dx = Math.round(Math.cos(ang) * D), dy = Math.round(Math.sin(ang) * D);
      if (b.x + dx - pad < 0 || b.y + dy - pad < 0 || b.x + b.w + dx + pad > w || b.y + b.h + dy + pad > h) continue;
      let cost = 0, n = 0;
      for (let i = 0; i < ring.length; i += 2) {
        const x = ring[i], y = ring[i + 1], sx = x + dx, sy = y + dy;
        if (mask[sy * w + sx]) { cost += 3 * 255 * 255; n++; continue; } // el origen no puede caer en el hueco
        const p = (y * w + x) * 4, q = (sy * w + sx) * 4;
        cost += (data[p] - data[q]) ** 2 + (data[p + 1] - data[q + 1]) ** 2 + (data[p + 2] - data[q + 2]) ** 2;
        n++;
      }
      // el interior del origen también debe parecerse al entorno (que no copie otra mancha)
      const c = n ? cost / n : Infinity;
      if (c < bestCost) { bestCost = c; best = { dx, dy }; }
    }
  }
  if (!isFinite(bestCost)) {
    // foto pequeña o hueco en una esquina: el lado con más sitio
    const dx = b.x > w - b.x - b.w ? -(b.w + pad) : b.w + pad;
    best = { dx: clamp(dx, -b.x, w - b.x - b.w), dy: 0 };
  }
  return best;
}

/**
 * Copia en el hueco (`mask`, alfa 0..255, mismo tamaño que `img`) lo que hay en destino + (dx, dy).
 * `heal` = además funde el color y la luz con el borde (membrana de Laplace a baja resolución sobre la
 * diferencia destino − origen), así no se nota el parche. Devuelve una copia.
 */
export function cloneHeal(img: Rgba, mask: Uint8Array, dx: number, dy: number, heal: boolean): Rgba {
  const { width: w, height: h } = img, src = img.data;
  const out = new Uint8ClampedArray(src);
  const b0 = maskBounds(mask, w, h);
  if (!b0) return { data: out, width: w, height: h };
  const m = 2;
  const b = { x: Math.max(0, b0.x - m), y: Math.max(0, b0.y - m), w: 0, h: 0 };
  b.w = Math.min(w, b0.x + b0.w + m) - b.x; b.h = Math.min(h, b0.y + b0.h + m) - b.y;
  const S = (x: number, y: number, c: number) => src[(clamp(y + dy, 0, h - 1) * w + clamp(x + dx, 0, w - 1)) * 4 + c];

  let corr: Float32Array[] | null = null;
  let cw = 0, ch = 0, scale = 1;
  if (heal) {
    // diferencia en la rejilla gruesa; dentro del hueco, la incógnita
    scale = Math.min(1, 56 / Math.max(b.w, b.h));
    cw = Math.max(3, Math.ceil(b.w * scale)); ch = Math.max(3, Math.ceil(b.h * scale));
    const sum = [new Float32Array(cw * ch), new Float32Array(cw * ch), new Float32Array(cw * ch)];
    const cnt = new Float32Array(cw * ch), unk = new Uint8Array(cw * ch);
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      const X = b.x + x, Y = b.y + y, ci = Math.min(ch - 1, Math.floor(y * scale)) * cw + Math.min(cw - 1, Math.floor(x * scale));
      if (mask[Y * w + X]) { unk[ci] = 1; continue; }
      const p = (Y * w + X) * 4;
      for (let c = 0; c < 3; c++) sum[c][ci] += src[p + c] - S(X, Y, c);
      cnt[ci]++;
    }
    // bordes del rectángulo: siempre conocidos (si una celda no tiene muestras, se rellena por difusión)
    const known = new Uint8Array(cw * ch);
    for (let i = 0; i < cw * ch; i++) if (!unk[i] && cnt[i]) { known[i] = 1; for (let c = 0; c < 3; c++) sum[c][i] /= cnt[i]; }
    let mean = [0, 0, 0], nk = 0;
    for (let i = 0; i < cw * ch; i++) if (known[i]) { nk++; for (let c = 0; c < 3; c++) mean[c] += sum[c][i]; }
    mean = mean.map((v) => (nk ? v / nk : 0));
    for (let i = 0; i < cw * ch; i++) if (!known[i]) for (let c = 0; c < 3; c++) sum[c][i] = mean[c];
    // Gauss-Seidel con sobrerrelajación
    const iters = 40 + 4 * Math.max(cw, ch);
    for (let it = 0; it < iters; it++) {
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const i = y * cw + x;
        if (known[i]) continue;
        for (let c = 0; c < 3; c++) {
          const f = sum[c];
          let s = 0, n = 0;
          if (x > 0) { s += f[i - 1]; n++; } if (x < cw - 1) { s += f[i + 1]; n++; }
          if (y > 0) { s += f[i - cw]; n++; } if (y < ch - 1) { s += f[i + cw]; n++; }
          f[i] += 1.7 * (s / n - f[i]);
        }
      }
    }
    corr = sum;
  }

  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const X = b.x + x, Y = b.y + y, a = mask[Y * w + X] / 255;
    if (!a) continue;
    const p = (Y * w + X) * 4;
    let fx = 0, fy = 0, x0 = 0, y0 = 0, x1 = 0, y1 = 0;
    if (corr) {
      fx = clamp((x + 0.5) * scale - 0.5, 0, cw - 1); fy = clamp((y + 0.5) * scale - 0.5, 0, ch - 1);
      x0 = Math.floor(fx); y0 = Math.floor(fy); x1 = Math.min(cw - 1, x0 + 1); y1 = Math.min(ch - 1, y0 + 1);
      fx -= x0; fy -= y0;
    }
    for (let c = 0; c < 3; c++) {
      let v = S(X, Y, c);
      if (corr) {
        const f = corr[c];
        v += (f[y0 * cw + x0] * (1 - fx) + f[y0 * cw + x1] * fx) * (1 - fy) + (f[y1 * cw + x0] * (1 - fx) + f[y1 * cw + x1] * fx) * fy;
      }
      out[p + c] = src[p + c] + (v - src[p + c]) * a;
    }
    // la opacidad se copia tal cual (por si debajo hay zonas transparentes, p. ej. el fondo quitado)
    out[p + 3] = src[p + 3] + (S(X, Y, 3) - src[p + 3]) * a;
  }
  return { data: out, width: w, height: h };
}

// ------------------------------------------------------------------ retrato

export interface PortraitAmounts { skin: number; eyes: number; teeth: number; circles: number; }
export interface PortraitMasks {
  /** R = blanco de los ojos, G = iris, B = boca por dentro, A = ojeras (a cualquier tamaño). */
  face: Mask | null;
  /** Piel (cara y cuerpo), 1 canal. */
  skin: Mask | null;
}

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Retoque de retrato sobre una copia de `img`. Las cantidades van de 0 a 100. */
export function portraitRetouch(img: Rgba, masks: PortraitMasks, amt: PortraitAmounts): Rgba {
  const { width: w, height: h } = img;
  const n = w * h, src = img.data, out = new Uint8ClampedArray(src);
  const face = masks.face;
  const eyes = face && amt.eyes > 0 ? upsampleMask(face, w, h, 0) : null;
  const iris = face && amt.eyes > 0 ? upsampleMask(face, w, h, 1) : null;
  const mouth = face ? upsampleMask(face, w, h, 2) : null;
  const under = face && amt.circles > 0 ? upsampleMask(face, w, h, 3) : null;

  // piel: suavizado que respeta los bordes (los poros y las arrugas se van; los contornos de la cara, no)
  if (masks.skin && amt.skin > 0) {
    const skin = upsampleMask(masks.skin, w, h, 0);
    const k = (amt.skin / 100) * 0.92;
    const r = Math.max(2, Math.round(Math.max(w, h) * 0.006));
    const [R, G, B] = channels(img);
    const bl = [blurChannel(R, w, h, r), blurChannel(G, w, h, r), blurChannel(B, w, h, r)];
    for (let i = 0; i < n; i++) {
      let a = skin[i] / 255;
      if (!a) continue;
      if (eyes) a *= 1 - eyes[i] / 255;
      if (iris) a *= 1 - iris[i] / 255;
      if (mouth) a *= 1 - mouth[i] / 255;
      const d = Math.abs(luma(R[i], G[i], B[i]) - luma(bl[0][i], bl[1][i], bl[2][i]));
      const edge = clamp(1 - (d - 6) / 34, 0, 1);
      const t = a * k * edge;
      if (t <= 0) continue;
      for (let c = 0; c < 3; c++) out[i * 4 + c] = src[i * 4 + c] + (bl[c][i] - src[i * 4 + c]) * t;
    }
  }

  const adjust = (m: Uint8Array | null, k: number, light: number, sat: number, warmCut = 0) => {
    if (!m || k <= 0) return;
    for (let i = 0; i < n; i++) {
      const a = (m[i] / 255) * k;
      if (a <= 0.002) continue;
      const p = i * 4;
      let r = out[p], g = out[p + 1], b = out[p + 2];
      const y = luma(r, g, b);
      // saturación respecto a la luminancia
      const s = 1 + (sat - 1) * a;
      r = y + (r - y) * s; g = y + (g - y) * s; b = y + (b - y) * s;
      // amarillo fuera (dientes): se baja el exceso de rojo+verde sobre el azul
      if (warmCut) { const yel = Math.max(0, (r + g) / 2 - b); r -= yel * warmCut * a * 0.5; g -= yel * warmCut * a * 0.5; b += yel * warmCut * a * 0.3; }
      // luz: hacia el blanco sin quemar
      const L = light * a;
      r += (255 - r) * L; g += (255 - g) * L; b += (255 - b) * L;
      out[p] = r; out[p + 1] = g; out[p + 2] = b;
    }
  };
  const e = amt.eyes / 100, t = amt.teeth / 100, c = amt.circles / 100;
  adjust(eyes, e, 0.22, 0.55);          // blanco de los ojos: más claro y sin rojeces
  adjust(iris, e, 0.08, 1.45);          // iris: más vivo
  adjust(mouth, t, 0.2, 0.45, 0.9);     // dientes: más blancos, sin amarillo
  if (under && c > 0) {
    // ojeras: se iguala la luz con la del pómulo (desenfoque grande) y se quita el violeta
    const [R, G, B] = channels({ data: out, width: w, height: h });
    const r = Math.max(3, Math.round(Math.max(w, h) * 0.012));
    const Y = new Float32Array(n);
    for (let i = 0; i < n; i++) Y[i] = luma(R[i], G[i], B[i]);
    const Yb = blurChannel(Y, w, h, r);
    for (let i = 0; i < n; i++) {
      const a = (under[i] / 255) * c;
      if (a <= 0.002) continue;
      const lift = Math.max(0, Yb[i] * 1.06 - Y[i]) * a;
      const p = i * 4;
      const y = Y[i], s = 1 - 0.3 * a;
      out[p] = y + (R[i] - y) * s + lift; out[p + 1] = y + (G[i] - y) * s + lift; out[p + 2] = y + (B[i] - y) * s + lift;
    }
  }
  return { data: out, width: w, height: h };
}

/** Máscara de la persona a w×h con el borde suavizado (`feather` 0..100), 0..255. */
export function personAlpha(person: Mask, w: number, h: number, feather: number): Uint8Array {
  const up = upsampleMask(person, w, h, 0);
  // contraer un poco el borde y suavizar: la segmentación sale a 256 px, así no queda halo del fondo viejo
  const r = Math.round(Math.max(w, h) * (0.0015 + (feather / 100) * 0.006));
  const f = new Float32Array(up.length);
  for (let i = 0; i < up.length; i++) f[i] = up[i];
  const b = blurChannel(f, w, h, r, 2);
  const out = new Uint8Array(up.length);
  for (let i = 0; i < up.length; i++) out[i] = clamp(Math.round((b[i] - 40) * (255 / 175)), 0, 255);
  return out;
}
