// Estilos guardados: una edición con nombre (filtro, luz, fondo, belleza, color selectivo, B/N y destinos)
// que se aplica a otra sesión con un toque. Como los «Ajustes guardados» de Events en escritorio: unos
// predefinidos y los del usuario (que pueden sustituir a uno predefinido con el mismo nombre).
import { DEFAULT_LOOK, NO_SPLASH, ZERO_LIGHT, type Look } from "./engine/types";
import { platform } from "./platform";

export interface Style {
  id: string;
  name: string;
  /** Predefinido (no se borra; se puede sustituir guardando uno con su nombre). */
  builtin?: boolean;
  created: number;
  look: Look;
  /** Herramientas que usa (para que el editor muestre sus pestañas). */
  tools: Record<string, boolean>;
}

const KEY = "estilos";

/** Lo que define un estilo: todo el Look menos nada; se normaliza con los valores por defecto. */
export function styleLook(l: Partial<Look>): Look {
  return {
    ...DEFAULT_LOOK, ...l,
    light: { ...ZERO_LIGHT, ...(l.light ?? {}) },
    splash: { ...NO_SPLASH, ...(l.splash ?? {}) },
    formats: [...(l.formats ?? [])],
  };
}

/** Herramientas que necesita un Look (para el editor). */
export function toolsFor(l: Look): Record<string, boolean> {
  return {
    filters: true, crop: l.formats.length > 0 || l.straighten, bokeh: l.bokeh > 0 || l.speed > 0,
    beauty: l.beauty + l.beautyEyes + l.beautyTeeth + l.beautyUnder > 0, bw: l.alsoBW,
    splash: l.splash.on && (l.splash.parts.length > 0 || l.splash.hues.length > 0),
  };
}

const b = (id: string, name: string, l: Partial<Look>): Style => {
  const look = styleLook(l);
  return { id, name, builtin: true, created: 0, look, tools: toolsFor(look) };
};

export const BUILTIN: Style[] = [
  b("b-natural", "Natural", { formats: ["ig-feed"] }),
  b("b-boda", "Boda luminosa", {
    lut: "t3mujinpack/Kodak Portra 400", lutAmount: 0.8, beauty: 40, beautyEyes: 35, beautyTeeth: 30, beautyUnder: 35, bokeh: 25, formats: ["ig-feed", "ig-story"],
    light: { ...ZERO_LIGHT, exposure: 0.2, warmth: 8, contrast: -8, highlights: -15 },
  }),
  b("b-bn", "B/N editorial", {
    lut: "rodaje/blanco-y-negro", lutAmount: 1, grain: 25, vignette: 20, formats: ["ig-feed"],
    light: { ...ZERO_LIGHT, contrast: 18 },
  }),
  b("b-deporte", "Deporte con fuerza", {
    lut: "rodaje/vivo", lutAmount: 0.7, formats: ["ig-feed", "ig-story"],
    light: { ...ZERO_LIGHT, contrast: 22, saturation: 10, shadows: 10 },
  }),
  b("b-fiesta", "Fiesta de noche", {
    lut: "rodaje/verde-azulado-naranja", lutAmount: 0.6, grain: 15, formats: ["ig-story"],
    light: { ...ZERO_LIGHT, shadows: 20, highlights: -20 },
  }),
  b("b-pelicula", "Película suave", {
    lut: "slay/Film", lutAmount: 0.85, grain: 30, vignette: 15, formats: ["ig-feed"],
    light: { ...ZERO_LIGHT, contrast: -10 },
  }),
];

export async function ownStyles(): Promise<Style[]> {
  const raw = (await platform.kvGet<Style[]>(KEY)) ?? [];
  return raw.map((s) => ({ ...s, builtin: false, look: styleLook(s.look) }));
}

/** Los del usuario primero; un predefinido con el mismo nombre que uno propio no se muestra. */
export async function allStyles(): Promise<Style[]> {
  const own = await ownStyles();
  const names = new Set(own.map((s) => s.name.trim().toLowerCase()));
  return [...own.sort((a, b2) => b2.created - a.created), ...BUILTIN.filter((s) => !names.has(s.name.toLowerCase()))];
}

/** Guarda un estilo propio. Con el nombre de otro propio, lo sustituye. */
export async function saveStyle(name: string, look: Look): Promise<Style> {
  const own = await ownStyles();
  const clean = name.trim() || "Mi estilo";
  const prev = own.find((s) => s.name.trim().toLowerCase() === clean.toLowerCase());
  const l = styleLook(look);
  const st: Style = { id: prev?.id ?? `u${Date.now().toString(36)}`, name: clean, created: Date.now(), look: l, tools: toolsFor(l) };
  await platform.kvSet(KEY, [st, ...own.filter((s) => s.id !== st.id)]);
  return st;
}

