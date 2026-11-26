// Plantillas para profesionales (PhootFlow Pro), pensadas para redes: posts 4:5, historias 9:16 (respetando la
// zona que tapa la interfaz de la red), carruseles y plantillas de VÍDEO (cada página es una escena; se exportan
// con exportVideo / exportGif como Reel, Historia o TikTok). Diseños propios.
// Unidades: x de 0 a `pages` (ancho de página = 1), y de 0 a 1.
import { newId, type Item, type PhotoItem, type ShapeItem, type TextItem } from "./board";
import type { Anim } from "./anim";
import type { Template } from "./templates";

const ph = (photo: string | undefined, x: number, y: number, w: number, h: number, o: Partial<PhotoItem> = {}): PhotoItem => ({
  kind: "photo", id: newId(), photo: photo ?? "", x, y, w, h, zoom: 1, ox: 0, oy: 0, radius: 0, ...o,
});
const tx = (text: string, x: number, y: number, o: Partial<TextItem> = {}): TextItem => ({
  kind: "text", id: newId(), text, x, y, size: 0.05, font: "jakarta", color: "#ffffff", weight: 700,
  align: "center", box: null, shadow: false, spacing: 0, upper: false, ...o,
});
const sh = (x: number, y: number, w: number, h: number, fill: string, o: Partial<ShapeItem> = {}): ShapeItem => ({
  kind: "shape", id: newId(), shape: "rect", x, y, w, h, fill, ...o,
});
const pick = (ids: string[], i: number) => ids[i % Math.max(1, ids.length)];
const an = (kind: Anim["kind"], delay = 0, dur?: number, dir?: Anim["dir"]): Anim => ({ kind, delay, ...(dur ? { dur } : {}), ...(dir ? { dir } : {}) });

// ---------- bodas ----------
const BODAS: Template[] = [
  {
    id: "p-boda-save", name: "Reserva la fecha", photos: 1, format: "4:5", category: "bodas",
    build: (p) => ({
      format: "4:5", pages: 1, bg: "#f7f1ea", items: [
        ph(pick(p, 0), 0.1, 0.08, 0.8, 0.6, { frame: "arch" }),
        tx("Reserva la fecha", 0.5, 0.75, { font: "manuscrita", size: 0.07, weight: 400, color: "#5a4636" }),
        sh(0.36, 0.81, 0.28, 0.02, "#b89b7a", { shape: "line", strokeWidth: 0.002 }),
        tx("SÁBADO · 12 SEPTIEMBRE · 2026", 0.5, 0.86, { size: 0.02, spacing: 0.25, weight: 600, color: "#5a4636" }),
        tx("Finca El Olivar", 0.5, 0.91, { font: "editorial", size: 0.024, weight: 400, color: "#8a735e" }),
      ],
    }),
  },
  {
    id: "p-boda-gracias", name: "Gracias (historia)", photos: 2, format: "9:16", category: "bodas",
    build: (p) => ({
      format: "9:16", pages: 1, bg: "#1f1a17", items: [
        ph(pick(p, 0), 0, 0, 1, 0.62),
        sh(0, 0.45, 1, 0.17, "#1f1a17", { grad: { to: "rgba(31,26,23,0)", angle: -90 } }),
        tx("Gracias", 0.5, 0.68, { font: "manuscrita", size: 0.075, weight: 400, color: "#f3e6d6" }),
        tx("por ser parte de nuestro día", 0.5, 0.735, { font: "editorial", size: 0.022, weight: 400, color: "#d8c4ad" }),
        ph(pick(p, 1), 0.38, 0.76, 0.24, 0.24 * (9 / 16), { frame: "circle", border: 0.04, borderColor: "#f3e6d6" }),
      ],
    }),
  },
  {
    id: "p-boda-carrusel", name: "Crónica de boda", photos: 7, format: "4:5", carousel: true, category: "bodas",
    build: (p) => ({
      format: "4:5", pages: 4, bg: "#efe7dc", items: [
        ph(pick(p, 0), 0, 0, 1, 1),
        sh(0, 0.62, 1, 0.38, "rgba(0,0,0,0)", { grad: { to: "rgba(0,0,0,.55)", angle: 90 } }),
        tx("Ana & Leo", 0.5, 0.8, { font: "elegante", size: 0.09, weight: 400 }),
        tx("LA CRÓNICA", 0.5, 0.88, { size: 0.022, spacing: 0.5, weight: 600 }),
        ph(pick(p, 1), 1.08, 0.08, 0.84, 0.56),
        tx("La ceremonia", 1.5, 0.74, { font: "editorial", size: 0.05, weight: 400, color: "#3d3026" }),
        tx("Un sí bajo los olivos, con la luz de la tarde.", 1.5, 0.81, { font: "editorial", size: 0.022, weight: 400, color: "#6b5a4b" }),
        ph(pick(p, 2), 1.92, 0.12, 0.6, 0.76, { shadow: true }),
        ph(pick(p, 3), 2.6, 0.08, 0.32, 0.4),
        ph(pick(p, 4), 2.6, 0.52, 0.32, 0.4),
        ph(pick(p, 5), 3.08, 0.08, 0.84, 0.6, { frame: "arch" }),
        tx("y empezó todo", 3.5, 0.8, { font: "manuscrita", size: 0.06, weight: 400, color: "#3d3026" }),
      ],
    }),
  },
  {
    id: "p-boda-detalles", name: "Detalles", photos: 4, format: "4:5", category: "bodas",
    build: (p) => ({
      format: "4:5", pages: 1, bg: "#ffffff", items: [
        ph(pick(p, 0), 0.05, 0.05, 0.56, 0.58),
        ph(pick(p, 1), 0.64, 0.05, 0.31, 0.28),
        ph(pick(p, 2), 0.64, 0.35, 0.31, 0.28),
        ph(pick(p, 3), 0.05, 0.66, 0.42, 0.29),
        tx("los\ndetalles", 0.72, 0.8, { font: "elegante", size: 0.06, weight: 400, color: "#2b2b2b", lineHeight: 0.95 }),
      ],
    }),
  },
];

