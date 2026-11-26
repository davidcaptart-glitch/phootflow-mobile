// Máscaras de Pro (ajustes locales), iguales que las de Studio en escritorio (masks.py): mismos tipos, mismas
// zonas que suman, restan o intersecan, mismos ajustes. Sin DOM: los alfas se calculan sobre píxeles en memoria
// (la foto reducida a ≤ 1024 px y, para la IA, las clases de la segmentación y los puntos de las caras).
//
// Tipos (params en coordenadas de la foto ORIGINAL, 0..1, sin girar ni recortar):
// - radial  cx, cy, rx, ry, feather (0..100)
// - linear  x0, y0 (lleno) → x1, y1 (nada)
// - brush   strokes [[x, y, r, ±1]] (r relativo al lado largo; −1 = borrar), feather
// - luma    lo, hi (0..100 de luminosidad L*), feather
// - color   hue (0..360), range (grados), sat_min (0..100)
// - point   cx, cy, size (1..100 % del lado largo), sim (0..100): punto de control tipo U Point
// - IA      person, face, skin, hair, clothes, background (segmentación de MediaPipe)
// - cara    eyes, iris, brows, lips, teeth, beard (puntos de la cara de MediaPipe)
// - sky     cielo aproximado (sin IA)

export type ZoneMode = "add" | "sub" | "inter";

export interface MaskZone {
  name: string;
  type: string;
  params: Record<string, number | number[][]>;
  invert: boolean;
  mode?: ZoneMode;
  enabled?: boolean;
}

export interface LocalMask extends MaskZone {
  id: string;
  amount: number;            // 0..100
  invert_all?: boolean;
  enabled?: boolean;
  parts: MaskZone[];
  adj: Record<string, number>;
}

