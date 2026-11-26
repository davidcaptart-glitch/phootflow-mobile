// Plantillas de carrusel continuo: las fotos cruzan de una página a otra para que, al deslizar, el carrusel se vea
// como una sola pieza. Diseños propios. Todas usan coordenadas del tablero (x de 0 a `pages`).
import { newId, type Board, type Item, type PhotoItem, type TextItem } from "./board";
import type { Template } from "./templates";
import { EXTRA_CAROUSELS } from "./collection";

const ph = (photo: string | undefined, x: number, y: number, w: number, h: number, o: Partial<PhotoItem> = {}): PhotoItem => ({
  kind: "photo", id: newId(), photo: photo ?? "", x, y, w, h, zoom: 1, ox: 0, oy: 0, radius: 0, ...o,
});
const tx = (text: string, x: number, y: number, o: Partial<TextItem> = {}): TextItem => ({
  kind: "text", id: newId(), text, x, y, size: 0.05, font: "moderna", color: "#111111", weight: 600,
  align: "center", box: null, shadow: false, spacing: 0, upper: false, ...o,
});
const pick = (ids: string[], i: number) => ids[i % Math.max(1, ids.length)];

const BASE: Template[] = [
  {
    id: "c-panorama", name: "Panorámica", photos: 1, format: "4:5", carousel: true,
    build: (p) => ({ format: "4:5", pages: 3, bg: "#000", items: [ph(p[0], 0, 0, 3, 1)] }),
  },
  {
    id: "c-cruza", name: "Foto que cruza", photos: 4, format: "4:5", carousel: true,
    build: (p) => ({
      format: "4:5", pages: 3, bg: "#f5efe6", items: [
        ph(pick(p, 0), 0.08, 0.1, 1.25, 0.8, { radius: 0.02, shadow: true }),
        ph(pick(p, 1), 1.45, 0.08, 0.62, 0.4, { radius: 0.02 }),
        ph(pick(p, 2), 1.45, 0.52, 0.62, 0.4, { radius: 0.02 }),
        ph(pick(p, 3), 2.2, 0.15, 0.7, 0.7, { radius: 0.02, shadow: true }),
        tx("Nuestra historia", 0.5, 0.95, { font: "elegante", size: 0.035, weight: 400, color: "#2b2b2b" }),
      ],
    }),
  },
  {
    id: "c-polaroids", name: "Polaroids", photos: 5, format: "4:5", carousel: true,
    build: (p) => {
      const items: Item[] = [];
      const xs = [0.12, 0.72, 1.32, 1.92, 2.5];
      xs.forEach((x, i) => items.push(ph(pick(p, i), x, i % 2 ? 0.3 : 0.18, 0.5, 0.48,
        { border: 0.06, borderColor: "#ffffff", rot: [-5, 4, -3, 5, -4][i], shadow: true })));
      items.push(tx("buenos momentos", 1.5, 0.88, { font: "manuscrita", size: 0.06, weight: 400, color: "#3b2f25" }));
      return { format: "4:5", pages: 3, bg: "#d9c3a5", items };
    },
  },
  {
    id: "c-arcos", name: "Arcos", photos: 4, format: "4:5", carousel: true,
    build: (p) => ({
      format: "4:5", pages: 3, bg: "#ede4d8", items: [
        ph(pick(p, 0), 0.15, 0.14, 0.7, 0.72, { frame: "arch" }),
        ph(pick(p, 1), 0.95, 0.24, 0.45, 0.5, { frame: "arch" }),
        ph(pick(p, 2), 1.55, 0.14, 0.7, 0.72, { frame: "arch" }),
        ph(pick(p, 3), 2.38, 0.24, 0.45, 0.5, { frame: "arch" }),
        tx("ARCHIVO", 0.5, 0.94, { size: 0.026, spacing: 0.4, weight: 700, color: "#6b5d4f" }),
      ],
    }),
  },
  {
    id: "c-circulos", name: "Círculos", photos: 5, format: "4:5", carousel: true,
    build: (p) => ({
      format: "4:5", pages: 3, bg: "#1d2b2a", grad: { to: "#3c5c54", angle: 0 }, items: [
        ph(pick(p, 0), 0.1, 0.12, 0.8, 0.64, { frame: "circle", border: 0.02, borderColor: "#f5efe6" }),
        ph(pick(p, 1), 0.85, 0.55, 0.35, 0.28, { frame: "circle" }),
        ph(pick(p, 2), 1.3, 0.2, 0.6, 0.48, { frame: "circle", border: 0.02, borderColor: "#f5efe6" }),
        ph(pick(p, 3), 1.9, 0.58, 0.32, 0.26, { frame: "circle" }),
        ph(pick(p, 4), 2.2, 0.14, 0.72, 0.58, { frame: "circle", border: 0.02, borderColor: "#f5efe6" }),
      ],
    }),
  },
  {
    id: "c-pelicula", name: "Tira de película", photos: 6, format: "4:5", carousel: true,
    build: (p) => {
      const items: Item[] = [{ kind: "shape", id: newId(), shape: "rect", x: 0, y: 0.25, w: 3, h: 0.5, fill: "#111111" }];
      for (let i = 0; i < 6; i++) items.push(ph(pick(p, i), 0.06 + i * 0.49, 0.31, 0.44, 0.38, { radius: 0.03 }));
      for (let k = 0; k < 30; k++) {
        for (const y of [0.265, 0.715]) items.push({ kind: "shape", id: newId(), shape: "rect", x: 0.03 + k * 0.1, y, w: 0.04, h: 0.02, fill: "#f5efe6", radius: 0.3 });
      }
      items.push(tx("ROLLO 01", 1.5, 0.15, { size: 0.03, spacing: 0.5, weight: 700, color: "#111111", font: "maquina" }));
      return { format: "4:5", pages: 3, bg: "#f5efe6", items };
    },
  },
  {
    id: "c-collage", name: "Collage libre", photos: 6, format: "4:5", carousel: true,
    build: (p) => ({
      format: "4:5", pages: 3, bg: "#ffffff", items: [
        ph(pick(p, 0), 0.05, 0.08, 0.75, 0.55, { rot: -3, shadow: true }),
        ph(pick(p, 1), 0.55, 0.45, 0.6, 0.45, { rot: 4, shadow: true }),
        ph(pick(p, 2), 1.2, 0.1, 0.55, 0.42, { rot: 2, shadow: true }),
        ph(pick(p, 3), 1.6, 0.42, 0.7, 0.5, { rot: -4, shadow: true }),
        ph(pick(p, 4), 2.3, 0.08, 0.62, 0.45, { rot: 3, shadow: true }),
        ph(pick(p, 5), 2.25, 0.55, 0.55, 0.38, { rot: -2, shadow: true }),
      ],
    }),
  },
  {
    id: "c-portada", name: "Portada + fotos", photos: 4, format: "4:5", carousel: true,
    build: (p) => ({
      format: "4:5", pages: 4, bg: "#111111", items: [
        ph(pick(p, 0), 0, 0, 1.35, 1),
        tx("12.09", 0.5, 0.42, { size: 0.12, color: "#ffffff", font: "elegante", weight: 400, shadow: true }),
        tx("NUESTRA BODA", 0.5, 0.55, { size: 0.03, spacing: 0.45, color: "#ffffff", weight: 700, shadow: true }),
        ph(pick(p, 1), 1.45, 0.1, 0.9, 0.8, { radius: 0.01 }),
        ph(pick(p, 2), 2.45, 0.1, 0.48, 0.38, { radius: 0.01 }),
        ph(pick(p, 3), 2.45, 0.52, 0.48, 0.38, { radius: 0.01 }),
        ph(pick(p, 0), 3.05, 0, 0.95, 1),
      ],
    }),
  },
];

export const CAROUSELS: Template[] = [...EXTRA_CAROUSELS.slice(0, 2), ...BASE.slice(0, 3), ...EXTRA_CAROUSELS.slice(2), ...BASE.slice(3)];

/** Tablero en blanco para empezar desde cero. */
export function blankBoard(pages = 3, format = "4:5"): Board {
  return { format, pages, bg: "#ffffff", items: [] };
}
