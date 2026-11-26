// Revelado de PhootFlow Pro (tipo Lightroom): ajustes no destructivos de UNA foto. Sin DOM.
// Todo en las unidades que se ven en los reguladores (−100..100 salvo donde se indica).
import { autoDevelop } from "../engine/congruence";
import type { Box, PhotoStats } from "../engine/types";

/** Punto de curva (entrada, salida), 0..1. */
export type CurvePoint = [number, number];

export interface Curves { master: CurvePoint[]; r: CurvePoint[]; g: CurvePoint[]; b: CurvePoint[]; }

/** Ocho colores de la mezcla (como en Lightroom). */
export const BANDS = ["Rojo", "Naranja", "Amarillo", "Verde", "Aguamarina", "Azul", "Morado", "Magenta"] as const;
/** Tono central de cada color (grados). */
export const BAND_HUES = [0, 30, 60, 120, 180, 225, 270, 315];
/** Color para pintar cada muestra. */
export const BAND_CSS = ["#e5413b", "#f08a2c", "#e8cf30", "#45b04a", "#2bb7b0", "#3c74e0", "#8a4fe0", "#e04fb4"];

export interface Hsl { h: number; s: number; l: number; }
export interface Grade { hue: number; sat: number; lum: number; }

export interface Dev {
  // Perfil
  lut: string | null;
  lutAmount: number;            // 0..100
  bw: boolean;
  bwMix: number[];              // 8 colores, −100..100 (cuánto aclara u oscurece cada color en B/N)
  // Luz
  exposure: number;             // EV −5..5
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  // Color
  temp: number;                 // −100..100 (frío ↔ cálido), sobre el balance de la toma
  tint: number;                 // −100..100 (verde ↔ magenta)
  wbR: number;                  // ganancias de partida (automático o cuentagotas)
  wbB: number;
  vibrance: number;
  saturation: number;
  // Presencia
  texture: number;
  clarity: number;
  dehaze: number;
  // Curva
  curves: Curves;
  // Mezcla de color
  hsl: Hsl[];                   // 8 colores
  // Gradación de color
  grade: { shadows: Grade; mid: Grade; highlights: Grade; global: Grade; blending: number; balance: number };
  // Detalle
  sharpen: number;              // 0..150
  sharpenMask: number;          // 0..100 (solo bordes)
  noise: number;                // 0..100 (luminancia)
  colorNoise: number;           // 0..100
  // Efectos
  vignette: number;             // −100..100
  vignetteMid: number;          // 0..100
  grain: number;                // 0..100
  grainSize: number;            // 0..100
  // Geometría
  crop: Box;                    // normalizado sobre la foto girada
  aspect: string;               // "libre" | "original" | "1:1" | "4:5"…
  angle: number;                // grados (−45..45)
  flipH: boolean;
  rotate: 0 | 90 | 180 | 270;
}

const LINE: CurvePoint[] = [[0, 0], [1, 1]];
const NO_GRADE: Grade = { hue: 0, sat: 0, lum: 0 };

export const DEFAULT_DEV: Dev = {
  lut: null, lutAmount: 100, bw: false, bwMix: [0, 0, 0, 0, 0, 0, 0, 0],
  exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
  temp: 0, tint: 0, wbR: 1, wbB: 1, vibrance: 0, saturation: 0,
  texture: 0, clarity: 0, dehaze: 0,
  curves: { master: LINE, r: LINE, g: LINE, b: LINE },
  hsl: BANDS.map(() => ({ h: 0, s: 0, l: 0 })),
  grade: { shadows: NO_GRADE, mid: NO_GRADE, highlights: NO_GRADE, global: NO_GRADE, blending: 50, balance: 0 },
  sharpen: 25, sharpenMask: 0, noise: 0, colorNoise: 25,
  vignette: 0, vignetteMid: 50, grain: 0, grainSize: 25,
  crop: { x: 0, y: 0, w: 1, h: 1 }, aspect: "original", angle: 0, flipH: false, rotate: 0,
};