// ---------- eventos ----------
const EVENTOS: Template[] = [
  {
    id: "p-evento-cartel", name: "Cartel de evento", photos: 1, format: "4:5", category: "eventos",
    build: (p) => ({
      format: "4:5", pages: 1, bg: "#0d0b1a", items: [
        ph(pick(p, 0), 0, 0, 1, 0.7, { opacity: 0.85 }),
        sh(0, 0.45, 1, 0.25, "rgba(13,11,26,0)", { grad: { to: "#0d0b1a", angle: 90 } }),
        tx("NOCHE DE GALA", 0.5, 0.74, { size: 0.075, effect: "neon", color: "#F50D8A", font: "condensada", weight: 800 }),
        tx("VIERNES 21 · 22:00 H", 0.5, 0.84, { size: 0.026, spacing: 0.3, weight: 700, color: "#e9e4ff" }),
        sh(0.32, 0.89, 0.36, 0.05, "#F50D8A", { shape: "roundrect", radius: 0.5, grad: { to: "#7B2FF7", angle: 0 } }),
        tx("ENTRADAS", 0.5, 0.915, { size: 0.02, spacing: 0.3, weight: 800 }),
      ],
    }),
  },
  {
    id: "p-evento-cuenta", name: "Cuenta atrás (historia)", photos: 1, format: "9:16", category: "eventos",
    build: (p) => ({
      format: "9:16", pages: 1, bg: "#111111", items: [
        ph(pick(p, 0), 0, 0, 1, 1),
        sh(0, 0, 1, 1, "rgba(0,0,0,.35)"),
        tx("FALTAN", 0.5, 0.36, { size: 0.03, spacing: 0.5, weight: 700 }),
        tx("3", 0.5, 0.47, { size: 0.2, weight: 800, effect: "eco", color: "#ffffff" }),
        tx("DÍAS", 0.5, 0.58, { size: 0.03, spacing: 0.5, weight: 700 }),
        tx("Festival de Primavera", 0.5, 0.74, { font: "editorial", size: 0.03, weight: 400, box: "rgba(0,0,0,.5)" }),
      ],
    }),
  },
  {
    id: "p-evento-agenda", name: "Programa", photos: 2, format: "4:5", carousel: true, category: "eventos",
    build: (p) => {
      const items: Item[] = [
        ph(pick(p, 0), 0, 0, 1, 1),
        sh(0.08, 0.62, 0.84, 0.3, "rgba(255,255,255,.92)", { shape: "roundrect", radius: 0.08 }),
        tx("Jornadas\nde Diseño", 0.5, 0.72, { size: 0.055, color: "#141414", lineHeight: 1.0 }),
        tx("15–16 MARZO", 0.5, 0.86, { size: 0.022, spacing: 0.3, color: "#7B2FF7" }),
      ];
      const rows = [["10:00", "Bienvenida"], ["11:30", "Charla principal"], ["14:00", "Comida"], ["16:00", "Talleres"], ["19:00", "Cierre"]];
      items.push(tx("PROGRAMA", 1.5, 0.12, { size: 0.03, spacing: 0.4, color: "#141414" }));
      rows.forEach(([h, t], i) => {
        items.push(tx(h, 1.12, 0.24 + i * 0.12, { size: 0.03, align: "left", color: "#7B2FF7" }));
        items.push(tx(t, 1.36, 0.24 + i * 0.12, { size: 0.03, align: "left", weight: 500, color: "#141414" }));
        items.push(sh(1.12, 0.29 + i * 0.12, 0.76, 0.004, "#dddddd"));
      });
      items.push(ph(pick(p, 1), 1.62, 0.82, 0.3, 0.14, { radius: 0.15 }));
      return { format: "4:5", pages: 2, bg: "#f4f2fb", items };
    },
  },
  {
    id: "p-evento-cumple", name: "Cumpleaños", photos: 3, format: "4:5", category: "eventos",
    build: (p) => ({
      format: "4:5", pages: 1, bg: "#ffd9e8", grad: { to: "#c8b6ff", angle: 45 }, items: [
        ph(pick(p, 0), 0.2, 0.18, 0.6, 0.48, { frame: "circle", border: 0.03, borderColor: "#ffffff", shadow: true }),
        ph(pick(p, 1), 0.06, 0.5, 0.26, 0.21, { frame: "circle", border: 0.04, borderColor: "#ffffff" }),
        ph(pick(p, 2), 0.72, 0.2, 0.22, 0.176, { frame: "circle", border: 0.04, borderColor: "#ffffff" }),
        sh(0.08, 0.1, 0.08, 0.064, "#ffffff", { shape: "star" }),
        sh(0.84, 0.62, 0.06, 0.048, "#F50D8A", { shape: "star" }),
        tx("¡Feliz cumpleaños!", 0.5, 0.11, { size: 0.05, curve: 50, color: "#5b2a86", font: "redonda", weight: 800 }),
        tx("30", 0.5, 0.8, { size: 0.13, weight: 800, color: "#ffffff", effect: "sombra-dura" }),
      ],
    }),
  },
];

