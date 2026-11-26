// Motor de «Diseñar» (fase 2): capas, imán, texto, formas, marca, redimensionar, normalizar, animación,
// GIF, PDF y plantillas. Todo en Node; el pintado se prueba con un contexto 2D falso que solo anota llamadas.
import { describe, expect, it, beforeEach } from "vitest";
import { paintBoard, itemBox, newId, type Board, type Item, type PhotoItem, type ShapeItem, type TextItem } from "../packages/core/src/design/board";
import * as L from "../packages/core/src/design/layers";
import { normalizeBoard, parseBoard, serializeBoard } from "../packages/core/src/design/normalize";
import { resizeBoard, safeZone, DESIGN_FORMATS } from "../packages/core/src/design/resize";
import * as B from "../packages/core/src/design/brand";
import { arcLayout, luminance, mix, parseColor, resolveTextStyle, TEXT_EFFECTS } from "../packages/core/src/design/text";
import { polygonPoints, starPoints, arrowGeometry } from "../packages/core/src/design/shapes";
import { animAt, animEnd } from "../packages/core/src/design/anim";
import { autoAnimate, motionPlan, musicEnvelope } from "../packages/core/src/design/export";
import { encodeGif, lzwEncode } from "../packages/core/src/design/gif";
import { buildPdf, mmToPt } from "../packages/core/src/design/pdf";
import { allTemplates, templateById, templatesIn, TEMPLATES } from "../packages/core/src/design/templates";
import { PRO_TEMPLATES, VIDEO_TEMPLATES } from "../packages/core/src/design/pro-templates";
import { setPlatform, type Platform } from "../packages/core/src/platform";

const photo = (x: number, y: number, w: number, h: number, o: Partial<PhotoItem> = {}): PhotoItem =>
  ({ kind: "photo", id: newId(), photo: "f", x, y, w, h, zoom: 1, ox: 0, oy: 0, radius: 0, ...o });
const shape = (x: number, y: number, w: number, h: number, o: Partial<ShapeItem> = {}): ShapeItem =>
  ({ kind: "shape", id: newId(), shape: "rect", x, y, w, h, fill: "#ff0000", ...o });
const text = (s: string, x: number, y: number, o: Partial<TextItem> = {}): TextItem =>
  ({ kind: "text", id: newId(), text: s, x, y, size: 0.05, font: "moderna", color: "#ffffff", weight: 600, align: "center", box: null, shadow: false, spacing: 0, upper: false, ...o });