/** Copia profunda (los ajustes se guardan en el historial: nunca se comparten referencias). */
export function cloneDev(d: Dev): Dev {
  return JSON.parse(JSON.stringify(d));
}

/** Rellena lo que falte (ajustes guardados con una versión anterior). */
export function normalizeDev(d: Partial<Dev> | null | undefined): Dev {
  const base = cloneDev(DEFAULT_DEV);
  if (!d) return base;
  const out = { ...base, ...cloneDev(d as Dev) };
  out.curves = { ...base.curves, ...(d.curves ?? {}) };
  out.grade = { ...base.grade, ...(d.grade ?? {}) };
  if (!Array.isArray(out.hsl) || out.hsl.length !== 8) out.hsl = base.hsl;
  if (!Array.isArray(out.bwMix) || out.bwMix.length !== 8) out.bwMix = base.bwMix;
  return out;
}

/** «Auto»: exposición, contraste, luces, sombras y balance de blancos a partir de las medidas de la foto. */
export function autoDev(s: PhotoStats, d: Dev = DEFAULT_DEV): Dev {
  const a = autoDevelop(s);
  const spread = Math.log2((s.p98 + 1e-3) / (s.p2 + 1e-3));
  return {
    ...cloneDev(d),
    exposure: round(a.exposure, 2),
    contrast: Math.round(a.contrast),
    highlights: Math.round(a.highlights),
    shadows: Math.round(a.shadows),
    whites: Math.round(Math.max(-30, Math.min(30, (0.92 - s.p98 * 2 ** a.exposure) * 60))),
    blacks: Math.round(Math.max(-25, Math.min(15, (spread - 6.5) * -3))),
    temp: 0, tint: 0, wbR: a.wbR, wbB: a.wbB,
    vibrance: Math.max(d.vibrance, 12),
  };
}

const round = (v: number, n: number) => Math.round(v * 10 ** n) / 10 ** n;

// ------------------------------------------------------------------ curvas
/** Curva monótona (Fritsch–Carlson) por los puntos dados, muestreada en `n` valores 0..1. */
export function sampleCurve(points: CurvePoint[], n = 256): Float32Array {
  const p = [...points].sort((a, b) => a[0] - b[0]).filter((q, i, a) => i === 0 || q[0] > a[i - 1][0] + 1e-4);
  if (p.length === 0) p.push([0, 0], [1, 1]);
  if (p.length === 1) p.push([1, 1]);
  const k = p.length;
  const dx: number[] = [], m: number[] = [];
  for (let i = 0; i < k - 1; i++) { dx.push(p[i + 1][0] - p[i][0]); m.push((p[i + 1][1] - p[i][1]) / dx[i]); }
  const t: number[] = new Array(k);
  t[0] = m[0]; t[k - 1] = m[k - 2];
  for (let i = 1; i < k - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < k - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
    if (h > 9) { const s = 3 / Math.sqrt(h); t[i] = s * a * m[i]; t[i + 1] = s * b * m[i]; }
  }
  const out = new Float32Array(n);
  let seg = 0;
  for (let j = 0; j < n; j++) {
    const x = j / (n - 1);
    let y: number;
    if (x <= p[0][0]) y = p[0][1];
    else if (x >= p[k - 1][0]) y = p[k - 1][1];
    else {
      while (seg < k - 2 && x > p[seg + 1][0]) seg++;
      const h = dx[seg], u = (x - p[seg][0]) / h;
      const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
      y = h00 * p[seg][1] + h10 * h * t[seg] + h01 * p[seg + 1][1] + h11 * h * t[seg + 1];
    }
    out[j] = Math.max(0, Math.min(1, y));
  }
  return out;
}