// ---------- deporte ----------
const DEPORTE: Template[] = [
  {
    id: "p-dep-resultado", name: "Resultado del partido", photos: 1, format: "4:5", category: "deporte",
    build: (p) => ({
      format: "4:5", pages: 1, bg: "#0b1320", items: [
        ph(pick(p, 0), 0, 0, 1, 0.68),
        sh(0, 0.6, 1, 0.4, "#0b1320"),
        sh(-0.05, 0.56, 1.1, 0.1, "#F50D8A", { rot: -4, grad: { to: "#7B2FF7", angle: 0 } }),
        tx("RESULTADO FINAL", 0.5, 0.61, { size: 0.03, spacing: 0.3, font: "condensada", weight: 800, rot: -4 }),
        tx("LOCAL", 0.2, 0.76, { size: 0.028, font: "condensada", spacing: 0.1 }),
        tx("VISITANTE", 0.8, 0.76, { size: 0.028, font: "condensada", spacing: 0.1 }),
        tx("3 – 1", 0.5, 0.79, { size: 0.11, font: "impacto", weight: 400 }),
        tx("JORNADA 12", 0.5, 0.92, { size: 0.02, spacing: 0.4, color: "#8ea2c0" }),
      ],
    }),
  },
  {
    id: "p-dep-jugador", name: "Jugador del partido", photos: 1, format: "9:16", category: "deporte",
    build: (p) => ({
      format: "9:16", pages: 1, bg: "#111111", grad: { to: "#2a0f3d", angle: 90 }, items: [
        tx("MVP", 0.5, 0.3, { size: 0.3, font: "impacto", weight: 400, color: "rgba(255,255,255,.08)" }),
        ph(pick(p, 0), 0.05, 0.15, 0.9, 0.62, { cutout: true }),
        sh(0.1, 0.72, 0.8, 0.08, "#F50D8A", { shape: "roundrect", radius: 0.2, grad: { to: "#7B2FF7", angle: 0 } }),
        tx("JUGADOR DEL PARTIDO", 0.5, 0.76, { size: 0.026, font: "condensada", weight: 800, spacing: 0.1 }),
        tx("#10 · NOMBRE APELLIDO", 0.5, 0.81, { size: 0.02, spacing: 0.2, weight: 600, color: "#cfc6e6" }),
      ],
    }),
  },
  {
    id: "p-dep-convocatoria", name: "Convocatoria", photos: 1, format: "4:5", category: "deporte",
    build: (p) => {
      const items: Item[] = [
        ph(pick(p, 0), 0.52, 0, 0.48, 1),
        sh(0, 0, 0.56, 1, "#0d1b2a"),
        tx("CONVOCATORIA", 0.06, 0.1, { size: 0.045, align: "left", font: "condensada", weight: 800 }),
        tx("vs. Rival FC · Domingo 18:00", 0.06, 0.16, { size: 0.02, align: "left", weight: 500, color: "#9fb3c8" }),
      ];
      for (let i = 0; i < 11; i++) {
        items.push(tx(`${i + 1}`.padStart(2, "0"), 0.06, 0.25 + i * 0.062, { size: 0.026, align: "left", color: "#F50D8A", font: "condensada" }));
        items.push(tx("Nombre Apellido", 0.14, 0.25 + i * 0.062, { size: 0.026, align: "left", weight: 500 }));
      }
      return { format: "4:5", pages: 1, bg: "#0d1b2a", items };
    },
  },
  {
    id: "p-dep-carrusel", name: "Crónica deportiva", photos: 5, format: "4:5", carousel: true, category: "deporte",
    build: (p) => ({
      format: "4:5", pages: 3, bg: "#0b0b0b", items: [
        ph(pick(p, 0), 0, 0, 1.6, 1),
        tx("ASÍ FUE", 0.5, 0.78, { size: 0.11, font: "impacto", weight: 400, effect: "contorno", color: "#ffffff" }),
        sh(1.56, 0, 0.08, 1, "#F50D8A", { rot: 6, grad: { to: "#7B2FF7", angle: 90 } }),
        ph(pick(p, 1), 1.7, 0.06, 0.56, 0.42),
        ph(pick(p, 2), 1.7, 0.52, 0.56, 0.42),
        ph(pick(p, 3), 2.32, 0.06, 0.62, 0.88),
        sh(2.38, 0.82, 0.3, 0.08, "#ffffff", { shape: "arrow", strokeWidth: 0.012 }),
      ],
    }),
  },
];

