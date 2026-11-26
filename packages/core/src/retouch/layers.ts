// Retocar (tipo Photoshop) en Pro: capas no destructivas encima de la foto revelada. Cada capa guarda solo sus
// parámetros (trazos normalizados 0..1, textos, colores) y, si hace falta, un parche ya calculado (el relleno de
// la IA). Así se puede volver a componer a cualquier tamaño (la vista, la miniatura o la exportación completa).
import type { Box } from "../engine/types";

/** Trazo de pincel: radio como fracción del lado largo y puntos (u, v) seguidos, normalizados 0..1. */
export interface Stroke { r: number; pts: number[]; }

interface LayerBase {
  id: string;
  visible: boolean;
  /** 0..1 */
  opacity: number;
}

/** Quitar objetos o personas: el hueco pintado y el relleno de la IA (MI-GAN) ya calculado. */
export interface RemoveLayer extends LayerBase {
  kind: "remove";
  strokes: Stroke[];
  /** Parche RGBA (alfa = la zona rellenada, con borde suave) y dónde va, normalizado. */
  patch: Blob | null;
  box: Box;
}

/** Corrector (busca solo de dónde copiar y funde el color) y tampón (copia de un origen elegido). */
export interface HealLayer extends LayerBase {
  kind: "heal";
  mode: "heal" | "clone";
  strokes: Stroke[];
  /** Desplazamiento del origen respecto al destino, normalizado (dx en anchos, dy en altos). */
  dx: number;
  dy: number;
}

/** Retoque de retrato: cantidades 0..100. */
export interface PortraitLayer extends LayerBase {
  kind: "portrait";
  skin: number;
  eyes: number;
  teeth: number;
  circles: number;
}

export type BackgroundMode = "transparent" | "color" | "blur" | "image";

/** Quitar o cambiar el fondo (lo que no es la persona). */
export interface BackgroundLayer extends LayerBase {
  kind: "background";
  mode: BackgroundMode;
  color: string;
  /** 0..100 */
  blur: number;
  image: Blob | null;
  /** Suavizado del borde de la persona, 0..100. */
  feather: number;
}

export type FontId = "sans" | "serif" | "display" | "mono" | "script";

export interface TextLayer extends LayerBase {
  kind: "text";
  text: string;
  /** Centro, normalizado. */
  x: number;
  y: number;
  /** Alto de letra como fracción del ancho de la foto. */
  size: number;
  color: string;
  font: FontId;
  bold: boolean;
  align: "left" | "center" | "right";
  shadow: boolean;
  /** Recuadro de fondo detrás del texto (color o "" = sin recuadro). */
  box: string;
  /** Grados. */
  rotation: number;
}

export interface LogoLayer extends LayerBase {
  kind: "logo";
  image: Blob | null;
  x: number;
  y: number;
  /** Ancho como fracción del ancho de la foto. */
  scale: number;
  rotation: number;
}

export type Layer = RemoveLayer | HealLayer | PortraitLayer | BackgroundLayer | TextLayer | LogoLayer;
export type LayerKind = Layer["kind"];

export const FONTS: Record<FontId, { name: string; css: string }> = {
  sans: { name: "Moderna", css: '"Plus Jakarta Sans Variable", "Plus Jakarta Sans", system-ui, sans-serif' },
  serif: { name: "Clásica", css: 'Georgia, "Times New Roman", serif' },
  display: { name: "Titular", css: 'Impact, "Arial Black", "Helvetica Neue", sans-serif' },
  mono: { name: "Máquina", css: '"Courier New", ui-monospace, monospace' },
  script: { name: "Manuscrita", css: '"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive' },
};

