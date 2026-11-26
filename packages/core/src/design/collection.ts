// Más plantillas, con estilos cuidados: editorial, scrapbook, mosaico continuo, escalera, gran titular, bloques de
// color, postales, moodboard, minimal y cine, y de una imagen (titular, fotomatón, marco, cita, cuadrícula…).
// Diseños propios. Unidades: x de 0 a `pages` (ancho de página = 1), y de 0 a 1 (alto de página = 1).
import { newId, type Item, type PhotoItem, type ShapeItem, type TextItem } from "./board";
import type { Template } from "./templates";

const ph = (photo: string | undefined, x: number, y: number, w: number, h: number, o: Partial<PhotoItem> = {}): PhotoItem => ({
  kind: "photo", id: newId(), photo: photo ?? "", x, y, w, h, zoom: 1, ox: 0, oy: 0, radius: 0, ...o,
});
const tx = (text: string, x: number, y: number, o: Partial<TextItem> = {}): TextItem => ({
  kind: "text", id: newId(), text, x, y, size: 0.05, font: "moderna", color: "#111111", weight: 600,
  align: "center", box: null, shadow: false, spacing: 0, upper: false, ...o,
});
const sh = (x: number, y: number, w: number, h: number, fill: string, o: Partial<ShapeItem> = {}): ShapeItem => ({
  kind: "shape", id: newId(), shape: "rect", x, y, w, h, fill, ...o,
});
const tape = (x: number, y: number, rot: number) => sh(x, y, 0.2, 0.045, "rgba(255,250,235,.72)", { rot, radius: 0.1 });
const pick = (ids: string[], i: number) => ids[i % Math.max(1, ids.length)];

