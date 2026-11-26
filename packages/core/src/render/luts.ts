// Biblioteca de filtros: las 73 LUT de PhootFlow escritorio (tools/exportar_luts.py), 33³ en uint8.
// Se cargan al usarlas y el service worker las guarda para trabajar sin conexión.
import catalogo from "../../assets/luts/catalogo.json";

export interface LutInfo { id: string; name: string; group: string; file: string; bw: boolean; }

const URLS = import.meta.glob("../../assets/luts/*.bin", { query: "?url", import: "default", eager: true }) as Record<string, string>;

export const LUT_SIZE: number = catalogo.size;
export const LUTS: LutInfo[] = catalogo.luts;
export const COLOR_LUTS = LUTS.filter((l) => !l.bw);
export const BW_LUTS = LUTS.filter((l) => l.bw);

/** Grupos en el orden en que se muestran. */
export const LUT_GROUPS = ["Looks", ...new Set(COLOR_LUTS.map((l) => l.group))].filter((g, i, a) => a.indexOf(g) === i);

/** Una selección corta para pasar con el dedo, de varios estilos (los demás, en «Ver todos»). */
export const FEATURED = [
  "Looks", "Película negativo", "Película diapositiva", "slay",
].flatMap((g) => COLOR_LUTS.filter((l) => l.group === g).slice(0, g === "Looks" ? 6 : 4)).map((l) => l.id);

const cache = new Map<string, Promise<Uint8Array>>();

export function lutById(id: string | null) {
  return id ? LUTS.find((l) => l.id === id) ?? null : null;
}

export function loadLut(id: string): Promise<Uint8Array> {
  let p = cache.get(id);
  if (!p) {
    const info = lutById(id);
    if (!info) return Promise.reject(new Error("Filtro desconocido: " + id));
    const url = URLS[`../../assets/luts/${info.file}`];
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error("No se ha podido cargar el filtro");
      return r.arrayBuffer();
    }).then((b) => new Uint8Array(b));
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}