let seq = 0;
export const layerId = () => `L${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const base = () => ({ id: layerId(), visible: true, opacity: 1 });

export function newRemove(strokes: Stroke[] = []): RemoveLayer {
  return { ...base(), kind: "remove", strokes, patch: null, box: { x: 0, y: 0, w: 0, h: 0 } };
}
export function newHeal(mode: "heal" | "clone", strokes: Stroke[], dx: number, dy: number): HealLayer {
  return { ...base(), kind: "heal", mode, strokes, dx, dy };
}
export function newPortrait(): PortraitLayer {
  return { ...base(), kind: "portrait", skin: 45, eyes: 30, teeth: 30, circles: 35 };
}
export function newBackground(mode: BackgroundMode = "color"): BackgroundLayer {
  return { ...base(), kind: "background", mode, color: "#ffffff", blur: 60, image: null, feather: 30 };
}
export function newText(text = "Tu texto"): TextLayer {
  return {
    ...base(), kind: "text", text, x: 0.5, y: 0.82, size: 0.075, color: "#ffffff", font: "sans", bold: true,
    align: "center", shadow: true, box: "", rotation: 0,
  };
}
export function newLogo(image: Blob): LogoLayer {
  return { ...base(), kind: "logo", image, x: 0.84, y: 0.9, scale: 0.22, rotation: 0, opacity: 0.9 };
}

export const KIND_NAMES: Record<LayerKind, string> = {
  remove: "Quitar", heal: "Corrector", portrait: "Retrato", background: "Fondo", text: "Texto", logo: "Logo",
};

export function layerName(l: Layer): string {
  switch (l.kind) {
    case "heal": return l.mode === "clone" ? "Tampón" : "Corrector";
    case "text": return `Texto · ${l.text.split("\n")[0].slice(0, 18) || "vacío"}`;
    case "background": return { transparent: "Fondo · quitado", color: "Fondo · color", blur: "Fondo · desenfocado", image: "Fondo · imagen" }[l.mode];
    default: return KIND_NAMES[l.kind];
  }
}

/** Capas que dependen de la IA de segmentación o de caras (para cargarla antes de componer). */
export const needsPortrait = (ls: Layer[]) => ls.some((l) => l.visible && l.kind === "portrait");
export const needsPerson = (ls: Layer[]) => ls.some((l) => l.visible && l.kind === "background");

/** Limpia lo leído del catálogo (versiones viejas, campos que falten). */
export function normalizeLayers(raw: unknown): Layer[] {
  if (!Array.isArray(raw)) return [];
  const out: Layer[] = [];
  for (const r of raw as Partial<Layer>[]) {
    if (!r || typeof r !== "object" || !r.kind) continue;
    const defaults: Record<LayerKind, () => Layer> = {
      remove: () => newRemove(), heal: () => newHeal("heal", [], 0, 0), portrait: newPortrait,
      background: () => newBackground(), text: () => newText(""), logo: () => ({ ...newLogo(new Blob()), image: null }),
    };
    const make = defaults[r.kind as LayerKind];
    if (!make) continue;
    out.push({ ...make(), ...r } as Layer);
  }
  return out;
}

/** Caja (normalizada) que abarca los trazos, con margen extra `pad` (fracción del lado largo). */
export function strokesBox(strokes: Stroke[], aspect: number, pad = 0): Box | null {
  // aspect = ancho / alto; los radios son fracción del lado largo
  const rx = (r: number) => (aspect >= 1 ? r : r * aspect), ry = (r: number) => (aspect >= 1 ? r * aspect : r);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) {
    for (let i = 0; i < s.pts.length; i += 2) {
      const u = s.pts[i], v = s.pts[i + 1];
      x0 = Math.min(x0, u - rx(s.r + pad)); x1 = Math.max(x1, u + rx(s.r + pad));
      y0 = Math.min(y0, v - ry(s.r + pad)); y1 = Math.max(y1, v + ry(s.r + pad));
    }
  }
  if (!isFinite(x0)) return null;
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(1, x1); y1 = Math.min(1, y1);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ------------------------------------------------------------------ deshacer / rehacer

/** Historial de estados de capas (cada estado es una lista inmutable: los parches se comparten, no se copian). */
export class History<T> {
  private states: { label: string; value: T }[];
  private i = 0;
  constructor(initial: T, private max = 80) {
    this.states = [{ label: "Abrir", value: initial }];
  }
  get current(): T { return this.states[this.i].value; }
  get index() { return this.i; }
  get canUndo() { return this.i > 0; }
  get canRedo() { return this.i < this.states.length - 1; }
  get labels() { return this.states.map((s) => s.label); }
  /** Lo que se desharía (o null). */
  get undoLabel() { return this.canUndo ? this.states[this.i].label : null; }
  get redoLabel() { return this.canRedo ? this.states[this.i + 1].label : null; }
  push(label: string, value: T) {
    this.states = [...this.states.slice(0, this.i + 1), { label, value }];
    if (this.states.length > this.max) this.states = this.states.slice(this.states.length - this.max);
    this.i = this.states.length - 1;
    return value;
  }
  /** Sustituye el estado actual sin crear un paso nuevo (p. ej., mientras se arrastra un regulador). */
  replace(value: T) { this.states[this.i] = { ...this.states[this.i], value }; return value; }
  undo() { if (this.canUndo) this.i--; return this.current; }
  redo() { if (this.canRedo) this.i++; return this.current; }
}