export const EXTRA_CAROUSELS: Template[] = [
  {
    id: "c-editorial", name: "Editorial", photos: 4, format: "4:5", carousel: true,
    build: (p) => ({
      format: "4:5", pages: 3, bg: "#f4f1ec", items: [
        ph(pick(p, 0), 0.08, 0.07, 0.84, 0.62),
        tx("EDICIÓN 01", 0.5, 0.79, { font: "elegante", size: 0.075, weight: 400, spacing: 0.08 }),
        tx("otoño · 2026", 0.5, 0.87, { size: 0.022, spacing: 0.4, weight: 500, color: "#6b6258" }),
        ph(pick(p, 1), 1.1, 0.1, 0.5, 0.8),
        ...[0.2, 0.25, 0.3, 0.35, 0.4].map((y, i) => sh(1.7, y, i === 4 ? 0.14 : 0.22, 0.008, "#2b2b2b")),
        ph(pick(p, 2), 1.68, 0.52, 0.62, 0.38, { shadow: true }),
        ph(pick(p, 3), 2.38, 0.08, 0.54, 0.42),
        tx("«Lo mejor\nestá por venir»", 2.62, 0.7, { font: "elegante", size: 0.05, weight: 400 }),
      ],
    }),
  },
  {
    id: "c-scrapbook", name: "Scrapbook", photos: 5, format: "4:5", carousel: true,
    build: (p) => {
      const pos: [number, number, number, number, number][] = [
        [0.1, 0.12, 0.62, 0.42, -4], [0.62, 0.5, 0.55, 0.38, 5], [1.35, 0.1, 0.55, 0.5, 3], [1.95, 0.45, 0.58, 0.4, -6], [2.45, 0.08, 0.48, 0.38, 4],
      ];
      const items: Item[] = [];
      pos.forEach(([x, y, w, h, r], i) => {
        items.push(ph(pick(p, i), x, y, w, h, { rot: r, border: 0.05, borderColor: "#fbf8f2", shadow: true }));
        items.push(tape(x + w / 2 - 0.1, y - 0.02, r * 2 + (i % 2 ? 10 : -10)));
      });
      items.push(tx("nuestro verano", 0.7, 0.9, { font: "manuscrita", size: 0.065, weight: 400, color: "#3b2f25", rot: -3 }));
      items.push(tx("✿ recuerdos", 2.4, 0.9, { font: "manuscrita", size: 0.05, weight: 400, color: "#3b2f25", rot: 2 }));
      return { format: "4:5", pages: 3, bg: "#c9ae8c", items };
    },
  },
  {
    id: "c-mosaico", name: "Mosaico continuo", photos: 9, format: "4:5", carousel: true,
    build: (p) => {
      const g = 0.03, cols = 6, rows = 3, pages = 2;
      const cw = (pages - g * (cols + 1)) / cols, rh = (1 - g * (rows + 1)) / rows;
      const items: Item[] = [];
      let k = 0;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        // algunas celdas dobles para que no sea una rejilla plana
        if ((r === 0 && c === 1) || (r === 2 && c === 4)) { items.push(ph(pick(p, k++), g + c * (cw + g), g + r * (rh + g), cw * 2 + g, rh)); continue; }
        if ((r === 0 && c === 2) || (r === 2 && c === 5)) continue;
        items.push(ph(pick(p, k++), g + c * (cw + g), g + r * (rh + g), cw, rh));
      }
      return { format: "4:5", pages, bg: "#ffffff", items };
    },
  },
  {
    id: "c-escalera", name: "Escalera", photos: 4, format: "4:5", carousel: true,
    build: (p) => ({
      format: "4:5", pages: 4, bg: "#e0eafc", grad: { to: "#cfdef3", angle: 0 },
      items: [0, 1, 2, 3].flatMap((i) => [
        ph(pick(p, i), 0.12 + i * 0.95, 0.07 + i * 0.16, 0.9, 0.46, { radius: 0.03, shadow: true }),
        tx(`0${i + 1}`, 0.2 + i * 0.95, 0.62 + i * 0.1 > 0.95 ? 0.05 : 0.6 + i * 0.1, { size: 0.05, weight: 800, color: "#1e3a5f", align: "left" }),
      ]),
    }),
  },
  {
    id: "c-titular", name: "Gran titular", photos: 3, format: "4:5", carousel: true,
    build: (p) => ({
      format: "4:5", pages: 3, bg: "#e4572e", grad: { to: "#f2c14e", angle: 0 }, items: [
        tx("VERANO", 1.5, 0.5, { font: "impacto", size: 0.48, color: "#fff7e6", weight: 800, spacing: 0.05 }),
        ph(pick(p, 0), 0.2, 0.08, 0.6, 0.48, { frame: "circle", border: 0.025, borderColor: "#fff7e6", shadow: true }),
        ph(pick(p, 1), 1.25, 0.5, 0.5, 0.4, { frame: "circle", border: 0.025, borderColor: "#fff7e6", shadow: true }),
        ph(pick(p, 2), 2.2, 0.06, 0.6, 0.48, { frame: "circle", border: 0.025, borderColor: "#fff7e6", shadow: true }),
      ],
    }),
  },
  {
    id: "c-bloques", name: "Bloques de color", photos: 4, format: "4:5", carousel: true,
    build: (p) => ({
      format: "4:5", pages: 3, bg: "#f5efe6", items: [
        sh(0, 0, 1, 1, "#2f6f5e"), sh(2, 0, 1, 1, "#e94f86"),
        ph(pick(p, 0), 0.12, 0.12, 0.62, 0.5),
        ph(pick(p, 1), 0.72, 0.45, 0.58, 0.45, { shadow: true }),
        ph(pick(p, 2), 1.7, 0.1, 0.58, 0.45, { shadow: true }),
        ph(pick(p, 3), 2.28, 0.5, 0.6, 0.42),
        tx("NUEVA\nCOLECCIÓN", 0.4, 0.82, { size: 0.045, weight: 800, color: "#f5efe6", align: "left", spacing: 0.05 }),
      ],
    }),
  },
  {
    id: "c-postales", name: "Postales", photos: 3, format: "4:5", carousel: true,
    build: (p) => ({
      format: "4:5", pages: 3, bg: "#e8dfd1", items: [
        ...[0, 1, 2].flatMap((i) => [
          ph(pick(p, i), 0.1 + i * 1.0 + (i === 1 ? -0.05 : 0), 0.12 + (i % 2) * 0.08, 0.82, 0.55,
            { border: 0.07, borderColor: "#fffdf8", rot: [-2, 3, -3][i], shadow: true }),
          { kind: "sticker", id: newId(), emoji: "📮", x: 0.82 + i * 1.0, y: 0.18 + (i % 2) * 0.08, size: 0.07, rot: 8 } as Item,
        ]),
        tx("Saludos desde…", 1.5, 0.86, { font: "manuscrita", size: 0.075, weight: 400, color: "#5a3e2b" }),
      ],
    }),
  },
  {
    id: "c-moodboard", name: "Moodboard", photos: 7, format: "4:5", carousel: true,
    build: (p) => ({
      format: "4:5", pages: 2, bg: "#efe9e1", items: [
        sh(0.08, 0.08, 0.5, 0.36, "#d9c3a5"), sh(1.35, 0.55, 0.5, 0.35, "#c8a2c8", { radius: 0.5 }),
        ph(pick(p, 0), 0.15, 0.14, 0.55, 0.42, { shadow: true }),
        ph(pick(p, 1), 0.55, 0.42, 0.42, 0.34, { rot: 4, shadow: true }),
        ph(pick(p, 2), 0.1, 0.62, 0.38, 0.3, { frame: "arch" }),
        ph(pick(p, 3), 0.82, 0.06, 0.45, 0.32, { rot: -3, shadow: true }),
        ph(pick(p, 4), 1.1, 0.4, 0.34, 0.27, { frame: "circle" }),
        ph(pick(p, 5), 1.5, 0.12, 0.42, 0.4, { shadow: true }),
        ph(pick(p, 6), 1.55, 0.6, 0.36, 0.3, { rot: 3, border: 0.04, borderColor: "#ffffff" }),
        tx("inspiración", 1.0, 0.9, { font: "elegante", size: 0.05, weight: 400, color: "#3b2f25" }),
      ],
    }),
  },
  {
    id: "c-minimal", name: "Minimal", photos: 3, format: "4:5", carousel: true,
    build: (p) => ({
      format: "4:5", pages: 3, bg: "#fafafa", items: [
        sh(0.1, 0.86, 2.8, 0.004, "#222222"),
        ...[0, 1, 2].flatMap((i) => [
          ph(pick(p, i), 0.2 + i, 0.16, 0.6, 0.6),
          tx(`0${i + 1}`, 0.2 + i, 0.9, { size: 0.025, weight: 700, color: "#222222", align: "left", spacing: 0.2 }),
        ]),
        tx("SERIE", 2.8, 0.9, { size: 0.025, weight: 700, color: "#222222", align: "right", spacing: 0.4 }),
      ],
    }),
  },
  {
    id: "c-cine", name: "Cine panorámico", photos: 1, format: "4:5", carousel: true,
    build: (p) => ({
      format: "4:5", pages: 3, bg: "#0b0b0b", items: [
        ph(pick(p, 0), 0, 0.22, 3, 0.56),
        tx("ESCENA 1 — TOMA 3", 1.5, 0.12, { font: "maquina", size: 0.028, color: "#e8e2d6", spacing: 0.3 }),
        tx("una película de nosotros", 1.5, 0.88, { font: "elegante", size: 0.04, weight: 400, color: "#e8e2d6" }),
      ],
    }),
  },
];

