// Capas sin lienzo (lógica pura, probada en Node): cajas en unidades del tablero, bloquear, ocultar, agrupar,
// duplicar, mover/escalar/girar en grupo, alinear, distribuir y ayudas de imán.
//
// Unidades: x en anchos de página (0..pages), y en altos de página (0..1). `ratio` = ancho/alto de la página.
// El texto se mide con `measure` (si la interfaz pasa uno hecho con un canvas, `measureWith(ctx)`) o con una
// aproximación (0,56 em por letra) suficiente para alinear e imantar.
import { formatById } from "../engine/formats";
import { DEFAULT_LINE_HEIGHT, FONTS, newId, textLines, type Board, type Item, type TextItem } from "./board";
import { arcLayout } from "./text";

export interface Rect { x: number; y: number; w: number; h: number }

/** Ancho de una línea en unidades de alto de letra × tamaño (devuelve el ancho en las mismas unidades que `size`). */
export type Measure = (it: TextItem, line: string, size: number) => number;

export const approxMeasure: Measure = (it, line, size) => {
  const k = it.font === "condensada" ? 0.44 : it.font === "impacto" ? 0.5 : it.font === "maquina" ? 0.6 : 0.56;
  const bold = it.weight >= 700 ? 1.06 : 1;
  return [...line].length * size * (k * bold + it.spacing);
};

/** Medidor real a partir de un contexto 2D (el mismo que usa el pintado). */
export function measureWith(ctx: CanvasRenderingContext2D): Measure {
  return (it, line, size) => {
    const px = 100; // se mide a 100 px y se escala
    ctx.save();
    ctx.font = `${it.weight} ${px}px ${(FONTS[it.font] ?? FONTS.moderna).css}`;
    ctx.letterSpacing = `${it.spacing * px}px`;
    const w = ctx.measureText(line).width;
    ctx.restore();
    return (w / px) * size;
  };
}

export const boardRatio = (b: Board) => formatById(b.format).ratio;

/** Caja sin girar del elemento en unidades del tablero (equivale a `itemBox` / pw, ph). */
export function itemRect(it: Item, ratio: number, measure: Measure = approxMeasure): Rect {
  if (it.kind === "photo" || it.kind === "shape") return { x: it.x, y: it.y, w: it.w, h: it.h };
  if (it.kind === "sticker") {
    const s = it.size * 1.2;
    return { x: it.x - s / 2 / ratio, y: it.y - s / 2, w: s / ratio, h: s };
  }
  const size = it.size, lines = textLines(it);
  const wh = Math.max(...lines.map((l) => measure(it, l, size)), size) + size * 0.6; // en altos de página
  const sag = it.curve ? arcLayout([wh - size * 0.6], it.curve).sagitta : 0;
  const h = size * (it.lineHeight ?? DEFAULT_LINE_HEIGHT) * lines.length + size * 0.6 + sag;
  const w = wh / ratio;
  const pad = (size * 0.3) / ratio;
  const x = it.curve || it.align === "center" ? it.x - w / 2 : it.align === "left" ? it.x - pad : it.x - w + pad;
  return { x, y: it.y - h / 2, w, h };
}

/** Caja alineada con los ejes que envuelve al elemento girado. */
export function itemAABB(it: Item, ratio: number, measure?: Measure): Rect {
  const r = itemRect(it, ratio, measure);
  if (!it.rot) return r;
  const a = (it.rot * Math.PI) / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  // en px proporcionales (x × ratio) para girar sin deformar
  const W = r.w * ratio, H = r.h;
  const W2 = W * c + H * s, H2 = W * s + H * c;
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  return { x: cx - W2 / ratio / 2, y: cy - H2 / 2, w: W2 / ratio, h: H2 };
}