export const MANUAL_TYPES: Record<string, string> = {
  radial: "Radial", linear: "Lineal", brush: "Pincel", luma: "Rango de luz", color: "Rango de color", point: "Punto de control (U Point)",
};
export const AI_TYPES: Record<string, string> = {
  person: "Persona", face: "Piel de la cara", skin: "Piel (cara y cuerpo)", hair: "Pelo", clothes: "Ropa", background: "Fondo",
};
/** Partes de la cara con los índices de la malla de 478 puntos de MediaPipe (como FACE_PARTS de escritorio). */
export const FACE_PARTS: Record<string, [string, number[][]]> = {
  eyes: ["Ojos", [[33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
    [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]]],
  iris: ["Iris", [[469, 470, 471, 472], [474, 475, 476, 477]]],
  brows: ["Cejas", [[70, 63, 105, 66, 107, 55, 65, 52, 53, 46], [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]]],
  lips: ["Labios", [[61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]]],
  teeth: ["Dientes", [[78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]]],
};
export const FACE_EXTRA: Record<string, string> = { beard: "Barba" };
export const OTHER_TYPES: Record<string, string> = { sky: "Cielo (aprox.)" };
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
  176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const NOSE_LOW = [1, 4, 48, 64, 98, 97, 2, 326, 327, 294, 278];

export const TYPE_GROUPS: [string, Record<string, string>][] = [
  ["Manual", MANUAL_TYPES], ["Personas (IA)", AI_TYPES],
  ["Cara (IA)", { ...Object.fromEntries(Object.entries(FACE_PARTS).map(([k, v]) => [k, v[0]])), ...FACE_EXTRA }],
  ["Otros", OTHER_TYPES],
];
export const typeName = (t: string) =>
  MANUAL_TYPES[t] ?? AI_TYPES[t] ?? FACE_PARTS[t]?.[0] ?? FACE_EXTRA[t] ?? OTHER_TYPES[t] ?? t;
export const needsAI = (t: string) => t in AI_TYPES;
export const needsFaces = (t: string) => t in FACE_PARTS || t in FACE_EXTRA;

export const COMBINE: Record<ZoneMode, string> = { add: "Sumar", sub: "Restar", inter: "Intersecar" };

/** [clave, nombre, mín, máx, paso, neutro] — los ajustes de cada máscara, como en Studio. */
export type AdjDef = [string, string, number, number, number, number];
export const ADJ: AdjDef[] = [
  ["exposure", "Exposición", -3, 3, 0.05, 0], ["contrast", "Contraste", -100, 100, 1, 0],
  ["highlights", "Altas luces", -100, 100, 1, 0], ["shadows", "Sombras", -100, 100, 1, 0],
  ["temp", "Temperatura", -100, 100, 1, 0], ["tint", "Matiz", -100, 100, 1, 0],
  ["sharpness", "Nitidez", -100, 100, 1, 0],
];
export const PRESENCE: AdjDef[] = [
  ["texture", "Textura", -100, 100, 1, 0], ["clarity", "Claridad", -100, 100, 1, 0],
  ["dehaze", "Eliminar neblina", -100, 100, 1, 0], ["vibrance", "Intensidad", -100, 100, 1, 0],
  ["saturation", "Saturación", -100, 100, 1, 0],
];
export const CURVE: AdjDef[] = [
  ["curve_highlights", "Iluminaciones", -100, 100, 1, 0], ["curve_lights", "Claros", -100, 100, 1, 0],
  ["curve_darks", "Oscuros", -100, 100, 1, 0], ["curve_shadows", "Sombras", -100, 100, 1, 0],
];
export const HSL_BANDS: [string, string][] = [["red", "Rojo"], ["orange", "Naranja"], ["yellow", "Amarillo"], ["green", "Verde"],
  ["aqua", "Aguamarina"], ["blue", "Azul"], ["purple", "Púrpura"], ["magenta", "Magenta"]];
export const GRADE: AdjDef[] = [
  ["grade_sh_hue", "Sombras · tono", 0, 360, 1, 0], ["grade_sh_sat", "Sombras · saturación", 0, 100, 1, 0],
  ["grade_mid_hue", "Medios · tono", 0, 360, 1, 0], ["grade_mid_sat", "Medios · saturación", 0, 100, 1, 0],
  ["grade_hi_hue", "Luces · tono", 0, 360, 1, 0], ["grade_hi_sat", "Luces · saturación", 0, 100, 1, 0],
  ["grade_blend", "Fusión", 0, 100, 1, 50], ["grade_balance", "Equilibrio", -100, 100, 1, 0],
];
export const NEUTRAL_ADJ: Record<string, number> = { grade_blend: 50 };

/** Parámetros de cada tipo: [clave, nombre, mín, máx, paso, por defecto]. */
export const ZONE_PARAMS: Record<string, AdjDef[]> = {
  radial: [["feather", "Difuminado", 0, 100, 1, 60]],
  linear: [],
  brush: [["size", "Tamaño del pincel", 1, 30, 1, 6], ["feather", "Difuminado", 0, 100, 1, 50]],
  luma: [["lo", "Luz desde", 0, 100, 1, 60], ["hi", "Luz hasta", 0, 100, 1, 100], ["feather", "Difuminado", 0, 100, 1, 15]],
  color: [["hue", "Tono", 0, 360, 1, 25], ["range", "Amplitud", 5, 90, 1, 30], ["sat_min", "Saturación mínima", 0, 100, 1, 15]],
  point: [["size", "Alcance", 1, 100, 1, 25], ["sim", "Parecido de color", 0, 100, 1, 50]],
};

export const HINTS: Record<string, string> = {
  radial: "Arrastra el centro para moverla y los tiradores para cambiar su tamaño.",
  linear: "Arrastra las dos líneas: desde la primera (lleno) hasta la segunda (nada).",
  brush: "Pinta con el dedo sobre la foto. Activa «Borrar» para quitar.",
  luma: "Coge las zonas con esa luz (de oscuro a claro).",
  color: "Coge los colores parecidos al elegido. Usa el cuentagotas para tocarlo en la foto.",
  point: "Toca la foto para poner el punto: coge lo que está cerca y se parece en color.",
  sky: "Cielo aproximado: lo claro o azulado, liso, que toca el borde de arriba.",
};

const DEF_PARAMS: Record<string, Record<string, number | number[][]>> = {
  radial: { cx: 0.5, cy: 0.45, rx: 0.25, ry: 0.3, feather: 60 },
  linear: { x0: 0.5, y0: 0, x1: 0.5, y1: 0.45 },
  brush: { strokes: [], feather: 50, size: 6 },
  luma: { lo: 60, hi: 100, feather: 15 },
  color: { hue: 25, range: 30, sat_min: 15 },
  point: { cx: 0.5, cy: 0.5, size: 25, sim: 50 },
};

let seq = 0;
export function newMask(type: string): LocalMask {
  return {
    id: `m${Date.now().toString(36)}${(seq++).toString(36)}`,
    name: typeName(type), type, params: JSON.parse(JSON.stringify(DEF_PARAMS[type] ?? {})), invert: false,
    amount: 100, enabled: true, parts: [], adj: {},
  };
}

export function newPart(type: string, mode: ZoneMode = "add"): MaskZone {
  return { name: typeName(type), type, params: JSON.parse(JSON.stringify(DEF_PARAMS[type] ?? {})), invert: false, mode, enabled: true };
}

/** ¿La máscara cambia algo? (los tonos de la gradación y la fusión solos no hacen nada). */
export function adjActive(adj: Record<string, number>): boolean {
  return Object.entries(adj ?? {}).some(([k, v]) => !k.endsWith("_hue") && k !== "grade_blend" && k !== "grade_balance" && v !== (NEUTRAL_ADJ[k] ?? 0));
}

/** Clave de una zona (cambia si cambia lo que afecta a su alfa). */
export const zoneKey = (z: MaskZone) => JSON.stringify([z.type, z.params, z.invert]);
export const maskKey = (m: LocalMask) =>
  JSON.stringify([zoneKey(m), m.parts.filter((p) => p.enabled !== false).map((p) => [zoneKey(p), p.mode]), m.invert_all, m.amount]);

// ------------------------------------------------------------------ píxeles de trabajo

/** Todo lo que necesitan las zonas: la foto reducida y, si hacen falta, la IA. */
export interface MaskContext {
  w: number;
  h: number;
  /** sRGB 0..1, RGB entrelazado (w·h·3). */
  rgb: Float32Array;
  /** Clases de la segmentación a w×h: fondo, pelo, piel del cuerpo, piel de la cara, ropa, otros. */
  seg?: Float32Array[] | null;
  /** Puntos de cada cara (normalizados 0..1 sobre la foto). */
  faces?: { x: number; y: number }[][] | null;
  /** Cachés internas (L*, HSV, Lab…). */
  cache?: Record<string, Float32Array>;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number) => a * a * (3 - 2 * a);

function lin(c: number) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

/** L*, a*, b* (D65) de la foto de trabajo. */
function lab(ctx: MaskContext): Float32Array {
  const c = (ctx.cache ??= {});
  if (c.lab) return c.lab;
  const n = ctx.w * ctx.h, out = new Float32Array(n * 3);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  for (let i = 0; i < n; i++) {
    const r = lin(ctx.rgb[i * 3]), g = lin(ctx.rgb[i * 3 + 1]), b = lin(ctx.rgb[i * 3 + 2]);
    const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    const fx = f(X), fy = f(Y), fz = f(Z);
    out[i * 3] = 116 * fy - 16; out[i * 3 + 1] = 500 * (fx - fy); out[i * 3 + 2] = 200 * (fy - fz);
  }
  return (c.lab = out);
}

/** Tono (0..360), saturación y valor (0..1) como el HSV de OpenCV. */
function hsv(ctx: MaskContext): Float32Array {
  const c = (ctx.cache ??= {});
  if (c.hsv) return c.hsv;
  const n = ctx.w * ctx.h, out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = ctx.rgb[i * 3], g = ctx.rgb[i * 3 + 1], b = ctx.rgb[i * 3 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d > 1e-6) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    out[i * 3] = (h * 60 + 360) % 360; out[i * 3 + 1] = mx > 0 ? d / mx : 0; out[i * 3 + 2] = mx;
  }
  return (c.hsv = out);
}

