// Normalizar diseños guardados: cualquier tablero (de la fase 1, a medias o de una versión futura) se convierte en
// uno válido. Rellena lo que falte con los valores de siempre (así se pinta igual que antes), descarta elementos
// desconocidos y acota los números. Los campos nuevos de la fase 2 se dejan sin poner si no estaban (todos son
// opcionales y su ausencia equivale al comportamiento antiguo).
import { FONTS, MAX_PAGES, newId, type Board, type Item } from "./board";
import { ANIMS } from "./anim";
import { SHAPES } from "./shapes";
import { TEXT_EFFECTS } from "./text";

export const BOARD_VERSION = 2;

type Obj = Record<string, unknown>;
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function normalizeBoard(raw: unknown): Board {
  const r = (raw && typeof raw === "object" ? raw : {}) as Obj;
  const g = r.grad as Obj | null | undefined;
  const ids = new Set<string>();
  const items = (Array.isArray(r.items) ? r.items : [])
    .map((x) => normalizeItem(x))
    .filter((x): x is Item => !!x)
    .map((it) => {
      if (ids.has(it.id)) it = { ...it, id: newId() };
      ids.add(it.id);
      return it;
    });
  return {
    v: BOARD_VERSION,
    format: str(r.format, "4:5") || "4:5",
    pages: clamp(Math.round(num(r.pages, 1)), 1, MAX_PAGES),
    bg: str(r.bg, "#ffffff"),
    grad: g && typeof g === "object" && typeof g.to === "string" ? { to: g.to, angle: num(g.angle, 0) } : null,
    items,
  };
}

export function normalizeItem(raw: unknown): Item | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Obj;
  const base: Obj = { id: str(r.id, "") || newId() };
  if (typeof r.rot === "number" && Number.isFinite(r.rot)) base.rot = r.rot;
  if (r.locked === true) base.locked = true;
  if (r.hidden === true) base.hidden = true;
  if (typeof r.group === "string" && r.group) base.group = r.group;
  if (typeof r.opacity === "number") base.opacity = clamp(r.opacity, 0, 1);
  const a = r.anim as Obj | undefined;
  if (a && typeof a === "object" && ANIMS.some((x) => x.id === a.kind)) {
    base.anim = { kind: a.kind, ...(typeof a.delay === "number" ? { delay: Math.max(0, a.delay) } : {}),
      ...(typeof a.dur === "number" ? { dur: clamp(a.dur, 0.05, 10) } : {}),
      ...(["izquierda", "derecha", "arriba", "abajo"].includes(a.dir as string) ? { dir: a.dir } : {}) };
  }
  const keep = (...keys: string[]) => { for (const k of keys) if (r[k] !== undefined && r[k] !== null) base[k] = r[k]; };
  switch (r.kind) {
    case "photo":
      keep("frame", "border", "borderColor", "cutout", "shadow", "fit");
      return {
        ...base, kind: "photo", photo: str(r.photo, ""),
        x: num(r.x, 0), y: num(r.y, 0), w: Math.max(0.001, num(r.w, 1)), h: Math.max(0.001, num(r.h, 1)),
        zoom: Math.max(0.1, num(r.zoom, 1)), ox: clamp(num(r.ox, 0), -1, 1), oy: clamp(num(r.oy, 0), -1, 1), radius: Math.max(0, num(r.radius, 0)),
      } as Item;
    case "text": {
      keep("lineHeight", "stroke", "shadowStyle", "boxPad", "boxRadius", "curve");
      if (TEXT_EFFECTS.some((e) => e.id === r.effect)) base.effect = r.effect;
      const align = r.align === "left" || r.align === "right" ? r.align : "center";
      return {
        ...base, kind: "text", text: str(r.text, ""), x: num(r.x, 0.5), y: num(r.y, 0.5),
        size: Math.max(0.002, num(r.size, 0.05)), font: typeof r.font === "string" && r.font in FONTS ? r.font : "moderna",
        color: str(r.color, "#ffffff"), weight: num(r.weight, 600), align,
        box: typeof r.box === "string" ? r.box : null, shadow: r.shadow === true, spacing: num(r.spacing, 0), upper: r.upper === true,
      } as Item;
    }
    case "sticker":
      return { ...base, kind: "sticker", emoji: str(r.emoji, "⭐"), x: num(r.x, 0.5), y: num(r.y, 0.5), size: Math.max(0.005, num(r.size, 0.08)) } as Item;
    case "shape":
      keep("radius", "grad", "stroke", "strokeWidth", "points", "inner", "sides");
      return {
        ...base, kind: "shape", shape: SHAPES.some((s) => s.id === r.shape) ? r.shape : "rect",
        x: num(r.x, 0), y: num(r.y, 0), w: Math.max(0.001, num(r.w, 0.2)), h: Math.max(0.001, num(r.h, 0.2)), fill: str(r.fill, "#111111"),
      } as Item;
    default:
      return null;
  }
}

/** Texto JSON para guardar un diseño (las fotos van por id, no se incrustan). */
export const serializeBoard = (b: Board) => JSON.stringify({ ...b, v: BOARD_VERSION });
export const parseBoard = (json: string): Board => normalizeBoard(JSON.parse(json));