export async function renameStyle(id: string, name: string) {
  const own = await ownStyles();
  await platform.kvSet(KEY, own.map((s) => (s.id === id ? { ...s, name: name.trim() || s.name } : s)));
}

export async function deleteStyle(id: string) {
  await platform.kvSet(KEY, (await ownStyles()).filter((s) => s.id !== id));
}

/** Resumen corto de lo que hace un estilo («Portra 400 · fondo · belleza · B/N»). */
export function describeStyle(l: Look, lutName: (id: string) => string | undefined): string {
  const parts: string[] = [];
  if (l.lut) parts.push(lutName(l.lut) ?? "filtro");
  if (l.bokeh) parts.push("fondo desenfocado");
  if (l.speed) parts.push("velocidad");
  if (l.straighten) parts.push("enderezada");
  if (l.beauty) parts.push("belleza");
  if (l.splash.on && (l.splash.parts.length || l.splash.hues.length)) parts.push("color selectivo");
  if (l.alsoBW) parts.push("+ B/N");
  if (l.grain) parts.push("grano");
  return parts.join(" · ") || "Sin filtro, luz y color automáticos";
}

// ------------------------------------------------------------------ creador sencillo
/** Crear un estilo con cinco preguntas sencillas en lugar de reguladores. */
export interface Simple {
  mood: "frio" | "neutro" | "calido" | "muy-calido";
  light: "oscura" | "normal" | "luminosa";
  contrast: "suave" | "normal" | "intenso";
  color: "apagado" | "natural" | "vivo" | "bn";
  finish: "limpio" | "pelicula" | "vintage" | "cine" | "pastel";
}

export const SIMPLE_DEFAULT: Simple = { mood: "neutro", light: "normal", contrast: "normal", color: "natural", finish: "limpio" };

/** Opciones de cada pregunta, con su texto (en orden). */
export const SIMPLE_OPTIONS: { [K in keyof Simple]: { label: string; options: [Simple[K], string][] } } = {
  mood: { label: "Ambiente", options: [["frio", "Frío"], ["neutro", "Neutro"], ["calido", "Cálido"], ["muy-calido", "Muy cálido"]] },
  light: { label: "Luz", options: [["oscura", "Más oscura"], ["normal", "Normal"], ["luminosa", "Más luminosa"]] },
  contrast: { label: "Contraste", options: [["suave", "Suave"], ["normal", "Normal"], ["intenso", "Intenso"]] },
  color: { label: "Color", options: [["apagado", "Apagado"], ["natural", "Natural"], ["vivo", "Vivo"], ["bn", "Blanco y negro"]] },
  finish: { label: "Acabado", options: [["limpio", "Limpio"], ["pelicula", "Película"], ["vintage", "Vintage"], ["cine", "Cine"], ["pastel", "Pastel"]] },
};

const FINISH: Record<Simple["finish"], { lut: string | null; amount: number; grain: number; vignette: number; contrast: number }> = {
  limpio: { lut: null, amount: 1, grain: 0, vignette: 0, contrast: 0 },
  pelicula: { lut: "t3mujinpack/Kodak Portra 400", amount: 0.7, grain: 25, vignette: 12, contrast: -5 },
  vintage: { lut: "rodaje/desvaido", amount: 0.75, grain: 22, vignette: 25, contrast: -10 },
  cine: { lut: "rodaje/cine", amount: 0.75, grain: 10, vignette: 18, contrast: 5 },
  pastel: { lut: "rodaje/pastel", amount: 0.8, grain: 0, vignette: 0, contrast: -12 },
};

/** Aplica las respuestas al Look (conserva fondo, belleza, recortes, color selectivo y B/N extra). */
export function applySimple(base: Look, s: Simple): Look {
  const f = FINISH[s.finish];
  const bn = s.color === "bn";
  return styleLook({
    ...base,
    lut: bn ? "rodaje/blanco-y-negro" : f.lut,
    lutAmount: bn ? 1 : f.amount,
    grain: bn ? Math.max(f.grain, 15) : f.grain,
    vignette: f.vignette,
    light: {
      ...ZERO_LIGHT,
      warmth: { frio: -25, neutro: 0, calido: 22, "muy-calido": 42 }[s.mood],
      exposure: { oscura: -0.4, normal: 0, luminosa: 0.35 }[s.light],
      contrast: { suave: -22, normal: 0, intenso: 24 }[s.contrast] + f.contrast,
      saturation: bn ? 0 : { apagado: -35, natural: 0, vivo: 25, bn: 0 }[s.color],
      highlights: s.light === "luminosa" ? -15 : 0,
      shadows: s.contrast === "suave" ? 12 : 0,
    },
  });
}