/** Textura 256×1 RGBA: R, G, B = curvas de cada canal, A = curva general. */
export function curveTable(c: Curves): Uint8Array {
  const [m, r, g, b] = [c.master, c.r, c.g, c.b].map((q) => sampleCurve(q));
  const out = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    out[i * 4] = Math.round(r[i] * 255);
    out[i * 4 + 1] = Math.round(g[i] * 255);
    out[i * 4 + 2] = Math.round(b[i] * 255);
    out[i * 4 + 3] = Math.round(m[i] * 255);
  }
  return out;
}

export const isLine = (p: CurvePoint[]) => p.length === 2 && p[0][0] === 0 && p[0][1] === 0 && p[1][0] === 1 && p[1][1] === 1;

// ------------------------------------------------------------------ geometría
export const ASPECTS: [string, string, number | null][] = [
  ["libre", "Libre", null], ["original", "Original", null], ["1:1", "1:1", 1], ["4:5", "4:5", 4 / 5],
  ["5:4", "5:4", 5 / 4], ["2:3", "2:3", 2 / 3], ["3:2", "3:2", 3 / 2], ["9:16", "9:16", 9 / 16], ["16:9", "16:9", 16 / 9],
];

/** Tamaño de la foto tras el giro de 90° (si lo hay). */
export function rotatedSize(w: number, h: number, rotate: number) {
  return rotate % 180 ? { w: h, h: w } : { w, h };
}

/** Recorte centrado más grande con la proporción `ratio` (ancho/alto en px) dentro de una imagen w×h. */
export function fitAspect(ratio: number, w: number, h: number, around: Box = { x: 0, y: 0, w: 1, h: 1 }): Box {
  const imgR = w / h;
  let cw = 1, ch = imgR / ratio;
  if (ch > 1) { ch = 1; cw = ratio / imgR; }
  const cx = around.x + around.w / 2, cy = around.y + around.h / 2;
  const x = Math.max(0, Math.min(1 - cw, cx - cw / 2)), y = Math.max(0, Math.min(1 - ch, cy - ch / 2));
  return { x, y, w: cw, h: ch };
}

/** Tamaño en px del resultado para una foto w×h (lado largo como mucho `maxSide`). */
export function outputSize(d: Dev, w: number, h: number, maxSide = Infinity) {
  const r = rotatedSize(w, h, d.rotate);
  const cw = r.w * d.crop.w, ch = r.h * d.crop.h;
  const s = Math.min(1, maxSide / Math.max(cw, ch));
  return { width: Math.max(1, Math.round(cw * s)), height: Math.max(1, Math.round(ch * s)) };
}

// ------------------------------------------------------------------ copiar / pegar y presets
export const GROUPS: { id: string; name: string; keys: (keyof Dev)[] }[] = [
  { id: "profile", name: "Perfil y B/N", keys: ["lut", "lutAmount", "bw", "bwMix"] },
  { id: "light", name: "Luz", keys: ["exposure", "contrast", "highlights", "shadows", "whites", "blacks"] },
  { id: "wb", name: "Balance de blancos", keys: ["temp", "tint", "wbR", "wbB"] },
  { id: "color", name: "Color y presencia", keys: ["vibrance", "saturation", "texture", "clarity", "dehaze"] },
  { id: "curves", name: "Curva", keys: ["curves"] },
  { id: "hsl", name: "Mezcla de color", keys: ["hsl"] },
  { id: "grade", name: "Gradación de color", keys: ["grade"] },
  { id: "detail", name: "Detalle", keys: ["sharpen", "sharpenMask", "noise", "colorNoise"] },
  { id: "effects", name: "Efectos", keys: ["vignette", "vignetteMid", "grain", "grainSize"] },
  { id: "geometry", name: "Recorte y giro", keys: ["crop", "aspect", "angle", "flipH", "rotate"] },
];

/** Copia a `to` los grupos elegidos de `from`. */
export function pasteDev(to: Dev, from: Dev, groups: string[]): Dev {
  const out = cloneDev(to);
  for (const g of GROUPS) if (groups.includes(g.id)) for (const k of g.keys) (out as unknown as Record<string, unknown>)[k] = JSON.parse(JSON.stringify(from[k]));
  return out;
}

