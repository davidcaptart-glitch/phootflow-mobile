// Texto avanzado: efectos con nombre, texto curvo y utilidades de color. Lógica pura (sin DOM): el pintado vive en
// board.ts y usa lo que se resuelve aquí. Las medidas van en «em» (fracción del tamaño de letra).

export type TextEffect = "ninguno" | "neon" | "eco" | "elevado" | "sombra-dura" | "contorno" | "hueco" | "brillo";

export const TEXT_EFFECTS: { id: TextEffect; name: string }[] = [
  { id: "ninguno", name: "Ninguno" },
  { id: "neon", name: "Neón" },
  { id: "eco", name: "Eco" },
  { id: "elevado", name: "Elevado" },
  { id: "sombra-dura", name: "Sombra dura" },
  { id: "contorno", name: "Contorno" },
  { id: "hueco", name: "Hueco" },
  { id: "brillo", name: "Brillo" },
];

export interface TextShadow { color: string; blur: number; dx: number; dy: number }
export interface TextStroke { color: string; width: number }

/** Lo que hay que pintar para un texto, ya resuelto su efecto. */
export interface ResolvedText {
  /** Relleno; null = sin relleno (hueco). */
  fill: string | null;
  /** Contorno; `outside` = se pinta debajo del relleno (solo se ve hacia fuera). */
  stroke: (TextStroke & { outside: boolean }) | null;
  /** Sombras (cada una es una pasada). */
  shadows: TextShadow[];
  /** Copias desplazadas detrás (eco). */
  echoes: { dx: number; dy: number; alpha: number }[];
}

export interface TextStyleInput {
  color: string;
  shadow: boolean;
  shadowStyle?: TextShadow | null;
  stroke?: TextStroke | null;
  effect?: TextEffect;
}

export const LEGACY_SHADOW: TextShadow = { color: "rgba(0,0,0,.45)", blur: 0.35, dx: 0, dy: 0.06 };

export function resolveTextStyle(t: TextStyleInput): ResolvedText {
  const base: ResolvedText = {
    fill: t.color,
    stroke: t.stroke && t.stroke.width > 0 ? { ...t.stroke, outside: true } : null,
    shadows: t.shadowStyle ? [t.shadowStyle] : t.shadow ? [LEGACY_SHADOW] : [],
    echoes: [],
  };
  const dark = luminance(t.color) > 0.5;
  switch (t.effect ?? "ninguno") {
    case "neon":
      return {
        ...base, fill: mix(t.color, "#ffffff", 0.55),
        shadows: [
          { color: t.color, blur: 0.15, dx: 0, dy: 0 },
          { color: t.color, blur: 0.45, dx: 0, dy: 0 },
          { color: t.color, blur: 1.1, dx: 0, dy: 0 },
        ],
      };
    case "eco":
      return { ...base, echoes: [{ dx: 0.07, dy: 0.07, alpha: 0.45 }, { dx: 0.14, dy: 0.14, alpha: 0.2 }] };
    case "elevado":
      return { ...base, shadows: [{ color: "rgba(0,0,0,.38)", blur: 0.55, dx: 0, dy: 0.16 }] };
    case "sombra-dura":
      return { ...base, shadows: [{ color: dark ? "#111111" : "#ffffff", blur: 0, dx: 0.07, dy: 0.07 }] };
    case "contorno":
      return { ...base, stroke: { color: dark ? "#111111" : "#ffffff", width: 0.08, outside: true } };
    case "hueco":
      return { ...base, fill: null, stroke: { color: t.color, width: 0.04, outside: false }, shadows: [] };
    case "brillo":
      return { ...base, shadows: [{ color: mix(t.color, "#ffffff", 0.4), blur: 0.6, dx: 0, dy: 0 }] };
    default:
      return base;
  }
}

/** Posición de cada letra de una línea curva. `widths` = ancho de cada letra; `curve` = grados de arco
 *  (+ arco hacia arriba ∩, − hacia abajo ∪). Devuelve centros relativos al centro de la línea y su giro (rad),
 *  ya centrados en vertical (la flecha del arco se reparte arriba y abajo). */
export function arcLayout(widths: number[], curve: number) {
  const total = widths.reduce((a, b) => a + b, 0);
  const theta = (Math.max(-360, Math.min(360, curve)) * Math.PI) / 180;
  if (!total || Math.abs(theta) < 1e-3) {
    let acc = -total / 2;
    return { glyphs: widths.map((w) => { const x = acc + w / 2; acc += w; return { x, y: 0, angle: 0 }; }), sagitta: 0 };
  }
  const s = Math.sign(theta), R = total / Math.abs(theta);
  let acc = -total / 2;
  const glyphs = widths.map((w) => {
    const a = acc + w / 2;
    acc += w;
    const phi = a / R;
    return { x: R * Math.sin(phi), y: s * R * (1 - Math.cos(phi)), angle: s * phi };
  });
  const half = Math.min(Math.abs(theta) / 2, Math.PI);
  const sagitta = R * (1 - Math.cos(half));
  for (const g of glyphs) g.y -= (s * sagitta) / 2;
  return { glyphs, sagitta };
}

// ---------- color ----------

export interface RGBA { r: number; g: number; b: number; a: number }

/** Lee #rgb, #rrggbb, #rrggbbaa, rgb() y rgba(). null si no lo entiende. */
export function parseColor(c: string): RGBA | null {
  const s = c.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    const h = m[1];
    if (h.length === 3 || h.length === 4) {
      const v = [...h].map((x) => parseInt(x + x, 16));
      return { r: v[0], g: v[1], b: v[2], a: h.length === 4 ? v[3] / 255 : 1 };
    }
    if (h.length === 6 || h.length === 8) {
      const v = [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2) || "ff", 16));
      return { r: v[0], g: v[1], b: v[2], a: h.length === 8 ? v[3] / 255 : 1 };
    }
    return null;
  }
  m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.some((x) => Number.isNaN(x))) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  if (s === "white") return { r: 255, g: 255, b: 255, a: 1 };
  if (s === "black") return { r: 0, g: 0, b: 0, a: 1 };
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  return null;
}

const hx = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");

export function formatColor(c: RGBA): string {
  if (c.a >= 1) return `#${hx(c.r)}${hx(c.g)}${hx(c.b)}`;
  return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${+c.a.toFixed(3)})`;
}

/** Luminancia relativa (0 negro … 1 blanco). */
export function luminance(c: string): number {
  const p = parseColor(c);
  if (!p) return 0.5;
  const f = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(p.r) + 0.7152 * f(p.g) + 0.0722 * f(p.b);
}

/** Mezcla dos colores (t = 0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const p = parseColor(a), q = parseColor(b);
  if (!p || !q) return a;
  return formatColor({ r: p.r + (q.r - p.r) * t, g: p.g + (q.g - p.g) * t, b: p.b + (q.b - p.b) * t, a: p.a + (q.a - p.a) * t });
}
