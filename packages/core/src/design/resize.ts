// Redimensionar (como «Redimensionar» de Canva) pensado para redes: pasa un diseño a otro formato recolocando y
// escalando los elementos con sentido. Lógica pura.
//
// Reglas (por página; los elementos que cruzan páginas en un carrusel siguen cruzando):
//  · Lo que cubre la página entera (foto a sangre, fondo) sigue cubriéndola.
//  · Las bandas a todo el ancho (o alto) siguen a todo el ancho (o alto); se escala el otro lado.
//  · El resto se escala igual en los dos ejes (nada se deforma) con s = min(nuevo/viejo, 1) en ancho
//    relativo, y conserva su posición relativa; lo que tocaba un borde sigue pegado a ese borde.
//  · Los textos y stickers escalan su tamaño con el mismo factor.
import { FORMATS, formatById } from "../engine/formats";
import type { FormatId } from "../engine/types";
import type { Board, Item } from "./board";

/** Formatos de destino para el selector de «Redimensionar», agrupados por uso en redes. */
export const DESIGN_FORMATS: { id: FormatId; name: string; group: "Publicación" | "Historia / Reel" | "Portada" | "Vídeo" }[] = [
  { id: "ig-feed", name: "Post vertical 4:5", group: "Publicación" },
  { id: "ig-square", name: "Post cuadrado 1:1", group: "Publicación" },
  { id: "ig-grid", name: "Post 3:4", group: "Publicación" },
  { id: "ig-story", name: "Historia / Reel 9:16", group: "Historia / Reel" },
  { id: "tiktok", name: "TikTok 9:16", group: "Historia / Reel" },
  { id: "wa-status", name: "Estado de WhatsApp", group: "Historia / Reel" },
  { id: "pin", name: "Pin 2:3", group: "Publicación" },
  { id: "fb-link", name: "Facebook horizontal", group: "Publicación" },
  { id: "x-post", name: "Post de X 16:9", group: "Publicación" },
  { id: "li-post", name: "LinkedIn horizontal", group: "Publicación" },
  { id: "fb-cover", name: "Portada de Facebook", group: "Portada" },
  { id: "x-header", name: "Cabecera de X", group: "Portada" },
  { id: "li-cover", name: "Portada de LinkedIn", group: "Portada" },
  { id: "yt-thumb", name: "Miniatura de YouTube", group: "Vídeo" },
].filter((f) => FORMATS.some((x) => x.id === f.id)) as never;

/** Zonas que tapa la interfaz de la red (historias, reels, TikTok): fracciones de alto arriba y abajo, y de
 *  ancho a la derecha (botones). Para dibujar guías de «zona segura» y para que las plantillas no pongan texto ahí. */
export function safeZone(format: FormatId): { top: number; bottom: number; right: number; left: number } {
  const f = formatById(format);
  if (f.id === "ig-story" || f.id === "wa-status") return { top: 0.13, bottom: 0.18, left: 0.04, right: 0.04 };
  if (f.id === "tiktok") return { top: 0.1, bottom: 0.2, left: 0.04, right: 0.15 };
  if (f.id === "yt-thumb") return { top: 0, bottom: 0.12, left: 0, right: 0.2 }; // la duración tapa la esquina
  return { top: 0, bottom: 0, left: 0, right: 0 };
}

const NEAR = 0.025;

export function resizeBoard(board: Board, format: FormatId): Board {
  const ra = formatById(board.format).ratio, rb = formatById(format).ratio;
  if (Math.abs(ra - rb) < 1e-6) return { ...board, format };
  const s = Math.min(rb / ra, 1);         // escala de tamaño en px (alto de página = 1)
  const kx = (ra * s) / rb;               // cómo cambia un ancho en unidades de página
  const items = board.items.map((it) => fit(it, s, kx));
  return { ...board, format, items };
}

function fit(it: Item, s: number, kx: number): Item {
  if (it.kind === "text") return { ...it, size: it.size * s };
  if (it.kind === "sticker") return { ...it, size: it.size * s };
  const page = Math.floor(it.x + NEAR);
  const lx = it.x - page;                 // x dentro de su página
  const fullW = lx <= NEAR && lx + it.w >= 1 - NEAR;
  const fullH = it.y <= NEAR && it.y + it.h >= 1 - NEAR;
  if (fullW && fullH) return it;          // a sangre: sigue a sangre
  let { x, y, w, h } = it;
  const sw = it.kind === "shape" && it.strokeWidth !== undefined ? { strokeWidth: it.strokeWidth * s } : {};
  if (fullW) {                            // banda horizontal: mismo ancho, alto escalado, pegada a su borde
    const nh = h * s;
    y = anchor(y, h, nh, 0, 1);
    return { ...it, ...sw, y, h: nh };
  }
  if (fullH) {                            // banda vertical: mismo alto, ancho según la nueva proporción
    const nw = w * (kx / s);              // mismo ancho en px relativos al alto
    x = anchor(x, w, nw, page, page + 1);
    return { ...it, ...sw, x, w: nw };
  }
  const nw = w * kx, nh = h * s;
  x = anchor(x, w, nw, page, page + 1);
  y = anchor(y, h, nh, 0, 1);
  return { ...it, ...sw, x, y, w: nw, h: nh };
}

/** Nueva posición de un tramo [p, p+len] → longitud `nl` dentro de [lo, hi]: pegado al borde que tocaba o con
 *  el centro en la misma posición relativa. */
function anchor(p: number, len: number, nl: number, lo: number, hi: number) {
  if (Math.abs(p - lo) <= NEAR) return lo + (p - lo);
  if (Math.abs(p + len - hi) <= NEAR) return hi - (hi - (p + len)) - nl;
  const c = p + len / 2;
  return c - nl / 2;
}