/** Desenfoque gaussiano aproximado (tres cajas) de un canal w×h, sigma en px. */
export function blur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma < 0.5) return src;
  const r = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
  const a: Float32Array = Float32Array.from(src), b: Float32Array = new Float32Array(src.length);
  for (let pass = 0; pass < 3; pass++) {
    boxH(a, b, w, h, r);
    boxV(b, a, w, h, r);
  }
  return a;
}
function boxH(s: Float32Array, d: Float32Array, w: number, h: number, r: number) {
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let acc = s[o] * (r + 1);
    for (let x = 1; x <= r; x++) acc += s[o + Math.min(w - 1, x)];
    for (let x = 0; x < w; x++) {
      d[o + x] = acc * k;
      acc += s[o + Math.min(w - 1, x + r + 1)] - s[o + Math.max(0, x - r)];
    }
  }
}
function boxV(s: Float32Array, d: Float32Array, w: number, h: number, r: number) {
  const k = 1 / (2 * r + 1);
  for (let x = 0; x < w; x++) {
    let acc = s[x] * (r + 1);
    for (let y = 1; y <= r; y++) acc += s[Math.min(h - 1, y) * w + x];
    for (let y = 0; y < h; y++) {
      d[y * w + x] = acc * k;
      acc += s[Math.min(h - 1, y + r + 1) * w + x] - s[Math.max(0, y - r) * w + x];
    }
  }
}