export function unionRect(rs: Rect[]): Rect {
  const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ---------- selección y grupos ----------

/** Ids que se seleccionan al tocar `id` (todo su grupo). */
export function groupIds(b: Board, id: string): string[] {
  const it = b.items.find((i) => i.id === id);
  if (!it) return [];
  if (!it.group) return [id];
  return b.items.filter((i) => i.group === it.group).map((i) => i.id);
}

/** Amplía una selección con los grupos completos (en orden de capas). */
export function expandSelection(b: Board, ids: string[]): string[] {
  const set = new Set(ids);
  const groups = new Set(b.items.filter((i) => set.has(i.id) && i.group).map((i) => i.group));
  return b.items.filter((i) => set.has(i.id) || (i.group && groups.has(i.group))).map((i) => i.id);
}

/** Unidades que se mueven juntas: cada grupo es una, cada suelto otra. */
function units(b: Board, ids: string[]): Item[][] {
  const sel = new Set(expandSelection(b, ids));
  const out = new Map<string, Item[]>();
  for (const it of b.items) {
    if (!sel.has(it.id)) continue;
    const k = it.group ? `g:${it.group}` : `i:${it.id}`;
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(it);
  }
  return [...out.values()];
}

function patch(b: Board, ids: Set<string>, f: (it: Item) => Item): Board {
  return { ...b, items: b.items.map((it) => (ids.has(it.id) ? f(it) : it)) };
}

export const setLocked = (b: Board, ids: string[], locked: boolean) => patch(b, new Set(expandSelection(b, ids)), (it) => ({ ...it, locked }));
export const setHidden = (b: Board, ids: string[], hidden: boolean) => patch(b, new Set(expandSelection(b, ids)), (it) => ({ ...it, hidden }));
export const setOpacity = (b: Board, ids: string[], opacity: number) =>
  patch(b, new Set(expandSelection(b, ids)), (it) => ({ ...it, opacity: Math.max(0, Math.min(1, opacity)) }));

/** Agrupa (2 o más). Las capas del grupo quedan juntas donde estaba la más alta. */
export function groupItems(b: Board, ids: string[]): { board: Board; group: string | null } {
  const sel = new Set(expandSelection(b, ids));
  if (sel.size < 2) return { board: b, group: null };
  const group = newId();
  const members = b.items.filter((i) => sel.has(i.id)).map((i) => ({ ...i, group }) as Item);
  const top = Math.max(...b.items.map((it, i) => (sel.has(it.id) ? i : -1)));
  const items: Item[] = [];
  b.items.forEach((it, i) => {
    if (!sel.has(it.id)) items.push(it);
    if (i === top) items.push(...members);
  });
  return { board: { ...b, items }, group };
}

/** Deshace los grupos de los elementos indicados. */
export function ungroupItems(b: Board, ids: string[]): Board {
  return patch(b, new Set(expandSelection(b, ids)), (it) => ({ ...it, group: null }));
}

export function deleteItems(b: Board, ids: string[]): Board {
  const sel = new Set(expandSelection(b, ids));
  return { ...b, items: b.items.filter((i) => !sel.has(i.id) || i.locked) };
}

/** Duplica (con su grupo, que pasa a ser otro grupo) encima de los originales, un poco desplazado. */
export function duplicateItems(b: Board, ids: string[], dx = 0.03, dy = 0.03): { board: Board; ids: string[] } {
  const sel = new Set(expandSelection(b, ids));
  if (!sel.size) return { board: b, ids: [] };
  const regroup = new Map<string, string>();
  const copies: Item[] = b.items.filter((i) => sel.has(i.id)).map((it) => {
    const group = it.group ? (regroup.get(it.group) ?? regroup.set(it.group, newId()).get(it.group)!) : it.group;
    return { ...structuredCloneSafe(it), id: newId(), group, locked: false, x: it.x + dx, y: it.y + dy } as Item;
  });
  const top = Math.max(...b.items.map((it, i) => (sel.has(it.id) ? i : -1)));
  const items = b.items.slice();
  items.splice(top + 1, 0, ...copies);
  return { board: { ...b, items }, ids: copies.map((c) => c.id) };
}

function structuredCloneSafe<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

// ---------- transformar ----------

/** Mueve (los bloqueados no). */
export function moveItems(b: Board, ids: string[], dx: number, dy: number): Board {
  return patch(b, new Set(expandSelection(b, ids)), (it) => (it.locked ? it : { ...it, x: it.x + dx, y: it.y + dy }));
}

/** Escala la selección alrededor de `origin` (por defecto el centro de su caja). Nada se deforma. */
export function scaleItems(b: Board, ids: string[], s: number, origin?: { x: number; y: number }, measure?: Measure): Board {
  const sel = expandSelection(b, ids);
  const r = boardRatio(b);
  const free = b.items.filter((i) => sel.includes(i.id) && !i.locked);
  if (!free.length || s <= 0) return b;
  const o = origin ?? center(unionRect(free.map((i) => itemAABB(i, r, measure))));
  return patch(b, new Set(free.map((i) => i.id)), (it) => {
    const x = o.x + (it.x - o.x) * s, y = o.y + (it.y - o.y) * s;
    if (it.kind === "photo") return { ...it, x, y, w: it.w * s, h: it.h * s };
    if (it.kind === "shape") return { ...it, x, y, w: it.w * s, h: it.h * s, strokeWidth: it.strokeWidth === undefined ? undefined : it.strokeWidth * s };
    return { ...it, x, y, size: it.size * s };
  });
}

/** Gira la selección `deg` grados alrededor de `origin` (por defecto su centro): cada elemento gira y se recoloca. */
export function rotateItems(b: Board, ids: string[], deg: number, origin?: { x: number; y: number }, measure?: Measure): Board {
  const sel = expandSelection(b, ids);
  const r = boardRatio(b);
  const free = b.items.filter((i) => sel.includes(i.id) && !i.locked);
  if (!free.length) return b;
  const o = origin ?? center(unionRect(free.map((i) => itemAABB(i, r, measure))));
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  return patch(b, new Set(free.map((i) => i.id)), (it) => {
    const c = center(itemRect(it, r, measure));
    // en px proporcionales: x × ratio
    const X = (c.x - o.x) * r, Y = c.y - o.y;
    const nx = o.x + (X * cos - Y * sin) / r, ny = o.y + X * sin + Y * cos;
    return { ...it, x: it.x + nx - c.x, y: it.y + ny - c.y, rot: norm((it.rot ?? 0) + deg) };
  });
}

const norm = (d: number) => { const x = ((d % 360) + 540) % 360 - 180; return Math.abs(x) < 1e-9 ? 0 : x; };
const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

// ---------- alinear y distribuir ----------

export type AlignEdge = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

/** Alinea. Con un solo elemento (o grupo) o con `to: "page"`, respecto a su página; si no, a la selección. */
export function alignItems(b: Board, ids: string[], edge: AlignEdge, to: "selection" | "page" = "selection", measure?: Measure): Board {
  const r = boardRatio(b);
  const us = units(b, ids).map((u) => ({ u, box: unionRect(u.map((i) => itemAABB(i, r, measure))) }));
  if (!us.length) return b;
  let ref: Rect;
  if (to === "page" || us.length === 1) {
    const c = center(us[0].box);
    const p = Math.max(0, Math.min(b.pages - 1, Math.floor(c.x)));
    ref = { x: p, y: 0, w: 1, h: 1 };
  } else ref = unionRect(us.map((x) => x.box));
  let out = b;
  for (const { u, box } of us) {
    let dx = 0, dy = 0;
    if (edge === "left") dx = ref.x - box.x;
    else if (edge === "right") dx = ref.x + ref.w - (box.x + box.w);
    else if (edge === "hcenter") dx = ref.x + ref.w / 2 - (box.x + box.w / 2);
    else if (edge === "top") dy = ref.y - box.y;
    else if (edge === "bottom") dy = ref.y + ref.h - (box.y + box.h);
    else dy = ref.y + ref.h / 2 - (box.y + box.h / 2);
    out = moveItems(out, u.map((i) => i.id), dx, dy);
  }
  return out;
}

/** Reparte 3 o más con el mismo hueco entre ellos, en horizontal («h») o vertical («v»). */
export function distributeItems(b: Board, ids: string[], axis: "h" | "v", measure?: Measure): Board {
  const r = boardRatio(b);
  const us = units(b, ids).map((u) => ({ u, box: unionRect(u.map((i) => itemAABB(i, r, measure))) }));
  if (us.length < 3) return b;
  const pos = (x: Rect) => (axis === "h" ? x.x : x.y), len = (x: Rect) => (axis === "h" ? x.w : x.h);
  us.sort((a, c) => pos(a.box) + len(a.box) / 2 - (pos(c.box) + len(c.box) / 2));
  const start = pos(us[0].box), end = Math.max(...us.map((x) => pos(x.box) + len(x.box)));
  const gap = (end - start - us.reduce((a, x) => a + len(x.box), 0)) / (us.length - 1);
  let out = b, at = start;
  for (const { u, box } of us) {
    const d = at - pos(box);
    out = moveItems(out, u.map((i) => i.id), axis === "h" ? d : 0, axis === "v" ? d : 0);
    at += len(box) + gap;
  }
  return out;
}

// ---------- imán ----------

/** Guía a dibujar: `axis: "x"` = línea vertical en x = `at` desde y=`from` hasta `to`; `"y"` = horizontal. */
export interface Guide { axis: "x" | "y"; at: number; from: number; to: number; kind: "page" | "item" }

export interface SnapResult { dx: number; dy: number; guides: Guide[] }

/** Imán al mover la selección `ids` un (dx, dy) propuesto desde su posición actual: engancha bordes y centros a
 *  los de la página (y cada página del carrusel) y de los demás elementos visibles. `threshold` en altos de
 *  página (≈ 1,2 % por defecto). Devuelve el desplazamiento corregido y las guías que hay que dibujar. */
export function snap(b: Board, ids: string[], dx: number, dy: number, opts: { threshold?: number; measure?: Measure } = {}): SnapResult {
  const r = boardRatio(b), t = opts.threshold ?? 0.012;
  const sel = new Set(expandSelection(b, ids));
  const moving = b.items.filter((i) => sel.has(i.id));
  if (!moving.length) return { dx, dy, guides: [] };
  const box0 = unionRect(moving.map((i) => itemAABB(i, r, opts.measure)));
  const box = { ...box0, x: box0.x + dx, y: box0.y + dy };
  const others = b.items.filter((i) => !sel.has(i.id) && !i.hidden).map((i) => itemAABB(i, r, opts.measure));
  type T = { v: number; from: number; to: number; kind: "page" | "item" };
  const xs: T[] = [], ys: T[] = [];
  for (let p = 0; p <= b.pages; p++) {
    xs.push({ v: p, from: 0, to: 1, kind: "page" });
    if (p < b.pages) xs.push({ v: p + 0.5, from: 0, to: 1, kind: "page" });
  }
  for (const v of [0, 0.5, 1]) ys.push({ v, from: 0, to: b.pages, kind: "page" });
  for (const o of others) {
    for (const v of [o.x, o.x + o.w / 2, o.x + o.w]) xs.push({ v, from: o.y, to: o.y + o.h, kind: "item" });
    for (const v of [o.y, o.y + o.h / 2, o.y + o.h]) ys.push({ v, from: o.x, to: o.x + o.w, kind: "item" });
  }
  const best = (mine: number[], targets: T[], thr: number) => {
    let d = Infinity;
    for (const m of mine) for (const tg of targets) { const k = tg.v - m; if (Math.abs(k) <= thr && Math.abs(k) < Math.abs(d)) d = k; }
    return d;
  };
  const mx = [box.x, box.x + box.w / 2, box.x + box.w], my = [box.y, box.y + box.h / 2, box.y + box.h];
  const sx = best(mx, xs, t / r), sy = best(my, ys, t);
  const fx = Number.isFinite(sx) ? sx : 0, fy = Number.isFinite(sy) ? sy : 0;
  const fin = { x: box.x + fx, y: box.y + fy, w: box.w, h: box.h };
  const guides: Guide[] = [];
  const eps = 1e-6;
  if (Number.isFinite(sx)) {
    const mine = [fin.x, fin.x + fin.w / 2, fin.x + fin.w];
    for (const tg of xs) if (mine.some((m) => Math.abs(m - tg.v) < eps))
      guides.push({ axis: "x", at: tg.v, from: Math.min(tg.from, fin.y), to: Math.max(tg.to, fin.y + fin.h), kind: tg.kind });
  }
  if (Number.isFinite(sy)) {
    const mine = [fin.y, fin.y + fin.h / 2, fin.y + fin.h];
    for (const tg of ys) if (mine.some((m) => Math.abs(m - tg.v) < eps))
      guides.push({ axis: "y", at: tg.v, from: Math.min(tg.from, fin.x), to: Math.max(tg.to, fin.x + fin.w), kind: tg.kind });
  }
  return { dx: dx + fx, dy: dy + fy, guides: dedupe(guides) };
}

function dedupe(gs: Guide[]): Guide[] {
  const m = new Map<string, Guide>();
  for (const g of gs) {
    const k = `${g.axis}:${g.at.toFixed(5)}`;
    const o = m.get(k);
    if (!o) m.set(k, g);
    else m.set(k, { ...o, from: Math.min(o.from, g.from), to: Math.max(o.to, g.to), kind: o.kind === "page" ? "page" : g.kind });
  }
  return [...m.values()];
}