// ---------- negocio ----------
const NEGOCIO: Template[] = [
  {
    id: "p-neg-oferta", name: "Oferta", photos: 1, format: "4:5", category: "negocio",
    build: (p) => ({
      format: "4:5", pages: 1, bg: "#fff6ee", items: [
        ph(pick(p, 0), 0.06, 0.06, 0.88, 0.6, { radius: 0.05 }),
        sh(0.66, 0.5, 0.28, 0.224, "#F50D8A", { shape: "star", points: 12, inner: 0.82, grad: { to: "#7B2FF7", angle: 45 } }),
        tx("-30%", 0.8, 0.612, { size: 0.05, weight: 800, rot: -10 }),
        tx("Rebajas de temporada", 0.06, 0.76, { size: 0.05, align: "left", color: "#1d1d1d" }),
        tx("Solo hasta el domingo en tienda y web", 0.06, 0.83, { size: 0.024, align: "left", weight: 500, color: "#6d6d6d" }),
        sh(0.06, 0.88, 0.34, 0.06, "#1d1d1d", { shape: "roundrect", radius: 0.5 }),
        tx("COMPRAR", 0.23, 0.91, { size: 0.02, spacing: 0.25, weight: 800 }),
      ],
    }),
  },
  {
    id: "p-neg-novedad", name: "Novedad (historia)", photos: 1, format: "9:16", category: "negocio",
    build: (p) => ({
      format: "9:16", pages: 1, bg: "#f1efe9", items: [
        tx("NUEVO", 0.5, 0.17, { size: 0.025, spacing: 0.6, color: "#7B2FF7" }),
        tx("Colección\nOtoño", 0.5, 0.24, { size: 0.06, color: "#151515", font: "editorial", weight: 400, lineHeight: 1.0 }),
        ph(pick(p, 0), 0.1, 0.32, 0.8, 0.44, { radius: 0.04, shadow: true }),
        sh(0.3, 0.785, 0.4, 0.035, "#151515", { shape: "roundrect", radius: 0.5 }),
        tx("Desliza hacia arriba", 0.5, 0.8025, { size: 0.016, weight: 700, spacing: 0.1 }),
      ],
    }),
  },
  {
    id: "p-neg-testimonio", name: "Opinión de cliente", photos: 1, format: "1:1", category: "negocio",
    build: (p) => ({
      format: "1:1", pages: 1, bg: "#7B2FF7", grad: { to: "#F50D8A", angle: 135 }, items: [
        tx("“", 0.14, 0.2, { size: 0.3, font: "editorial", color: "rgba(255,255,255,.35)" }),
        tx("Un trato impecable y un\nresultado mejor de lo\nque imaginábamos.", 0.5, 0.45, { size: 0.05, weight: 600, lineHeight: 1.25 }),
        ph(pick(p, 0), 0.42, 0.66, 0.16, 0.16, { frame: "circle", border: 0.05, borderColor: "#ffffff" }),
        tx("Laura M. · Cliente", 0.5, 0.88, { size: 0.03, weight: 500, color: "#f6e9ff" }),
        ...[0, 1, 2, 3, 4].map((i) => sh(0.39 + i * 0.047, 0.92, 0.036, 0.036, "#ffd166", { shape: "star" }) as Item),
      ],
    }),
  },
  {
    id: "p-neg-servicios", name: "Servicios", photos: 3, format: "4:5", carousel: true, category: "negocio",
    build: (p) => {
      const items: Item[] = [
        sh(0, 0, 1, 1, "#151515"),
        tx("Lo que\nhacemos", 0.08, 0.4, { size: 0.09, align: "left", lineHeight: 1.0, font: "jakarta", weight: 800 }),
        sh(0.08, 0.56, 0.3, 0.06, "#F50D8A", { shape: "arrow", strokeWidth: 0.012, grad: { to: "#7B2FF7", angle: 0 } }),
      ];
      const names = ["Fotografía", "Vídeo", "Redes sociales"];
      for (let i = 0; i < 3; i++) {
        const x = 1 + i * 0.0;
        items.push(ph(pick(p, i), x + 0.08 + 0, 0.06 + i * 0.31, 0.38, 0.27, { radius: 0.06 }));
        items.push(tx(`0${i + 1}`, x + 0.52, 0.12 + i * 0.31, { size: 0.03, align: "left", color: "#7B2FF7" }));
        items.push(tx(names[i], x + 0.52, 0.18 + i * 0.31, { size: 0.04, align: "left", color: "#151515" }));
      }
      return { format: "4:5", pages: 2, bg: "#f6f4f0", items };
    },
  },
];