/** Ajusta el borde de una máscara de IA a los bordes de la foto (filtro guiado, como _refine de escritorio). */
export function refine(alpha: Float32Array, ctx: MaskContext): Float32Array {
  const { w, h, rgb } = ctx, n = w * h;
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) g[i] = 0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2];
  const r = Math.max(2, 0.004 * Math.max(w, h));
  const mg = blur(g, w, h, r), ma = blur(alpha, w, h, r);
  const ga = new Float32Array(n), gg = new Float32Array(n);
  for (let i = 0; i < n; i++) { ga[i] = g[i] * alpha[i]; gg[i] = g[i] * g[i]; }
  const mga = blur(ga, w, h, r), mgg = blur(gg, w, h, r);
  const A = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const cov = mga[i] - mg[i] * ma[i], v = mgg[i] - mg[i] * mg[i];
    A[i] = cov / (v + 1e-3);
    B[i] = ma[i] - A[i] * mg[i];
  }
  const mA = blur(A, w, h, r), mB = blur(B, w, h, r);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = clamp01(mA[i] * g[i] + mB[i]);
  return out;
}

/** Rellena un polígono (coordenadas en px) con borde suavizado por supermuestreo 4×. */
export function fillPoly(dst: Float32Array, w: number, h: number, pts: [number, number][]) {
  if (pts.length < 3) return;
  let y0 = Infinity, y1 = -Infinity;
  for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const ys = Math.max(0, Math.floor(y0)), ye = Math.min(h - 1, Math.ceil(y1));
  const SS = 4;
  for (let y = ys; y <= ye; y++) {
    const row = new Float32Array(w);
    for (let s = 0; s < SS; s++) {
      const sy = y + (s + 0.5) / SS;
      const xs: number[] = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > sy) !== (yj > sy)) xs.push(xi + ((sy - yi) / (yj - yi)) * (xj - xi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.max(0, xs[k]), b = Math.min(w, xs[k + 1]);
        for (let x = Math.floor(a); x < Math.ceil(b); x++) {
          const cov = Math.min(x + 1, b) - Math.max(x, a);
          if (cov > 0) row[x] += cov / SS;
        }
      }
    }
    for (let x = 0; x < w; x++) if (row[x] > dst[y * w + x]) dst[y * w + x] = Math.min(1, row[x]);
  }
}

