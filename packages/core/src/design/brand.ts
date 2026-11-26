// Kit de marca: colores, fuentes y logo del usuario, guardados con platform.kvGet/kvSet. `applyBrand` recolorea
// un diseño con la marca (pura, sin DOM). El logo se guarda como data URL; para pintarlo, la interfaz lo carga
// como imagen y lo mete en el mapa de imágenes con la clave `brandLogoKey(brand)`.
import { formatById } from "../engine/formats";
import { platform } from "../platform";
import { FONTS, newId, type Board, type FontId, type Item, type PhotoItem } from "./board";
import { formatColor, luminance, parseColor } from "./text";

export interface Brand {
  id: string;
  name: string;
  /** De 1 a 8 colores; el orden no importa (se reparten por claridad). */
  colors: string[];
  titleFont: FontId;
  bodyFont: FontId;
  /** Logo como data URL (PNG con transparencia, mejor). */
  logo: string | null;
}

const KEY = "pf.design.brands";
const ACTIVE = "pf.design.brand.active";

export function newBrand(name = "Mi marca"): Brand {
  return { id: newId(), name, colors: ["#F50D8A", "#7B2FF7", "#111111", "#ffffff"], titleFont: "jakarta", bodyFont: "sistema", logo: null };
}

/** Limpia lo leído (marcas viejas o a medias). */
export function normalizeBrand(raw: unknown): Brand | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Brand>;
  const colors = (Array.isArray(r.colors) ? r.colors : []).filter((c): c is string => typeof c === "string" && !!parseColor(c)).slice(0, 8);
  const font = (f: unknown, d: FontId): FontId => (typeof f === "string" && f in FONTS ? (f as FontId) : d);
  return {
    id: typeof r.id === "string" && r.id ? r.id : newId(),
    name: typeof r.name === "string" && r.name.trim() ? r.name : "Mi marca",
    colors: colors.length ? colors : ["#111111", "#ffffff"],
    titleFont: font(r.titleFont, "jakarta"),
    bodyFont: font(r.bodyFont, "sistema"),
    logo: typeof r.logo === "string" && r.logo.startsWith("data:") ? r.logo : null,
  };
}

export async function listBrands(): Promise<Brand[]> {
  const raw = await platform.kvGet<unknown[]>(KEY);
  return (Array.isArray(raw) ? raw : []).map(normalizeBrand).filter((b): b is Brand => !!b);
}

export async function saveBrand(b: Brand): Promise<Brand[]> {
  const clean = normalizeBrand(b)!;
  const all = (await listBrands()).filter((x) => x.id !== clean.id);
  all.push(clean);
  await platform.kvSet(KEY, all);
  if (!(await platform.kvGet<string>(ACTIVE))) await platform.kvSet(ACTIVE, clean.id);
  return all;
}

export async function deleteBrand(id: string): Promise<Brand[]> {
  const all = (await listBrands()).filter((x) => x.id !== id);
  await platform.kvSet(KEY, all);
  if ((await platform.kvGet<string>(ACTIVE)) === id) await platform.kvSet(ACTIVE, all[0]?.id ?? null);
  return all;
}

export async function getActiveBrand(): Promise<Brand | null> {
  const all = await listBrands();
  const id = await platform.kvGet<string>(ACTIVE);
  return all.find((b) => b.id === id) ?? all[0] ?? null;
}

export async function setActiveBrand(id: string): Promise<void> {
  await platform.kvSet(ACTIVE, id);
}

/** Clave del logo en el mapa de imágenes que recibe `paintBoard`. */
export const brandLogoKey = (b: Brand) => `marca#${b.id}`;

export interface ApplyBrandOptions {
  colors?: boolean;          // por defecto true
  fonts?: boolean;           // por defecto true
  /** Deja el blanco y el negro puros como están (legibilidad sobre fotos). Por defecto true. */
  keepBlackWhite?: boolean;
}

type Slot = { get: () => string | undefined | null; set: (c: string) => void };