// ---------- portfolio ----------
const PORTFOLIO: Template[] = [
  {
    id: "p-port-presenta", name: "Presentación", photos: 1, format: "4:5", category: "portfolio",
    build: (p) => ({
      format: "4:5", pages: 1, bg: "#ffffff", items: [
        ph(pick(p, 0), 0.4, 0, 0.6, 1),
        tx("Hola,\nsoy Marta", 0.06, 0.38, { size: 0.07, align: "left", color: "#111111", font: "editorial", weight: 400, lineHeight: 1.05 }),
        tx("FOTÓGRAFA · MADRID", 0.06, 0.52, { size: 0.018, align: "left", spacing: 0.3, color: "#7B2FF7" }),
        sh(0.06, 0.88, 0.25, 0.02, "#111111", { shape: "line", strokeWidth: 0.002 }),
        tx("@usuario", 0.06, 0.92, { size: 0.02, align: "left", weight: 500, color: "#111111" }),
      ],
    }),
  },
  {
    id: "p-port-serie", name: "Serie en carrusel", photos: 6, format: "4:5", carousel: true, category: "portfolio",
    build: (p) => ({
      format: "4:5", pages: 3, bg: "#ecebe7", items: [
        tx("SERIE 04", 0.1, 0.1, { size: 0.022, spacing: 0.4, align: "left", color: "#111111" }),
        tx("Luz de\ninvierno", 0.1, 0.24, { size: 0.08, align: "left", color: "#111111", font: "editorial", weight: 400, lineHeight: 1.0 }),
        ph(pick(p, 0), 0.1, 0.4, 0.8, 0.52),
        ph(pick(p, 1), 1.1, 0.08, 0.8, 0.84),
        ph(pick(p, 2), 2.08, 0.08, 0.4, 0.4),
        ph(pick(p, 3), 2.52, 0.08, 0.4, 0.4),
        ph(pick(p, 4), 2.08, 0.52, 0.84, 0.4),
        tx("1/3", 0.9, 0.95, { size: 0.016, align: "right", color: "#555555", weight: 500 }),
        tx("2/3", 1.9, 0.95, { size: 0.016, align: "right", color: "#555555", weight: 500 }),
        tx("3/3", 2.9, 0.95, { size: 0.016, align: "right", color: "#555555", weight: 500 }),
      ],
    }),
  },
  {
    id: "p-port-antes", name: "Antes y después", photos: 2, format: "4:5", category: "portfolio",
    build: (p) => ({
      format: "4:5", pages: 1, bg: "#111111", items: [
        ph(pick(p, 0), 0, 0, 0.5, 1),
        ph(pick(p, 1), 0.5, 0, 0.5, 1),
        sh(0.4985, 0, 0.003, 1, "#ffffff"),
        tx("ANTES", 0.25, 0.92, { size: 0.022, spacing: 0.3, box: "rgba(0,0,0,.55)", boxPad: 0.6 }),
        tx("DESPUÉS", 0.75, 0.92, { size: 0.022, spacing: 0.3, box: "rgba(0,0,0,.55)", boxPad: 0.6 }),
      ],
    }),
  },
  {
    id: "p-port-tarifas", name: "Tarifas (historia)", photos: 1, format: "9:16", category: "portfolio",
    build: (p) => {
      const items: Item[] = [
        ph(pick(p, 0), 0, 0, 1, 0.42),
        sh(0, 0.34, 1, 0.66, "#141414", { shape: "roundrect", radius: 0.06 }),
        tx("Sesiones 2026", 0.5, 0.4, { size: 0.035, font: "editorial", weight: 400 }),
      ];
      [["Retrato", "120 €"], ["Pareja", "180 €"], ["Familia", "220 €"], ["Evento", "desde 450 €"]].forEach(([a, b], i) => {
        const y = 0.48 + i * 0.075;
        items.push(sh(0.08, y - 0.028, 0.84, 0.056, "rgba(255,255,255,.06)", { shape: "roundrect", radius: 0.4, stroke: "rgba(255,255,255,.18)", strokeWidth: 0.001 }));
        items.push(tx(a, 0.13, y, { size: 0.022, align: "left", weight: 600 }));
        items.push(tx(b, 0.87, y, { size: 0.022, align: "right", color: "#F50D8A" }));
      });
      items.push(tx("Reserva por mensaje directo", 0.5, 0.79, { size: 0.018, weight: 500, color: "#bdb6cc" }));
      return { format: "9:16", pages: 1, bg: "#141414", items };
    },
  },
];