// ------------------------------------------------------------------ alfa de una zona
export function zoneAlpha(z: MaskZone, ctx: MaskContext): Float32Array {
  const { w, h } = ctx, n = w * h, p = z.params as Record<string, number>, side = Math.max(w, h);
  let a: Float32Array = new Float32Array(n);
  const t = z.type;
  if (t === "radial") {
    const f = Math.max(0.02, (p.feather ?? 50) / 100);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = Math.hypot((x / Math.max(1, w - 1) - p.cx) / Math.max(p.rx, 1e-3), (y / Math.max(1, h - 1) - p.cy) / Math.max(p.ry, 1e-3));
      a[y * w + x] = smooth(1 - clamp01((d - (1 - f)) / f));
    }
  } else if (t === "linear") {
    const vx = p.x1 - p.x0, vy = p.y1 - p.y0, L2 = vx * vx + vy * vy + 1e-9;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const tt = ((x / Math.max(1, w - 1) - p.x0) * vx + (y / Math.max(1, h - 1) - p.y0) * vy) / L2;
      a[y * w + x] = smooth(1 - clamp01(tt));
    }
  } else if (t === "brush") {
    const strokes = (z.params.strokes as number[][]) ?? [];
    for (const [sx, sy, sr, sign] of strokes) {
      const cx = sx * (w - 1), cy = sy * (h - 1), r = Math.max(1, sr * side), val = sign < 0 ? 0 : 1;
      const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(w - 1, Math.ceil(cx + r + 1));
      const y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(h - 1, Math.ceil(cy + r + 1));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const cov = clamp01(r + 0.5 - Math.hypot(x - cx, y - cy));
        if (cov <= 0) continue;
        const i = y * w + x;
        a[i] = val ? Math.max(a[i], cov) : a[i] * (1 - cov);
      }
    }
    const f = (p.feather ?? 50) / 100;
    if (f > 0 && strokes.length) {
      const rr = (strokes.reduce((s, q) => s + q[2], 0) / strokes.length) * side;
      a = blur(a, w, h, Math.max(0.5, rr * f * 0.6));
    }
  } else if (t === "luma") {
    const L = lab(ctx), lo = p.lo ?? 60, hi = p.hi ?? 100, f = Math.max(1, p.feather ?? 15);
    for (let i = 0; i < n; i++) { const l = L[i * 3]; a[i] = clamp01((l - (lo - f)) / f) * clamp01((hi + f - l) / f); }
    a = blur(a, w, h, Math.max(1, 0.002 * side));
  } else if (t === "color") {
    const H = hsv(ctx), rng = Math.max(5, p.range ?? 30), sm = p.sat_min ?? 15;
    for (let i = 0; i < n; i++) {
      const dh = Math.abs(((H[i * 3] - (p.hue ?? 25)) + 540) % 360 - 180);
      a[i] = clamp01(1 - (dh - rng * 0.6) / (rng * 0.4)) * clamp01((H[i * 3 + 1] * 100 - sm) / 15);
    }
    a = blur(a, w, h, Math.max(1, 0.002 * side));
  } else if (t === "point") {
    const Lb = lab(ctx);
    const px = Math.round(clamp01(p.cx ?? 0.5) * (w - 1)), py = Math.round(clamp01(p.cy ?? 0.5) * (h - 1));
    const r = Math.max(1, Math.round(0.006 * side));
    let rL = 0, rA = 0, rB = 0, k = 0;
    for (let y = Math.max(0, py - r); y <= Math.min(h - 1, py + r); y++) for (let x = Math.max(0, px - r); x <= Math.min(w - 1, px + r); x++) {
      const i = (y * w + x) * 3; rL += Lb[i]; rA += Lb[i + 1]; rB += Lb[i + 2]; k++;
    }
    rL /= k; rA /= k; rB /= k;
    const tol = 4 + (100 - (p.sim ?? 50)) * 0.55, sig = Math.max(2, ((p.size ?? 25) / 100) * side * 0.5);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const dL = Lb[i * 3] - rL, dA = Lb[i * 3 + 1] - rA, dB = Lb[i * 3 + 2] - rB;
      const de = Math.sqrt(dL * dL * 0.5 + dA * dA + dB * dB);
      const col = clamp01(1 - (de - tol * 0.5) / (tol * 0.5 + 1e-6));
      a[i] = col * Math.exp(-((x - px) ** 2 + (y - py) ** 2) / (2 * sig * sig));
    }
    a = blur(a, w, h, Math.max(1, 0.003 * side));
  } else if (t in AI_TYPES) {
    const s = ctx.seg;
    if (s) {
      const [bg, hair, body, face, clothes] = s;
      for (let i = 0; i < n; i++) {
        a[i] = t === "person" ? 1 - bg[i] : t === "face" ? face[i] : t === "skin" ? body[i] + face[i]
          : t === "hair" ? hair[i] : t === "clothes" ? clothes[i] : bg[i];
        a[i] = clamp01(a[i]);
      }
      a = refine(a, ctx);
    }
  } else if (t in FACE_PARTS) {
    for (const f of ctx.faces ?? []) {
      const m = new Float32Array(n);
      const xs = f.map((q) => q.x * w);
      const width = Math.max(...xs) - Math.min(...xs);
      for (const poly of FACE_PARTS[t][1]) {
        if (poly.some((k) => !f[k])) continue;
        fillPoly(m, w, h, poly.map((k) => [f[k].x * w, f[k].y * h]));
      }
      const b = blur(m, w, h, Math.max(0.6, width * 0.012));
      for (let i = 0; i < n; i++) a[i] = Math.max(a[i], b[i]);
    }
  } else if (t === "beard") {
    a = beard(ctx);
  } else if (t === "sky") {
    a = sky(ctx);
  }
  if (z.invert) for (let i = 0; i < n; i++) a[i] = 1 - a[i];
  for (let i = 0; i < n; i++) a[i] = clamp01(a[i]);
  return a;
}

