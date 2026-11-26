// Plantillas básicas para redes. Cada una se rellena con las fotos elegidas (en orden).
import type { FormatId } from "../engine/types";
import { newId, type Board, type Item, type PhotoItem, type TextItem } from "./board";
import { CAROUSELS } from "./carousels";
import { SINGLES } from "./collection";
import { PRO_TEMPLATES, VIDEO_TEMPLATES } from "./pro-templates";

export type TemplateCategory = "bodas" | "eventos" | "deporte" | "negocio" | "portfolio" | "video";

export interface Template {
  id: string;
  name: string;
  /** Cuántas fotos usa (para un carrusel, «hasta»). */
  photos: number;
  format: FormatId;
  carousel?: boolean;
  /** Categoría (plantillas de Pro): bodas, eventos, deporte, negocio, portfolio, video. */
  category?: TemplateCategory;
  /** Plantilla de vídeo: cada página es una escena; se exporta con `exportVideo` / `exportGif`. */
  video?: boolean;
  /** Segundos por escena recomendados para el vídeo. */
  perPage?: number;
  build(photoIds: string[]): Board;
}

const ph = (photo: string | undefined, x: number, y: number, w: number, h: number, radius = 0): PhotoItem => ({
  kind: "photo", id: newId(), photo: photo ?? "", x, y, w, h, zoom: 1, ox: 0, oy: 0, radius,
});

const tx = (text: string, x: number, y: number, o: Partial<TextItem> = {}): TextItem => ({
  kind: "text", id: newId(), text, x, y, size: 0.05, font: "moderna", color: "#ffffff", weight: 600,
  align: "center", box: null, shadow: false, spacing: 0, upper: false, ...o,
});

export const TEMPLATES: Template[] = [
  {
    id: "sangre", name: "Foto a sangre", photos: 1, format: "4:5",
    build: (p) => ({ format: "4:5", pages: 1, bg: "#000", items: [ph(p[0], 0, 0, 1, 1)] }),
  },
  {
    id: "marco", name: "Marco y título", photos: 1, format: "4:5",
    build: (p) => ({
      format: "4:5", pages: 1, bg: "#f5efe6", items: [
        ph(p[0], 0.07, 0.056, 0.86, 0.75),
        tx("Nuestro gran día", 0.5, 0.87, { font: "elegante", color: "#2b2b2b", size: 0.048, weight: 400 }),
        tx("12 · 09 · 2026", 0.5, 0.93, { color: "#7a6f62", size: 0.022, spacing: 0.3, weight: 500 }),
      ],
    }),
  },
  {
    id: "historia", name: "Historia con texto", photos: 1, format: "9:16",
    build: (p) => ({
      format: "9:16", pages: 1, bg: "#000", items: [
        ph(p[0], 0, 0, 1, 1),
        tx("ESCRIBE AQUÍ", 0.5, 0.14, { size: 0.04, box: "rgba(0,0,0,.55)", spacing: 0.12, weight: 700 }),
      ],
    }),
  },
  {
    id: "polaroid", name: "Polaroid", photos: 1, format: "1:1",
    build: (p) => ({
      format: "1:1", pages: 1, bg: "#d9c3a5", items: [
        ph(p[0], 0.14, 0.09, 0.72, 0.68, 0.01),
        tx("buenos momentos", 0.5, 0.86, { font: "manuscrita", color: "#3b2f25", size: 0.07, weight: 400 }),
      ],
    }),
  },
  {
    id: "diptico", name: "Dos fotos", photos: 2, format: "4:5",
    build: (p) => ({
      format: "4:5", pages: 1, bg: "#ffffff", items: [ph(p[0], 0.025, 0.02, 0.4625, 0.96), ph(p[1], 0.5125, 0.02, 0.4625, 0.96)],
    }),
  },
  {
    id: "triptico", name: "Una grande y dos", photos: 3, format: "4:5",
    build: (p) => ({
      format: "4:5", pages: 1, bg: "#ffffff", items: [
        ph(p[0], 0.025, 0.02, 0.95, 0.6), ph(p[1], 0.025, 0.636, 0.4625, 0.344), ph(p[2], 0.5125, 0.636, 0.4625, 0.344),
      ],
    }),
  },
  {
    id: "mosaico", name: "Mosaico de 4", photos: 4, format: "1:1",
    build: (p) => ({
      format: "1:1", pages: 1, bg: "#ffffff", items: [0, 1, 2, 3].map((i) =>
        ph(p[i], 0.02 + (i % 2) * 0.49, 0.02 + Math.floor(i / 2) * 0.49, 0.47, 0.47)),
    }),
  },
  {
    id: "carrusel", name: "Carrusel", photos: 10, format: "4:5", carousel: true,
    build: (p) => {
      const n = Math.max(1, Math.min(10, p.length));
      const items: Item[] = p.slice(0, n).map((id, i) => ph(id, i, 0, 1, 1));
      items.push(tx("Desliza →", n > 1 ? 0.82 : 0.5, 0.94, { size: 0.03, box: "rgba(0,0,0,.45)", weight: 600 }));
      return { format: "4:5", pages: n, bg: "#000", items };
    },
  },
  {
    id: "panoramico", name: "Carrusel continuo", photos: 5, format: "4:5", carousel: true,
    build: (p) => {
      // una foto grande que cruza las dos primeras páginas y las demás encadenadas
      const pages = Math.max(2, Math.min(4, p.length));
      const items: Item[] = [ph(p[0], 0.06, 0.08, 1.3, 0.84, 0.02)];
      const rest = p.slice(1, pages + 1);
      rest.forEach((id, i) => {
        const x = 1.42 + i * ((pages - 1.48) / Math.max(1, rest.length));
        items.push(ph(id, x, i % 2 ? 0.48 : 0.1, (pages - 1.48) / Math.max(1, rest.length) - 0.04, 0.42, 0.02));
      });
      items.push(tx("Nuestra historia", 0.42, 0.955, { font: "elegante", color: "#2b2b2b", size: 0.034, weight: 400 }));
      return { format: "4:5", pages, bg: "#f5efe6", items };
    },
  },
];

/** Todas las plantillas registradas: las básicas, carruseles, de una imagen, las de Pro y las de vídeo. */
export function allTemplates(): Template[] {
  return [...TEMPLATES, ...SINGLES, ...CAROUSELS, ...PRO_TEMPLATES, ...VIDEO_TEMPLATES];
}

/** Plantillas de una categoría (Pro y vídeo). */
export const templatesIn = (category: TemplateCategory) => allTemplates().filter((t) => t.category === category);

export const templateById = (id: string) => allTemplates().find((t) => t.id === id)!;
