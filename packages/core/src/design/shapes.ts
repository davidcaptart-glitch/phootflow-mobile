// Formas: geometría pura de estrella, polígono y flecha (puntos dentro de una caja, en px). Sin DOM.

export type ShapeKind = "rect" | "roundrect" | "circle" | "line" | "arrow" | "star" | "polygon" | "frame";

export const SHAPES: { id: ShapeKind; name: string }[] = [
  { id: "rect", name: "Rectángulo" },
  { id: "roundrect", name: "Rectángulo redondeado" },
  { id: "circle", name: "Círculo" },
  { id: "line", name: "Línea" },
  { id: "arrow", name: "Flecha" },
  { id: "star", name: "Estrella" },
  { id: "polygon", name: "Polígono" },
  { id: "frame", name: "Marco" },
];

export type Pt = [number, number];

/** Estrella de `points` puntas inscrita en la caja; `inner` = radio interior / exterior. */
export function starPoints(x: number, y: number, w: number, h: number, points = 5, inner = 0.45): Pt[] {
  const n = Math.max(3, Math.round(points)), cx = x + w / 2, cy = y + h / 2, out: Pt[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? inner : 1, a = -Math.PI / 2 + (i * Math.PI) / n;
    out.push([cx + (Math.cos(a) * r * w) / 2, cy + (Math.sin(a) * r * h) / 2]);
  }
  return out;
}

/** Polígono regular de `sides` lados inscrito en la caja (con un vértice arriba). */
export function polygonPoints(x: number, y: number, w: number, h: number, sides = 6): Pt[] {
  const n = Math.max(3, Math.round(sides)), cx = x + w / 2, cy = y + h / 2, out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    out.push([cx + (Math.cos(a) * w) / 2, cy + (Math.sin(a) * h) / 2]);
  }
  return out;
}

/** Flecha horizontal de izquierda a derecha por el centro de la caja. `t` = grosor del palo (px).
 *  Devuelve el palo (de inicio al arranque de la punta) y el triángulo de la punta. */
export function arrowGeometry(x: number, y: number, w: number, h: number, t: number) {
  const cy = y + h / 2;
  const head = Math.min(w * 0.35, Math.max(t * 3.2, h * 0.5));
  const half = Math.max(t * 1.6, Math.min(h / 2, head * 0.6));
  return {
    shaft: [[x, cy], [x + w - head * 0.9, cy]] as Pt[],
    head: [[x + w, cy], [x + w - head, cy - half], [x + w - head, cy + half]] as Pt[],
  };
}