/** Barba: la parte de la cara por debajo de la nariz (sin labios) donde la foto es más oscura que la piel de
 * las mejillas, y lo que la segmentación da como pelo en esa zona. Aproximación de beard_alpha de escritorio. */
function beard(ctx: MaskContext): Float32Array {
  const { w, h } = ctx, n = w * h;
  const out = new Float32Array(n);
  const L = lab(ctx);
  for (const f of ctx.faces ?? []) {
    if (f.length < 468) continue;
    const zone = new Float32Array(n);
    const noseY = Math.max(...NOSE_LOW.map((k) => f[k].y));
    // contorno de la cara por debajo de la nariz, un poco ensanchado
    const cx = f.reduce((s, q) => s + q.x, 0) / f.length;
    const oval = FACE_OVAL.map((k) => f[k]).filter((q) => q.y > noseY - 0.01);
    const poly: [number, number][] = [
      ...oval.map((q) => [(cx + (q.x - cx) * 1.06) * w, q.y * h + 0.01 * h] as [number, number]),
    ].sort((p1, p2) => Math.atan2(p1[1] - noseY * h, p1[0] - cx * w) - Math.atan2(p2[1] - noseY * h, p2[0] - cx * w));
    poly.push([poly[poly.length - 1][0], noseY * h], [poly[0][0], noseY * h]);
    fillPoly(zone, w, h, poly);
    const lips = new Float32Array(n);
    fillPoly(lips, w, h, FACE_PARTS.lips[1][0].map((k) => [f[k].x * w, f[k].y * h]));
    // luminosidad de referencia: las mejillas
    const cheek = [50, 280, 101, 330].map((k) => f[k]).filter(Boolean);
    let ref = 0;
    for (const q of cheek) ref += L[(Math.round(q.y * (h - 1)) * w + Math.round(q.x * (w - 1))) * 3];
    ref /= Math.max(1, cheek.length);
    const hair = ctx.seg?.[1];
    for (let i = 0; i < n; i++) {
      if (zone[i] <= 0) continue;
      const dark = clamp01((ref - 6 - L[i * 3]) / 14);
      const v = Math.max(dark, hair ? hair[i] : 0) * zone[i] * (1 - lips[i]);
      if (v > out[i]) out[i] = v;
    }
  }
  return blur(out, w, h, Math.max(1, 0.003 * Math.max(w, h)));
}