/** Grupos que cambian respecto a los ajustes por defecto (para el «pegar» y para describir un preset). */
export function changedGroups(d: Dev): string[] {
  return GROUPS.filter((g) => g.keys.some((k) => JSON.stringify(d[k]) !== JSON.stringify(DEFAULT_DEV[k]))).map((g) => g.id);
}

export interface ProPreset { id: string; name: string; group: string; dev: Partial<Dev>; builtin?: boolean; }

const S = (pts: CurvePoint[]): Curves => ({ master: pts, r: LINE, g: LINE, b: LINE });

/** Presets incluidos: solo tocan color y tono (no la exposición ni el recorte de cada foto). */
export const BUILTIN_PRESETS: ProPreset[] = [
  { id: "p-natural", name: "Natural", group: "Esenciales", builtin: true, dev: { vibrance: 18, clarity: 8, curves: S([[0, 0], [0.25, 0.23], [0.75, 0.78], [1, 1]]) } },
  { id: "p-vivo", name: "Vivo", group: "Esenciales", builtin: true, dev: { vibrance: 35, saturation: 8, contrast: 18, clarity: 12, dehaze: 6 } },
  { id: "p-suave", name: "Suave y luminoso", group: "Esenciales", builtin: true, dev: { contrast: -18, highlights: -25, shadows: 30, whites: 10, clarity: -10, vibrance: 10, curves: S([[0, 0.05], [0.5, 0.53], [1, 0.97]]) } },
  { id: "p-mate", name: "Mate", group: "Película", builtin: true, dev: { contrast: -10, curves: S([[0, 0.1], [0.3, 0.3], [0.75, 0.76], [1, 0.95]]), saturation: -10, grain: 18 } },
  { id: "p-calido", name: "Cálido de boda", group: "Película", builtin: true, dev: { temp: 14, tint: 4, vibrance: 12, highlights: -20, grade: { shadows: { hue: 30, sat: 12, lum: 0 }, mid: { hue: 35, sat: 6, lum: 0 }, highlights: { hue: 45, sat: 10, lum: 0 }, global: NO_GRADE, blending: 50, balance: 0 } } },
  { id: "p-teal", name: "Cine verde-naranja", group: "Película", builtin: true, dev: { contrast: 15, grade: { shadows: { hue: 190, sat: 28, lum: -4 }, mid: NO_GRADE, highlights: { hue: 35, sat: 24, lum: 0 }, global: NO_GRADE, blending: 60, balance: 0 }, hsl: BANDS.map((_, i) => ({ h: 0, s: i === 3 ? -40 : i === 5 ? 15 : 0, l: 0 })) } },
  { id: "p-deporte", name: "Deporte", group: "Eventos", builtin: true, dev: { contrast: 25, clarity: 22, texture: 15, dehaze: 10, vibrance: 20, sharpen: 55 } },
  { id: "p-noche", name: "Fiesta de noche", group: "Eventos", builtin: true, dev: { shadows: 25, blacks: -10, noise: 30, colorNoise: 50, vibrance: 15, clarity: 10 } },
  { id: "p-bn", name: "B/N clásico", group: "Blanco y negro", builtin: true, dev: { bw: true, contrast: 20, clarity: 12, bwMix: [10, 15, 10, -10, -15, -25, -10, 5] } },
  { id: "p-bn-suave", name: "B/N suave", group: "Blanco y negro", builtin: true, dev: { bw: true, contrast: -12, highlights: -20, shadows: 20, grain: 22, curves: S([[0, 0.06], [1, 0.96]]) } },
];

/** Aplica un preset: lo que trae sustituye; lo demás (exposición, recorte…) se queda. */
export function applyPreset(d: Dev, p: ProPreset): Dev {
  return { ...cloneDev(d), ...cloneDev(p.dev as Dev) };
}
