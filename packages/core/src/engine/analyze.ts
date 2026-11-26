// Medidas de cada foto a baja resolución (≈256 px). Puro: recibe los píxeles RGBA, sin DOM.
// Misma idea que estimate_ev / _face_ev de engine.py en escritorio: el centro y las caras pesan más.
import type { Box, PhotoStats } from "./types";

const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function measure(
  rgba: Uint8ClampedArray | Uint8Array, width: number, height: number,
  faces: Box[] = [], people: Box | null = null,
): PhotoStats {
  const hist = new Float64Array(1024);
  let sumW = 0, sumL = 0, nN = 0, sRG = 0, sBG = 0;
  for (let y = 0; y < height; y++) {
    const ny = (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const nx = (x + 0.5) / width;
      const i = (y * width + x) * 4;
      const r = LIN[rgba[i]], g = LIN[rgba[i + 1]], b = LIN[rgba[i + 2]];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      // peso: centro suave + caras ×4
      const dx = nx - 0.5, dy = ny - 0.45;
      let w = Math.exp(-(dx * dx + dy * dy) / 0.18);
      for (const f of faces) {
        if (nx >= f.x && nx <= f.x + f.w && ny >= f.y && ny <= f.y + f.h) { w += 4; break; }
      }
      sumW += w;
      sumL += w * Math.log2(l + 1e-4);
      hist[Math.min(1023, Math.floor(l * 1023))] += 1;
      // gris mundial solo con zonas casi neutras y de luz media
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (l > 0.03 && l < 0.85 && mx - mn < 0.6 * mx && g > 1e-3) {
        sRG += Math.log2((r + 1e-4) / (g + 1e-4));
        sBG += Math.log2((b + 1e-4) / (g + 1e-4));
        nN++;
      }
    }
  }
  const total = width * height;
  const pct = (p: number) => {
    let acc = 0;
    for (let k = 0; k < 1024; k++) { acc += hist[k]; if (acc >= p * total) return k / 1023; }
    return 1;
  };
  return {
    width, height,
    logMid: sumW ? sumL / sumW : Math.log2(0.18),
    p2: pct(0.02), p98: pct(0.98),
    castRG: nN > total * 0.02 ? sRG / nN : 0,
    castBG: nN > total * 0.02 ? sBG / nN : 0,
    faces, people,
  };
}

/** Diferencia perceptual simple entre dos fotos (hash de 64 bits de la luminancia), para avisar de repetidas. */
export function dhash(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): bigint {
  let h = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const v = (xx: number) => {
        const px = Math.min(width - 1, Math.floor((xx / 9) * width));
        const py = Math.min(height - 1, Math.floor(((y + 0.5) / 8) * height));
        const i = (py * width + px) * 4;
        return rgba[i] * 0.3 + rgba[i + 1] * 0.59 + rgba[i + 2] * 0.11;
      };
      h = (h << 1n) | (v(x) > v(x + 1) ? 1n : 0n);
    }
  }
  return h;
}

/** Bits distintos entre dos dhash (0 = idénticas; ≤ DUP_BITS = la misma foto o casi). */
export function hamming(a: bigint, b: bigint): number {
  let x = a ^ b, n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

/** Nitidez: energía media del laplaciano de la luminancia (≈ 512 px). Una foto movida o desenfocada da mucho menos
 *  que las demás de la misma sesión; el valor solo sirve para comparar fotos medidas al mismo tamaño. */
export function sharpness(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): number {
  const L = new Float32Array(width * height);
  for (let i = 0; i < L.length; i++) L[i] = rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114;
  let s = 0, n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v = 4 * L[i] - L[i - 1] - L[i + 1] - L[i - width] - L[i + width];
      s += v * v; n++;
    }
  }
  return n ? s / n : 0;
}

/** Diferencia máxima de dhash para tomarlas por repetidas (ráfagas, la misma foto dos veces). */
export const DUP_BITS = 6;
/** Movida si su nitidez no llega a esta fracción de la de las fotos nítidas de la sesión. */
export const BLUR_RATIO = 0.35;

export interface Review {
  /** Grupos de fotos repetidas (ids), la más nítida primero. */
  duplicates: string[][];
  /** Fotos movidas o desenfocadas. */
  blurry: string[];
  /** Lo que se sugiere quitar: las movidas y, de cada grupo de repetidas, todas menos la más nítida. */
  suggest: string[];
}

/** Revisa las fotos antes de editar: repetidas (dhash parecido) y movidas (mucho menos nítidas que el resto). */
export function reviewPhotos(items: { id: string; hash: bigint; sharp: number }[]): Review {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++)
      if (hamming(items[i].hash, items[j].hash) <= DUP_BITS) parent[find(j)] = find(i);
  const groups = new Map<number, typeof items>();
  items.forEach((it, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), it]));
  const duplicates = [...groups.values()].filter((g) => g.length > 1)
    .map((g) => g.slice().sort((a, b) => b.sharp - a.sharp).map((x) => x.id));
  // referencia: el percentil 75 de nitidez (las buenas de la sesión)
  const sorted = items.map((x) => x.sharp).sort((a, b) => a - b);
  const ref = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))] : 0;
  const blurry = items.length >= 2 ? items.filter((x) => x.sharp < ref * BLUR_RATIO).map((x) => x.id) : [];
  const suggest = [...new Set([...blurry, ...duplicates.flatMap((g) => g.slice(1))])];
  // nunca se sugiere quitarlas todas
  return { duplicates, blurry, suggest: suggest.length >= items.length ? suggest.slice(0, items.length - 1) : suggest };
}