/** Cielo aproximado (sin IA): claro o azulado, poca textura, conectado con el borde de arriba (como _sky). */
function sky(ctx: MaskContext): Float32Array {
  const { w, h } = ctx, n = w * h, H = hsv(ctx);
  const gray = new Float32Array(n);
  for (let i = 0; i < n; i++) gray[i] = 0.299 * ctx.rgb[i * 3] + 0.587 * ctx.rgb[i * 3 + 1] + 0.114 * ctx.rgb[i * 3 + 2];
  const lapl = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    lapl[i] = Math.abs(gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w] - 4 * gray[i]);
  }
  const tex = blur(lapl, w, h, 3);
  const cand = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const hue = H[i * 3], sat = H[i * 3 + 1], val = H[i * 3 + 2];
    const blue = clamp01(1 - Math.abs(hue - 215) / 45) * clamp01(sat * 3);
    const bright = clamp01((val - 0.55) / 0.3) * clamp01(1 - sat * 2.5);
    cand[i] = Math.max(blue, bright) * clamp01(1 - tex[i] / 0.03);
  }
  // relleno desde el borde de arriba por los píxeles candidatos
  const keep = new Uint8Array(n), stack: number[] = [];
  for (let y = 0; y < Math.max(2, Math.floor(h / 20)); y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (cand[i] > 0.4 && !keep[i]) { keep[i] = 1; stack.push(i); }
  }
  while (stack.length) {
    const i = stack.pop()!, x = i % w, y = (i / w) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j >= 0 && !keep[j] && cand[j] > 0.4) { keep[j] = 1; stack.push(j); }
    }
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = keep[i] ? clamp01(cand[i] * 1.5) : 0;
  return blur(out, w, h, Math.max(1.5, 0.004 * Math.max(w, h)));
}

/** Alfa de la máscara entera: la zona principal combinada con sus zonas, invertida si toca, por la cantidad. */
export function maskAlpha(m: LocalMask, ctx: MaskContext, zoneCache?: Map<string, Float32Array>): Float32Array {
  const get = (z: MaskZone) => {
    const k = zoneKey(z);
    let a = zoneCache?.get(k);
    if (!a) { a = zoneAlpha(z, ctx); zoneCache?.set(k, a); }
    return a;
  };
  const a = Float32Array.from(get(m));
  for (const c of m.parts) {
    if (c.enabled === false) continue;
    const pa = get(c);
    const mode = c.mode ?? "add";
    for (let i = 0; i < a.length; i++) a[i] = mode === "sub" ? a[i] * (1 - pa[i]) : mode === "inter" ? a[i] * pa[i] : Math.max(a[i], pa[i]);
  }
  const k = (m.amount ?? 100) / 100;
  for (let i = 0; i < a.length; i++) a[i] = clamp01((m.invert_all ? 1 - a[i] : a[i]) * k);
  return a;
}

/** A bytes para subirlo a la GPU. */
export function toBytes(a: Float32Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = Math.round(a[i] * 255);
  return out;
}

/** Ajustes de una máscara en el orden del shader (ver renderer). */
export function adjUniforms(adj: Record<string, number>) {
  const g = (k: string) => adj[k] ?? NEUTRAL_ADJ[k] ?? 0;
  return {
    basic: [g("exposure"), g("contrast") / 100, g("highlights") / 100, g("shadows") / 100, g("temp") / 100, g("tint") / 100, g("sharpness") / 100],
    presence: [g("texture") / 100, g("clarity") / 100, g("dehaze") / 100, g("vibrance") / 100, g("saturation") / 100],
    curve: [g("curve_highlights") / 100, g("curve_lights") / 100, g("curve_darks") / 100, g("curve_shadows") / 100],
    hsl: HSL_BANDS.flatMap(([b]) => [g(`hsl_${b}_h`) / 100, g(`hsl_${b}_s`) / 100, g(`hsl_${b}_l`) / 100]),
    grade: [g("grade_sh_hue") / 360, g("grade_sh_sat") / 100, g("grade_mid_hue") / 360, g("grade_mid_sat") / 100,
      g("grade_hi_hue") / 360, g("grade_hi_sat") / 100, g("grade_blend") / 100, g("grade_balance") / 100],
  };
}