/** Recolorea el diseño con la marca: los colores del diseño se ordenan por claridad y cada uno pasa al color de
 *  la marca con la misma claridad relativa (así se mantiene el contraste). La transparencia se conserva.
 *  Los textos más grandes toman la fuente de títulos; el resto, la de texto. */
export function applyBrand(board: Board, brand: Brand, opts: ApplyBrandOptions = {}): Board {
  const b: Board = JSON.parse(JSON.stringify(board));
  const { colors = true, fonts = true, keepBlackWhite = true } = opts;
  if (colors && brand.colors.length) {
    const slots: Slot[] = [];
    const add = (o: Record<string, unknown>, k: string) =>
      slots.push({ get: () => o[k] as string | undefined, set: (c) => (o[k] = c) });
    add(b as never, "bg");
    if (b.grad) add(b.grad as never, "to");
    for (const it of b.items) {
      if (it.kind === "text") {
        add(it as never, "color");
        if (it.box) add(it as never, "box");
        if (it.stroke) add(it.stroke as never, "color");
      } else if (it.kind === "shape") {
        add(it as never, "fill");
        if (it.stroke) add(it as never, "stroke");
        if (it.grad) add(it.grad as never, "to");
      } else if (it.kind === "photo" && it.border && it.borderColor) add(it as never, "borderColor");
    }
    const key = (c: string) => { const p = parseColor(c); return p ? formatColor({ ...p, a: 1 }) : null; };
    const isBW = (k: string) => k === "#ffffff" || k === "#000000";
    const distinct = [...new Set(slots.map((s) => s.get()).filter((c): c is string => !!c).map(key).filter((k): k is string => !!k))]
      .filter((k) => !(keepBlackWhite && isBW(k)))
      .sort((a, c) => luminance(a) - luminance(c));
    const pal = [...brand.colors].sort((a, c) => luminance(a) - luminance(c));
    const map = new Map<string, string>();
    distinct.forEach((k, i) => {
      const r = distinct.length === 1 ? (luminance(k) > 0.5 ? 1 : 0) : i / (distinct.length - 1);
      map.set(k, pal[Math.round(r * (pal.length - 1))]);
    });
    for (const s of slots) {
      const c = s.get();
      if (!c) continue;
      const p = parseColor(c), k = key(c);
      const to = k ? map.get(k) : undefined;
      if (!p || !to) continue;
      const q = parseColor(to)!;
      s.set(formatColor({ ...q, a: p.a * q.a }));
    }
  }
  if (fonts) {
    const texts = b.items.filter((i) => i.kind === "text");
    const max = Math.max(0, ...texts.map((t) => t.size));
    for (const t of texts) t.font = t.size >= max * 0.6 ? brand.titleFont : brand.bodyFont;
  }
  return b;
}

export type Corner = "arriba-izquierda" | "arriba-derecha" | "abajo-izquierda" | "abajo-derecha" | "centro";

/** Añade el logo de la marca a una página (encima de todo). `size` = ancho en fracción de página. */
export function addBrandLogo(board: Board, brand: Brand, opts: { page?: number; corner?: Corner; size?: number; aspect?: number } = {}): Board {
  const { page = 0, corner = "abajo-derecha", size = 0.2, aspect = 1 } = opts;
  const ratio = formatRatio(board);
  const w = size, h = (size * ratio) / aspect, m = 0.05;
  const x = corner.endsWith("izquierda") ? m : corner === "centro" ? 0.5 - w / 2 : 1 - m - w;
  const y = corner.startsWith("arriba") ? m * ratio : corner === "centro" ? 0.5 - h / 2 : 1 - m * ratio - h;
  const logo: PhotoItem = {
    kind: "photo", id: newId(), photo: brandLogoKey(brand), x: page + x, y, w, h, zoom: 1, ox: 0, oy: 0, radius: 0, fit: "contain",
  };
  return { ...board, items: [...board.items, logo as Item] };
}

const formatRatio = (b: Board) => formatById(b.format).ratio;
