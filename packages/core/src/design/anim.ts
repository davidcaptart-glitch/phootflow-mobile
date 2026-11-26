// Animaciones de entrada por elemento (para exportar vídeo o GIF). Lógica pura: dado el tiempo, cuánto se ve el
// elemento, cuánto se ha desplazado y a qué escala. Sin DOM.

export type AnimKind = "ninguna" | "aparecer" | "deslizar" | "zoom" | "subir" | "girar" | "lento";
export type AnimDir = "izquierda" | "derecha" | "arriba" | "abajo";

export interface Anim {
  kind: AnimKind;
  /** Segundos desde que empieza la página hasta que arranca la animación. */
  delay?: number;
  /** Duración en segundos. */
  dur?: number;
  /** De dónde entra (solo «deslizar»). */
  dir?: AnimDir;
}

export const ANIMS: { id: AnimKind; name: string }[] = [
  { id: "ninguna", name: "Sin animación" },
  { id: "aparecer", name: "Aparecer" },
  { id: "deslizar", name: "Deslizar" },
  { id: "zoom", name: "Zoom" },
  { id: "subir", name: "Subir" },
  { id: "girar", name: "Girar" },
  { id: "lento", name: "Zoom lento (fotos de vídeo)" },
];

export const ANIM_DEFAULT_DUR = 0.7;

/** Estado de un elemento en el instante `t` (s). `dx`, `dy` en fracción de página; `rot` en grados extra. */
export interface AnimState { alpha: number; dx: number; dy: number; scale: number; rot: number }

export const STILL: AnimState = { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0 };

const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

export function animAt(a: Anim | null | undefined, t: number): AnimState {
  if (!a || a.kind === "ninguna") return STILL;
  const dur = Math.max(0.05, a.dur ?? ANIM_DEFAULT_DUR);
  const raw = (t - (a.delay ?? 0)) / dur;
  const p = raw <= 0 ? 0 : raw >= 1 ? 1 : raw;
  const e = easeOut(p);
  const inv = 1 - e;
  switch (a.kind) {
    case "aparecer": return { ...STILL, alpha: e };
    case "subir": return { ...STILL, alpha: e, dy: 0.08 * inv };
    case "zoom": return { ...STILL, alpha: e, scale: 0.6 + 0.4 * e };
    case "girar": return { ...STILL, alpha: e, scale: 0.8 + 0.2 * e, rot: -25 * inv };
    // zoom suave y continuo durante toda la duración (efecto «Ken Burns»), sin fundido
    case "lento": return { ...STILL, scale: 1 + 0.12 * p };
    case "deslizar": {
      const d = a.dir ?? "izquierda", k = 0.35 * inv;
      return {
        ...STILL, alpha: Math.min(1, e * 1.6),
        dx: d === "izquierda" ? -k : d === "derecha" ? k : 0,
        dy: d === "arriba" ? -k : d === "abajo" ? k : 0,
      };
    }
    default: return STILL;
  }
}

/** Cuándo termina la última animación de una lista de elementos (s). */
export function animEnd(items: { anim?: Anim | null }[]): number {
  let end = 0;
  for (const it of items) {
    if (!it.anim || it.anim.kind === "ninguna") continue;
    end = Math.max(end, (it.anim.delay ?? 0) + (it.anim.dur ?? ANIM_DEFAULT_DUR));
  }
  return end;
}
