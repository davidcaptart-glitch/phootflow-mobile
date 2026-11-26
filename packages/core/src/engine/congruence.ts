// «Edita una y el resto igual»: el Look (filtro, B/N, fondo, belleza, ajustes finos) es el mismo para todas,
// pero la luz y el color de partida de cada foto se corrigen antes, para que todas lleguen al mismo punto
// que la foto guía. Así una foto más oscura o más cálida de la misma sesión queda igual que las demás.
import type { Develop, Look, PhotoStats } from "./types";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Gris medio de referencia (lineal). */
export const TARGET_MID = Math.log2(0.18);
/** Cuánto se corrige hacia el gris medio (1 = del todo). Menos de 1 respeta la intención: la noche sigue siendo noche. */
export const EV_STRENGTH = 0.75;
export const WB_STRENGTH = 0.6;
/** Rango dinámico «normal» en pasos (p98 / p2). */
export const TARGET_SPREAD = 6.5;

/** Corrección automática de una foto, sin Look. */
export function autoDevelop(s: PhotoStats): Develop {
  const ev = clamp((TARGET_MID - s.logMid) * EV_STRENGTH, -2.5, 2.5);
  const spread = Math.log2((s.p98 + 1e-3) / (s.p2 + 1e-3));
  const contrast = clamp((TARGET_SPREAD - spread) * 6, -25, 25);
  // si al subir la exposición se queman las luces, se recuperan
  const hiAfter = s.p98 * Math.pow(2, ev);
  const highlights = hiAfter > 0.9 ? -clamp((hiAfter - 0.9) * 120, 0, 60) : 0;
  const loAfter = s.p2 * Math.pow(2, ev);
  const shadows = loAfter < 0.004 ? clamp((0.004 - loAfter) * 6000, 0, 35) : 0;
  return {
    exposure: ev,
    contrast,
    warmth: 0, tint: 0, saturation: 0,
    highlights, shadows,
    wbR: Math.pow(2, clamp(-s.castRG * WB_STRENGTH, -1, 1)),
    wbB: Math.pow(2, clamp(-s.castBG * WB_STRENGTH, -1, 1)),
  };
}

/** Cuánto se iguala cada foto a la guía (1 = del todo). */
export const MATCH_EV = 0.9;
export const MATCH_WB = 0.85;

/**
 * Revelado final de una foto: la guía lleva su corrección automática + los ajustes del usuario; cada una de
 * las demás se iguala a la guía (misma luz media y misma dominante de partida) y recibe los mismos ajustes.
 * Sin guía (o siendo la guía), solo lo automático.
 */
export function developFor(s: PhotoStats, look: Look, guide: PhotoStats | null = null): Develop {
  const g = guide ?? s;
  const a = autoDevelop(g);
  const l = look.light;
  const ev = a.exposure + clamp(g.logMid - s.logMid, -2.5, 2.5) * MATCH_EV;
  const wbR = a.wbR * Math.pow(2, clamp((g.castRG - s.castRG) * MATCH_WB, -1, 1));
  const wbB = a.wbB * Math.pow(2, clamp((g.castBG - s.castBG) * MATCH_WB, -1, 1));
  // luces y sombras: las de la guía, y además lo que esta foto necesite para no quemarse ni empastarse
  const own = autoDevelop({ ...s, logMid: s.logMid - (ev - autoDevelop(s).exposure) / EV_STRENGTH });
  return {
    exposure: clamp(ev + l.exposure, -4, 4),
    contrast: clamp(a.contrast + l.contrast, -100, 100),
    warmth: l.warmth,
    tint: l.tint,
    saturation: l.saturation,
    highlights: clamp(Math.min(a.highlights, own.highlights) + l.highlights, -100, 100),
    shadows: clamp(Math.max(a.shadows, own.shadows) + l.shadows, -100, 100),
    wbR, wbB,
  };
}

/** El desenfoque de fondo solo tiene sentido con un sujeto claro (como BK.events_eligible en escritorio). */
export function bokehEligible(s: PhotoStats): boolean {
  if (s.faces.length >= 1 && s.faces.length <= 3) return true;
  if (!s.people) return false;
  const a = s.people.w * s.people.h;
  return a > 0.04 && a < 0.8;
}

/** El filtro de belleza solo se nota con caras de cierto tamaño (≥ 5 % del ancho, como photo_retouch). */
export function beautyEligible(s: PhotoStats): boolean {
  return s.faces.some((f) => f.w >= 0.05);
}