// ---------- vídeo (Reels / Historias / TikTok) ----------
/** Escena de foto a pantalla completa con zoom lento y fundido de entrada. */
const scene = (photo: string | undefined, page: number, dur: number): PhotoItem =>
  ph(photo, page, 0, 1, 1, { anim: an("lento", 0, dur) });

const VIDEO: Template[] = [
  {
    id: "v-reel-fotos", name: "Reel de fotos", photos: 6, format: "9:16", carousel: true, video: true, perPage: 2.2, category: "video",
    build: (p) => {
      const n = Math.max(3, Math.min(10, p.length || 6));
      const items: Item[] = [];
      for (let i = 0; i < n; i++) items.push(scene(pick(p, i), i, 2.2));
      items.push(tx("Nuestro verano", 0.5, 0.5, { size: 0.06, font: "manuscrita", weight: 400, effect: "elevado", anim: an("zoom", 0.3, 0.8) }));
      return { format: "9:16", pages: n, bg: "#000000", items };
    },
  },
  {
    id: "v-boda-trailer", name: "Tráiler de boda", photos: 5, format: "9:16", carousel: true, video: true, perPage: 3, category: "video",
    build: (p) => {
      const items: Item[] = [];
      const lines = ["Ana & Leo", "12 · 09 · 2026", "", "", "Para siempre"];
      for (let i = 0; i < 5; i++) {
        items.push(scene(pick(p, i), i, 3));
        if (lines[i]) items.push(tx(lines[i], i + 0.5, 0.62, {
          size: i === 1 ? 0.028 : 0.07, font: i === 1 ? "jakarta" : "elegante", weight: i === 1 ? 600 : 400,
          spacing: i === 1 ? 0.35 : 0, shadow: true, anim: an("aparecer", 0.5, 1.2),
        }));
      }
      return { format: "9:16", pages: 5, bg: "#000000", items };
    },
  },
  {
    id: "v-evento-promo", name: "Promo de evento", photos: 3, format: "9:16", carousel: true, video: true, perPage: 2.6, category: "video",
    build: (p) => ({
      format: "9:16", pages: 3, bg: "#0d0b1a", items: [
        scene(pick(p, 0), 0, 2.6),
        tx("ESTE\nVIERNES", 0.5, 0.45, { size: 0.09, font: "condensada", weight: 800, lineHeight: 0.95, effect: "neon", color: "#F50D8A", anim: an("zoom", 0.2, 0.6) }),
        scene(pick(p, 1), 1, 2.6),
        tx("MÚSICA EN DIRECTO", 1.5, 0.5, { size: 0.04, font: "condensada", weight: 800, box: "#7B2FF7", anim: an("deslizar", 0.2, 0.6, "izquierda") }),
        scene(pick(p, 2), 2, 2.6),
        sh(2.15, 0.6, 0.7, 0.07, "#F50D8A", { shape: "roundrect", radius: 0.5, grad: { to: "#7B2FF7", angle: 0 }, anim: an("subir", 0.3, 0.6) }),
        tx("ENTRADAS YA", 2.5, 0.635, { size: 0.03, weight: 800, spacing: 0.2, anim: an("subir", 0.4, 0.6) }),
      ],
    }),
  },
  {
    id: "v-dep-highlights", name: "Mejores momentos", photos: 4, format: "9:16", carousel: true, video: true, perPage: 1.8, category: "video",
    build: (p) => {
      const items: Item[] = [];
      for (let i = 0; i < 4; i++) {
        items.push(scene(pick(p, i), i, 1.8));
        items.push(sh(i - 0.05, 0.7, 1.1, 0.09, "#F50D8A", { rot: -5, grad: { to: "#7B2FF7", angle: 0 }, anim: an("deslizar", 0.1, 0.4, "izquierda") }));
        items.push(tx(["GOLAZO", "DEFENSA", "EQUIPO", "¡VICTORIA!"][i], i + 0.5, 0.745, { size: 0.05, font: "impacto", weight: 400, rot: -5, anim: an("deslizar", 0.2, 0.4, "derecha") }));
      }
      return { format: "9:16", pages: 4, bg: "#000000", items };
    },
  },
  {
    id: "v-neg-producto", name: "Producto en vídeo", photos: 3, format: "4:5", carousel: true, video: true, perPage: 2.5, category: "video",
    build: (p) => ({
      format: "4:5", pages: 3, bg: "#f1efe9", items: [
        ph(pick(p, 0), 0.1, 0.1, 0.8, 0.64, { radius: 0.04, anim: an("zoom", 0, 0.7) }),
        tx("Nuevo", 0.5, 0.85, { size: 0.06, font: "editorial", weight: 400, color: "#151515", anim: an("subir", 0.4, 0.6) }),
        ph(pick(p, 1), 1.1, 0.1, 0.8, 0.64, { radius: 0.04, anim: an("deslizar", 0, 0.7, "derecha") }),
        tx("Hecho a mano", 1.5, 0.85, { size: 0.045, color: "#151515", anim: an("subir", 0.4, 0.6) }),
        ph(pick(p, 2), 2.1, 0.1, 0.8, 0.64, { radius: 0.04, anim: an("deslizar", 0, 0.7, "izquierda") }),
        sh(2.3, 0.81, 0.4, 0.075, "#151515", { shape: "roundrect", radius: 0.5, anim: an("zoom", 0.4, 0.5) }),
        tx("Ya en tienda", 2.5, 0.8475, { size: 0.026, weight: 700, anim: an("aparecer", 0.6, 0.5) }),
      ],
    }),
  },
  {
    id: "v-portfolio", name: "Portfolio en vídeo", photos: 6, format: "9:16", carousel: true, video: true, perPage: 2, category: "video",
    build: (p) => {
      const items: Item[] = [
        sh(0, 0, 1, 1, "#111111"),
        tx("PORTFOLIO", 0.5, 0.46, { size: 0.05, spacing: 0.4, anim: an("aparecer", 0.1, 0.8) }),
        tx("2026", 0.5, 0.52, { size: 0.025, spacing: 0.4, color: "#F50D8A", anim: an("subir", 0.5, 0.6) }),
      ];
      const n = Math.max(2, Math.min(9, p.length || 6));
      for (let i = 0; i < n; i++) items.push(scene(pick(p, i), i + 1, 2));
      items.push(tx("@usuario", n + 0.5 - 0, 0.78, { size: 0.025, weight: 600, box: "rgba(0,0,0,.5)", anim: an("aparecer", 0.3, 0.6) }));
      return { format: "9:16", pages: n + 1, bg: "#111111", items };
    },
  },
];

export const PRO_TEMPLATES: Template[] = [...BODAS, ...EVENTOS, ...DEPORTE, ...NEGOCIO, ...PORTFOLIO];
export const VIDEO_TEMPLATES: Template[] = VIDEO;

export const TEMPLATE_CATEGORIES: { id: NonNullable<Template["category"]>; name: string }[] = [
  { id: "bodas", name: "Bodas" },
  { id: "eventos", name: "Eventos" },
  { id: "deporte", name: "Deporte" },
  { id: "negocio", name: "Negocio" },
  { id: "portfolio", name: "Portfolio" },
  { id: "video", name: "Vídeo" },
];
