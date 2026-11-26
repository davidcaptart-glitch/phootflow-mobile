// Recorte inteligente para redes (versión ligera de smartcrop.py): el recorte más grande de la proporción
// pedida, colocado sobre las personas. Con caras, la línea de los ojos va al tercio superior.
import type { Box, PhotoStats } from "./types";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function union(boxes: Box[]): Box {
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Recorte (normalizado) de proporción `ratio` (ancho/alto en píxeles) para la foto. */
export function smartCrop(s: PhotoStats, ratio: number): Box {
  const imgR = s.width / s.height;
  // tamaño máximo con esa proporción, en coordenadas normalizadas
  let w = 1, h = 1;
  if (ratio < imgR) w = ratio / imgR; else h = imgR / ratio;

  let cx = 0.5, cy = 0.5;
  if (s.faces.length) {
    const g = union(s.faces);
    cx = g.x + g.w / 2;
    const eyes = g.y + g.h * 0.4;
    // ojos en el tercio superior del recorte, si cabe la cabeza entera
    cy = eyes + h / 2 - h / 3;
    if (g.y < cy - h / 2) cy = g.y - g.h * 0.25 + h / 2;
  } else if (s.people) {
    cx = s.people.x + s.people.w / 2;
    cy = s.people.y + s.people.h / 2;
  }
  const x = clamp(cx - w / 2, 0, 1 - w);
  const y = clamp(cy - h / 2, 0, 1 - h);
  return { x, y, w, h };
}

/** ¿Corta el recorte a alguna cara? (para avisar en la revisión). */
export function cutsFace(s: PhotoStats, c: Box): boolean {
  return s.faces.some((f) => f.x < c.x - 0.002 || f.y < c.y - 0.002 ||
    f.x + f.w > c.x + c.w + 0.002 || f.y + f.h > c.y + c.h + 0.002);
}

/** Encuadre con la proporción `ratio` centrado en (cx, cy) y de tamaño `zoom` (1 = el mayor que cabe; 0,3 = un
 *  tercio), sin salirse de la foto. Para retocar el recorte a mano. */
export function frameCrop(imgRatio: number, ratio: number, cx: number, cy: number, zoom: number): Box {
  let w = 1, h = 1;
  if (ratio < imgRatio) w = ratio / imgRatio; else h = imgRatio / ratio;
  const z = Math.min(1, Math.max(0.15, zoom));
  w *= z; h *= z;
  const x = Math.min(1 - w, Math.max(0, cx - w / 2)), y = Math.min(1 - h, Math.max(0, cy - h / 2));
  return { x, y, w, h };
}

/** Tamaño relativo (zoom de frameCrop) de un encuadre. */
export function cropZoom(c: Box, imgRatio: number, ratio: number): number {
  return ratio < imgRatio ? c.w / (ratio / imgRatio) : c.h / (imgRatio / ratio);
}