const board = (items: Item[], o: Partial<Board> = {}): Board => ({ format: "1:1", pages: 1, bg: "#ffffff", items, ...o });
const close = (a: number, b: number, e = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(e);

/** Contexto 2D falso: mide 0,56 em por letra (como `approxMeasure`) y acepta cualquier llamada. */
function fakeCtx() {
  const calls: string[] = [];
  let font = "10px x";
  const target: Record<string, unknown> = {
    measureText: (s: string) => ({ width: [...s].length * 0.56 * parseFloat(/(\d+(\.\d+)?)px/.exec(font)?.[1] ?? "10") }),
    createLinearGradient: () => ({ addColorStop() {} }),
  };
  const ctx = new Proxy(target, {
    get(t, k: string) {
      if (k in t) return t[k];
      return (...a: unknown[]) => { calls.push(k); return a.length ? undefined : undefined; };
    },
    set(t, k: string, v) { if (k === "font") font = v; t[k] = v; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

// ---------- normalizar ----------
describe("normalizar diseños", () => {
  it("un diseño de la fase 1 queda igual (sin campos nuevos que cambien el pintado)", () => {
    const old = {
      format: "4:5", pages: 2, bg: "#000", grad: null, items: [
        { kind: "photo", id: "a", photo: "p1", x: 0, y: 0, w: 1, h: 1, zoom: 1.2, ox: 0.1, oy: 0, radius: 0, frame: "arch", border: 0.02, borderColor: "#fff" },
        { kind: "text", id: "b", text: "Hola", x: 0.5, y: 0.5, size: 0.05, font: "elegante", color: "#fff", weight: 400, align: "left", box: null, shadow: true, spacing: 0.1, upper: true, rot: 5 },
        { kind: "sticker", id: "c", emoji: "✨", x: 1.2, y: 0.3, size: 0.07 },
        { kind: "shape", id: "d", shape: "line", x: 0, y: 0.5, w: 1, h: 0.01, fill: "#111", radius: 0.3 },
      ],
    };
    const b = normalizeBoard(JSON.parse(JSON.stringify(old)));
    expect(b.v).toBe(2);
    const { v, ...rest } = b;
    expect(rest).toEqual(old);
  });
  it("rellena lo que falta y descarta lo que no entiende", () => {
    const b = normalizeBoard({ pages: 99, items: [{ kind: "text", text: "x", font: "inventada" }, { kind: "video" }, null, { kind: "shape", shape: "rombo" }] });
    expect(b.pages).toBe(10);
    expect(b.format).toBe("4:5");
    expect(b.items).toHaveLength(2);
    const t = b.items[0] as TextItem;
    expect(t.font).toBe("moderna");
    expect(t.align).toBe("center");
    expect(t.id).toBeTruthy();
    expect((b.items[1] as ShapeItem).shape).toBe("rect");
    expect(normalizeBoard(null).items).toEqual([]);
  });
  it("ids repetidos se rehacen y guardar/leer es estable", () => {
    const b = normalizeBoard({ items: [{ kind: "sticker", id: "x" }, { kind: "sticker", id: "x" }] });
    expect(new Set(b.items.map((i) => i.id)).size).toBe(2);
    expect(parseBoard(serializeBoard(b))).toEqual(b);
  });
  it("conserva los campos nuevos válidos", () => {
    const b = normalizeBoard({ items: [{ kind: "text", id: "t", text: "a", locked: true, hidden: true, group: "g", opacity: 3, effect: "neon", curve: 90, anim: { kind: "zoom", delay: -1 } }] });
    const t = b.items[0] as TextItem;
    expect([t.locked, t.hidden, t.group, t.opacity, t.effect, t.curve]).toEqual([true, true, "g", 1, "neon", 90]);
    expect(t.anim).toEqual({ kind: "zoom", delay: 0 });
  });
});

// ---------- capas ----------
describe("capas", () => {
  it("agrupar junta las capas, duplicar crea otro grupo, desagrupar los suelta", () => {
    const a = shape(0.1, 0.1, 0.2, 0.2), x = shape(0.5, 0.5, 0.1, 0.1), c = shape(0.6, 0.1, 0.2, 0.2);
    const { board: g, group } = L.groupItems(board([a, x, c]), [a.id, c.id]);
    expect(group).toBeTruthy();
    expect(g.items.map((i) => i.id)).toEqual([x.id, a.id, c.id]);
    expect(L.groupIds(g, a.id).sort()).toEqual([a.id, c.id].sort());
    const d = L.duplicateItems(g, [a.id]);
    expect(d.ids).toHaveLength(2);
    const copies = d.board.items.filter((i) => d.ids.includes(i.id));
    expect(copies[0].group).toBe(copies[1].group);
    expect(copies[0].group).not.toBe(group);
    close(copies[0].x, a.x + 0.03);
    const u = L.ungroupItems(g, [a.id]);
    expect(u.items.every((i) => !i.group)).toBe(true);
  });
  it("mover arrastra el grupo y respeta lo bloqueado", () => {
    const a = shape(0.1, 0.1, 0.2, 0.2, { group: "g" }), c = shape(0.6, 0.1, 0.2, 0.2, { group: "g" }), k = shape(0, 0, 0.1, 0.1, { locked: true });
    const m = L.moveItems(board([a, c, k]), [a.id, k.id], 0.1, 0);
    close(m.items[0].x, 0.2); close(m.items[1].x, 0.7); close(m.items[2].x, 0);
    expect(L.deleteItems(board([a, k]), [k.id]).items).toHaveLength(2);
  });
  it("ocultar y bloquear afectan al grupo entero; los ocultos no se tocan", () => {
    const a = shape(0, 0, 1, 1, { group: "g" }), c = shape(0, 0, 0.5, 0.5, { group: "g" });
    const h = L.setHidden(board([a, c]), [a.id], true);
    expect(h.items.every((i) => i.hidden)).toBe(true);
    expect(L.setLocked(board([a, c]), [c.id], true).items.every((i) => i.locked)).toBe(true);
  });
  it("escalar el grupo al doble alrededor de su centro", () => {
    const a = shape(0.4, 0.4, 0.1, 0.1), c = shape(0.5, 0.5, 0.1, 0.1);
    const s = L.scaleItems(board([a, c]), [a.id, c.id], 2);
    const [p, q] = s.items as ShapeItem[];
    close(p.x, 0.3); close(p.w, 0.2); close(q.x, 0.5); close(q.y, 0.5); close(q.w, 0.2);
  });
  it("girar el grupo 90° recoloca y gira cada elemento", () => {
    const a = shape(0.1, 0.45, 0.1, 0.1), c = shape(0.8, 0.45, 0.1, 0.1); // centros en (0.15,.5) y (0.85,.5)
    const r = L.rotateItems(board([a, c]), [a.id, c.id], 90);
    const [p, q] = r.items as ShapeItem[];
    close(p.x + 0.05, 0.5, 1e-9); close(p.y + 0.05, 0.15, 1e-9); close(q.y + 0.05, 0.85, 1e-9);
    expect(p.rot).toBe(90);
  });
  it("alinear a la izquierda de la selección y centrar en la página", () => {
    const a = shape(0.2, 0.1, 0.2, 0.1), c = shape(0.5, 0.4, 0.1, 0.1);
    const l = L.alignItems(board([a, c]), [a.id, c.id], "left");
    close(l.items[1].x, 0.2);
    const pg = L.alignItems(board([a], { pages: 3 }), [a.id], "hcenter");
    close(pg.items[0].x, 0.4);
    const second = L.alignItems(board([shape(1.1, 0, 0.2, 0.2)], { pages: 3 }), [], "right");
    expect(second.items[0].x).toBe(1.1); // sin selección no hace nada
  });
  it("distribuir deja huecos iguales", () => {
    const a = shape(0, 0, 0.1, 0.1), c = shape(0.2, 0, 0.1, 0.1), d = shape(0.9, 0, 0.1, 0.1);
    const r = L.distributeItems(board([d, a, c]), [a.id, c.id, d.id], "h");
    const xs = (r.items as ShapeItem[]).map((i) => i.x).sort();
    close(xs[1] - xs[0], xs[2] - xs[1]);
    close(xs[1], 0.45);
  });
  it("caja del texto sin lienzo = caja pintada (con el mismo medidor)", () => {
    const { ctx } = fakeCtx();
    const t = text("Hola mundo\nsegunda", 0.3, 0.6, { align: "left", spacing: 0 });
    const b = itemBox(ctx, t, 1000, 1000);
    const r = L.itemRect(t, 1);
    close(r.x * 1000, b.x, 1e-6); close(r.w * 1000, b.w, 1e-6); close(r.h * 1000, b.h, 1e-6);
  });
});

describe("imán", () => {
  it("engancha el centro de la página y devuelve la guía", () => {
    const a = shape(0.1, 0.1, 0.2, 0.2);
    const r = L.snap(board([a]), [a.id], 0.295, 0); // centro en .495 → .5
    close(r.dx, 0.3);
    expect(r.guides.some((g) => g.axis === "x" && Math.abs(g.at - 0.5) < 1e-9 && g.kind === "page")).toBe(true);
  });
  it("engancha el borde de otro elemento y no se engancha lejos", () => {
    const a = shape(0.1, 0.1, 0.1, 0.1), o = shape(0.6, 0.6, 0.2, 0.2);
    const r = L.snap(board([a, o]), [a.id], 0, 0.494); // borde inferior .694 → .7? (centro de o)
    close(r.dy, 0.5);
    expect(r.guides.find((g) => g.axis === "y")?.kind).toBe("item");
    const far = L.snap(board([a, o]), [a.id], 0.03, 0.03);
    expect(far.guides).toEqual([]);
    close(far.dx, 0.03);
  });
  it("en un carrusel engancha también el corte entre páginas", () => {
    const a = shape(0.5, 0.3, 0.3, 0.2);
    const r = L.snap(board([a], { pages: 3 }), [a.id], 0.195, 0);
    close(r.dx, 0.2);
  });
});

// ---------- texto y formas ----------
describe("texto", () => {
  it("efectos con nombre", () => {
    expect(TEXT_EFFECTS.length).toBeGreaterThanOrEqual(6);
    const base = { color: "#ff0080", shadow: false };
    expect(resolveTextStyle({ ...base, effect: "neon" }).shadows.length).toBe(3);
    expect(resolveTextStyle({ ...base, effect: "eco" }).echoes.length).toBe(2);
    expect(resolveTextStyle({ ...base, effect: "hueco" }).fill).toBeNull();
    expect(resolveTextStyle({ ...base, shadow: true }).shadows).toHaveLength(1);
    expect(resolveTextStyle({ ...base, stroke: { color: "#000", width: 0.05 } }).stroke?.outside).toBe(true);
  });
  it("texto en arco: simétrico, centrado y con flecha", () => {
    const { glyphs, sagitta } = arcLayout([10, 10, 10, 10], 90);
    close(glyphs[0].x, -glyphs[3].x); close(glyphs[0].y, glyphs[3].y);
    expect(glyphs[0].angle).toBeLessThan(0);
    expect(sagitta).toBeGreaterThan(0);
    expect(glyphs[1].y).toBeLessThan(glyphs[0].y); // ∩: el centro más alto
    expect(arcLayout([5, 5], 0).sagitta).toBe(0);
  });
  it("colores", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("rgba(10, 20, 30, .5)")).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(luminance("#000")).toBe(0);
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});

describe("formas", () => {
  it("estrella, polígono y flecha", () => {
    expect(starPoints(0, 0, 10, 10, 5)).toHaveLength(10);
    const hex = polygonPoints(0, 0, 10, 10, 6);
    expect(hex).toHaveLength(6);
    close(hex[0][0], 5); close(hex[0][1], 0);
    const a = arrowGeometry(0, 0, 100, 20, 4);
    expect(a.head[0]).toEqual([100, 10]);
  });
});

describe("pintado (contexto falso)", () => {
  it("todas las plantillas se pintan sin errores, en estado final y animadas", () => {
    const { ctx, calls } = fakeCtx();
    for (const t of allTemplates()) {
      const b = t.build(["a", "b", "c"]);
      paintBoard(ctx, b, new Map(), 100, 125);
      paintBoard(ctx, b, new Map(), 100, 125, { time: 0.2 });
    }
    expect(calls.length).toBeGreaterThan(100);
  });
  it("formas nuevas, texto curvo y efectos se pintan", () => {
    const { ctx, calls } = fakeCtx();
    const items: Item[] = ["rect", "roundrect", "circle", "line", "arrow", "star", "polygon", "frame"].map((s) =>
      shape(0, 0, 0.3, 0.2, { shape: s as ShapeItem["shape"], grad: { to: "#00f", angle: 45 }, stroke: "#000", strokeWidth: 0.01 }));
    for (const e of TEXT_EFFECTS) items.push(text("Hola", 0.5, 0.5, { effect: e.id, curve: 60, box: "#000" }));
    items.push(shape(0, 0, 1, 1, { hidden: true }));
    paintBoard(ctx, board(items), new Map(), 200, 200);
    expect(calls).toContain("strokeText");
    expect(calls.filter((c) => c === "fill").length).toBeGreaterThan(5);
  });
});

// ---------- redimensionar ----------
describe("redimensionar", () => {
  it("de post 4:5 a historia 9:16", () => {
    const bleed = photo(0, 0, 1, 1), band = shape(0, 0.9, 1, 0.1), mid = photo(0.25, 0.25, 0.5, 0.4), t = text("A", 0.5, 0.2);
    const b = resizeBoard(board([bleed, band, mid, t], { format: "ig-feed" }), "ig-story");
    expect(b.format).toBe("ig-story");
    const [p0, p1, p2, p3] = b.items as [PhotoItem, ShapeItem, PhotoItem, TextItem];
    expect(p0).toEqual(bleed);                  // sigue a sangre
    close(p1.w, 1); close(p1.y + p1.h, 1);      // banda pegada abajo, todo el ancho
    expect(p1.h).toBeLessThan(0.1);
    const s = (1080 / 1920) / (1080 / 1350);    // 0,703
    close(p2.h, 0.4 * s); close(p2.w, 0.5, 1e-9); // mismo ancho relativo (deja de deformarse en px)
    close(p2.x + p2.w / 2, 0.5); close(p2.y + p2.h / 2, 0.45);
    close(p3.size, 0.05 * s);
  });
  it("de cuadrado a horizontal: el tamaño en px se mantiene y lo pegado al borde sigue pegado", () => {
    const left = photo(0, 0.2, 0.3, 0.3);
    const b = resizeBoard(board([left], { format: "ig-square" }), "x-post");
    const p = b.items[0] as PhotoItem;
    expect(p.x).toBe(0);
    close(p.h, 0.3);
    close(p.w * 16 / 9, 0.3, 1e-9); // mismo ancho en px relativos al alto
  });
  it("mismo formato o carrusel: cruza páginas igual", () => {
    const b = board([photo(0, 0, 3, 1)], { pages: 3, format: "ig-feed" });
    expect(resizeBoard(b, "ig-square").items[0]).toEqual(b.items[0]);
    expect(resizeBoard(b, "ig-feed")).toEqual(b);
  });
  it("formatos de redes y zonas seguras", () => {
    expect(DESIGN_FORMATS.length).toBeGreaterThanOrEqual(10);
    expect(safeZone("ig-story").bottom).toBeGreaterThan(0.1);
    expect(safeZone("ig-feed").top).toBe(0);
  });
});

// ---------- marca ----------
describe("kit de marca", () => {
  let kv: Map<string, unknown>;
  beforeEach(() => {
    kv = new Map();
    setPlatform({ kvGet: async (k: string) => (kv.get(k) as never) ?? null, kvSet: async (k: string, v: unknown) => void kv.set(k, v) } as unknown as Platform);
  });
  it("guardar, listar, activa y borrar", async () => {
    const a = { ...B.newBrand("Estudio"), colors: ["#123456", "nada"] };
    await B.saveBrand(a);
    const list = await B.listBrands();
    expect(list).toHaveLength(1);
    expect(list[0].colors).toEqual(["#123456"]);
    expect((await B.getActiveBrand())?.id).toBe(a.id);
    const b2 = B.newBrand("Otra");
    await B.saveBrand(b2);
    await B.setActiveBrand(b2.id);
    expect((await B.getActiveBrand())?.name).toBe("Otra");
    await B.deleteBrand(b2.id);
    expect((await B.getActiveBrand())?.id).toBe(a.id);
  });
  it("recolorea por claridad, conserva transparencia, blanco/negro y aplica fuentes", () => {
    const brand = { ...B.newBrand(), colors: ["#F50D8A", "#2a0f3d", "#ffe0f0"], titleFont: "elegante" as const, bodyFont: "maquina" as const };
    const src = board([
      shape(0, 0, 1, 1, { fill: "#222244" }),                 // oscuro → #2a0f3d
      shape(0, 0, 1, 1, { fill: "rgba(200,40,40,0.5)" }),     // medio → #F50D8A con alfa
      text("Título", 0.5, 0.2, { size: 0.08, color: "#ffffff" }),
      text("texto", 0.5, 0.8, { size: 0.02, color: "#eeeedd" }), // claro → #ffe0f0
    ], { bg: "#ffffff" });
    const out = B.applyBrand(src, brand);
    const [d, m, t1, t2] = out.items as [ShapeItem, ShapeItem, TextItem, TextItem];
    expect(d.fill).toBe("#2a0f3d");
    expect(m.fill).toBe("rgba(245,13,138,0.5)");
    expect(t1.color).toBe("#ffffff");
    expect(out.bg).toBe("#ffffff");
    expect(t2.color).toBe("#ffe0f0");
    expect([t1.font, t2.font]).toEqual(["elegante", "maquina"]);
    expect((src.items[0] as ShapeItem).fill).toBe("#222244"); // no toca el original
  });
  it("logo en una esquina", () => {
    const brand = B.newBrand();
    const out = B.addBrandLogo(board([], { pages: 2 }), brand, { page: 1, corner: "abajo-derecha", size: 0.2 });
    const l = out.items[0] as PhotoItem;
    expect(l.photo).toBe(B.brandLogoKey(brand));
    expect(l.fit).toBe("contain");
    close(l.x + l.w, 1.95);
  });
});

// ---------- animación y vídeo ----------
describe("animación", () => {
  it("entrada de aparecer, deslizar y zoom lento", () => {
    expect(animAt({ kind: "aparecer", delay: 1 }, 0.5).alpha).toBe(0);
    expect(animAt({ kind: "aparecer", delay: 1 }, 5).alpha).toBe(1);
    expect(animAt({ kind: "deslizar", dir: "derecha" }, 0).dx).toBeGreaterThan(0);
    expect(animAt({ kind: "lento", dur: 2 }, 1).scale).toBeCloseTo(1.06);
    expect(animAt(null, 0)).toEqual({ alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0 });
    expect(animEnd([{ anim: { kind: "zoom", delay: 1, dur: 0.5 } }, {}])).toBe(1.5);
  });
  it("animar todo escalonado por página y plan del vídeo", () => {
    const b = autoAnimate(board([photo(0, 0, 1, 1), text("a", 0.5, 0.5), text("b", 1.5, 0.5)], { pages: 2 }), "zoom", 0.2);
    expect(b.items[0].anim).toBeNull();
    expect(b.items[1].anim?.delay).toBe(0.2);
    expect(b.items[2].anim?.delay).toBe(0);
    const plan = motionPlan(b);
    expect(plan.segs.map((s) => s.page)).toEqual([0, 1]);
    expect(plan.total).toBeCloseTo(5);
    expect(motionPlan(b, { perPage: 2, pages: [1] }).total).toBe(2);
  });
  it("volumen de la música: fundido de entrada y salida", () => {
    expect(musicEnvelope(10, { volume: 0.8, fadeIn: 1, fadeOut: 2 })).toEqual([[0, 0], [1, 0.8], [8, 0.8], [10, 0]]);
  });
});

// ---------- GIF ----------
/** Decodificador LZW de GIF estándar (para comprobar el codificador). */
function lzwDecode(data: Uint8Array, minCode: number, count: number): number[] {
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, next = eoi + 1, pos = 0;
  const read = () => { let v = 0; for (let i = 0; i < size; i++, pos++) v |= ((data[pos >> 3] >> (pos & 7)) & 1) << i; return v; };
  let dict: number[][] = [];
  const reset = () => { dict = []; for (let i = 0; i < clear; i++) dict[i] = [i]; size = minCode + 1; next = eoi + 1; };
  reset();
  const out: number[] = [];
  let prev: number[] | null = null;
  while (out.length <= count) {
    const code = read();
    if (code === clear) { reset(); prev = null; continue; }
    if (code === eoi) break;
    let entry: number[];
    if (dict[code]) entry = dict[code];
    else if (code === next && prev) entry = [...prev, prev[0]];
    else throw new Error(`código malo ${code}`);
    out.push(...entry);
    if (prev && next < 4096) { dict[next++] = [...prev, entry[0]]; if (next === 1 << size && size < 12) size++; }
    prev = entry;
  }
  return out;
}

describe("GIF", () => {
  it("LZW de ida y vuelta (también al llenar el diccionario)", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (const n of [1, 300, 70000]) {
      const idx = new Uint8Array(n).map((_, i) => (rnd() < 0.7 ? i % 7 : Math.floor(rnd() * 256)));
      expect(lzwDecode(lzwEncode(idx), 8, n)).toEqual([...idx]);
    }
  });
  it("archivo GIF89a con bucle y fotogramas", () => {
    const w = 8, h = 4;
    const fr = (c: number) => ({ data: new Uint8ClampedArray(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : c)), delay: 10 });
    const g = encodeGif([fr(0), fr(255)], w, h);
    expect(new TextDecoder().decode(g.slice(0, 6))).toBe("GIF89a");
    expect(g[6] | (g[7] << 8)).toBe(8);
    expect(g[g.length - 1]).toBe(0x3b);
    expect(new TextDecoder().decode(g).includes("NETSCAPE2.0")).toBe(true);
  });
});

// ---------- PDF ----------
describe("PDF", () => {
  it("una página por página, tabla xref correcta", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const pdf = buildPdf([0, 1, 2].map(() => ({ jpeg, pxW: 2480, pxH: 3100, ptW: mmToPt(210), ptH: mmToPt(262.5) })), { title: "Boda (Ana)" });
    const s = new TextDecoder("latin1").decode(pdf);
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(s).toContain("/Count 3");
    expect(s).toContain("/Title (Boda \\(Ana\\))");
    const startxref = Number(/startxref\n(\d+)/.exec(s)![1]);
    expect(s.slice(startxref, startxref + 4)).toBe("xref");
    const offs = s.slice(startxref).split("\n").slice(3).filter((l) => / n $/.test(l)).map((l) => Number(l.slice(0, 10)));
    expect(offs).toHaveLength(12);
    offs.forEach((o, i) => expect(s.slice(o, o + 10)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
    close(mmToPt(25.4), 72);
  });
});

// ---------- plantillas ----------
describe("plantillas Pro", () => {
  it("al menos 20 nuevas, en sus categorías, ids únicos y registradas", () => {
    expect(PRO_TEMPLATES.length).toBeGreaterThanOrEqual(20);
    for (const c of ["bodas", "eventos", "deporte", "negocio", "portfolio"] as const) expect(templatesIn(c).length).toBeGreaterThanOrEqual(4);
    expect(VIDEO_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    const ids = allTemplates().map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(templateById("p-boda-save").name).toBe("Reserva la fecha");
    expect(templateById("sangre")).toBe(TEMPLATES[0]);
  });
  it("cada plantilla genera un tablero válido (normalizar no cambia nada)", () => {
    for (const t of [...PRO_TEMPLATES, ...VIDEO_TEMPLATES]) {
      for (const p of [[], ["a"], ["a", "b", "c", "d", "e", "f", "g", "h"]]) {
        const b = t.build(p);
        expect(b.pages).toBeGreaterThanOrEqual(1);
        const { v, ...n } = normalizeBoard(JSON.parse(JSON.stringify(b)));
        expect(n).toEqual(JSON.parse(JSON.stringify({ grad: null, ...b })));
      }
    }
  });
  it("las historias no ponen texto donde lo tapa la red", () => {
    for (const t of [...PRO_TEMPLATES, ...VIDEO_TEMPLATES].filter((x) => x.format === "9:16")) {
      const z = safeZone("ig-story");
      for (const it of t.build(["a", "b"]).items) if (it.kind === "text") {
        expect(it.y, `${t.id}: ${it.text}`).toBeGreaterThan(z.top);
        expect(it.y, `${t.id}: ${it.text}`).toBeLessThan(1 - z.bottom);
      }
    }
  });
  it("las de vídeo traen animaciones", () => {
    for (const t of VIDEO_TEMPLATES) {
      expect(t.video).toBe(true);
      expect(t.build(["a"]).items.some((i) => i.anim && i.anim.kind !== "ninguna")).toBe(true);
    }
  });
});