export const SINGLES: Template[] = [
  {
    id: "s-titular", name: "Titular", photos: 1, format: "4:5",
    build: (p) => ({
      format: "4:5", pages: 1, bg: "#000", items: [
        ph(p[0], 0, 0, 1, 1),
        sh(0, 0.62, 1, 0.38, "rgba(0,0,0,.45)"),
        tx("TU TITULAR\nAQUÍ", 0.08, 0.78, { size: 0.08, weight: 800, color: "#ffffff", align: "left", font: "impacto" }),
        tx("subtítulo o fecha", 0.08, 0.92, { size: 0.025, color: "#ffffff", align: "left", spacing: 0.2, weight: 500 }),
      ],
    }),
  },
  {
    id: "s-fotomaton", name: "Fotomatón", photos: 4, format: "9:16",
    build: (p) => ({
      format: "9:16", pages: 1, bg: "#e94f86", items: [
        sh(0.22, 0.04, 0.56, 0.92, "#ffffff", { radius: 0.02 }),
        ...[0, 1, 2, 3].map((i) => ph(pick(p, i), 0.26, 0.06 + i * 0.205, 0.48, 0.19)),
        tx("♡ 2026", 0.5, 0.9, { font: "manuscrita", size: 0.035, weight: 400, color: "#e94f86" }),
      ],
    }),
  },
  {
    id: "s-marco", name: "Marco grueso", photos: 1, format: "4:5",
    build: (p) => ({
      format: "4:5", pages: 1, bg: "#2f6f5e", items: [
        ph(p[0], 0.1, 0.08, 0.8, 0.72, { border: 0.03, borderColor: "#f5efe6" }),
        tx("Nombre · Lugar", 0.5, 0.89, { font: "elegante", size: 0.045, weight: 400, color: "#f5efe6" }),
      ],
    }),
  },
  {
    id: "s-diagonal", name: "Dos fotos cruzadas", photos: 2, format: "4:5",
    build: (p) => ({
      format: "4:5", pages: 1, bg: "#f5efe6", items: [
        ph(pick(p, 0), 0.06, 0.08, 0.6, 0.52, { rot: -5, border: 0.04, borderColor: "#ffffff", shadow: true }),
        ph(pick(p, 1), 0.36, 0.42, 0.58, 0.5, { rot: 4, border: 0.04, borderColor: "#ffffff", shadow: true }),
      ],
    }),
  },
  {
    id: "s-cita", name: "Cita", photos: 1, format: "4:5",
    build: (p) => ({
      format: "4:5", pages: 1, bg: "#7b5cff", grad: { to: "#e94f86", angle: 60 }, items: [
        ph(p[0], 0.32, 0.1, 0.36, 0.29, { frame: "circle", border: 0.04, borderColor: "#ffffff" }),
        tx("«Escribe aquí\nuna frase bonita»", 0.5, 0.6, { font: "elegante", size: 0.065, weight: 400, color: "#ffffff" }),
        tx("— TU NOMBRE", 0.5, 0.82, { size: 0.025, spacing: 0.3, color: "#ffffff", weight: 700 }),
      ],
    }),
  },
  {
    id: "s-cuadricula", name: "Cuadrícula 3×3", photos: 9, format: "1:1",
    build: (p) => ({
      format: "1:1", pages: 1, bg: "#ffffff",
      items: Array.from({ length: 9 }, (_, i) => ph(pick(p, i), 0.01 + (i % 3) * 0.33, 0.01 + Math.floor(i / 3) * 0.33, 0.32, 0.32)),
    }),
  },
  {
    id: "s-historia-arco", name: "Historia con arco", photos: 1, format: "9:16",
    build: (p) => ({
      format: "9:16", pages: 1, bg: "#ede4d8", items: [
        ph(p[0], 0.12, 0.12, 0.76, 0.6, { frame: "arch" }),
        tx("nuevo en el blog", 0.5, 0.8, { font: "manuscrita", size: 0.035, weight: 400, color: "#3b2f25" }),
        tx("LEER MÁS ↗", 0.5, 0.87, { size: 0.018, spacing: 0.35, weight: 700, color: "#3b2f25", box: "#ffffff" }),
      ],
    }),
  },
];
