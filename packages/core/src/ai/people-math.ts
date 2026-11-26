// Parte pura de Personas (sin modelo ni DOM): alinear caras y agruparlas. Se prueba en Node.
import type { FaceRef, Person } from "./people";

/** Parecido medio mínimo para entrar en un grupo y para unir dos (SFace: 0,363 = misma persona en LFW). */
export const JOIN = 0.4;

/** Transformación de semejanza (escala, giro, desplazamiento) que lleva `src` a `dst` por mínimos cuadrados. */
export function similarity(src: [number, number][], dst: [number, number][]) {
  const n = src.length;
  let sx = 0, sy = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { sx += src[i][0]; sy += src[i][1]; dx += dst[i][0]; dy += dst[i][1]; }
  sx /= n; sy /= n; dx /= n; dy /= n;
  let a = 0, b = 0, d = 0;
  for (let i = 0; i < n; i++) {
    const x = src[i][0] - sx, y = src[i][1] - sy, u = dst[i][0] - dx, v = dst[i][1] - dy;
    a += x * u + y * v; b += x * v - y * u; d += x * x + y * y;
  }
  a /= d; b /= d; // [a -b; b a]
  return { a, b, tx: dx - (a * sx - b * sy), ty: dy - (b * sx + a * sy) };
}

export const cosine = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/** Agrupa por enlace medio: se unen los dos grupos más parecidos mientras su parecido medio sea ≥ join. */
export function cluster(faces: FaceRef[], join = JOIN): FaceRef[][] {
  let groups = faces.map((f) => [f]);
  const sim = (g: FaceRef[], h: FaceRef[]) => {
    let s = 0;
    for (const a of g) for (const b of h) s += cosine(a.emb, b.emb);
    return s / (g.length * h.length);
  };
  for (;;) {
    let best = -1, bi = -1, bj = -1;
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      // dos caras de la misma foto no son la misma persona
      if (groups[i].some((a) => groups[j].some((b) => a.photoId === b.photoId))) continue;
      const s = sim(groups[i], groups[j]);
      if (s > best) { best = s; bi = i; bj = j; }
    }
    if (best < join) break;
    groups[bi] = [...groups[bi], ...groups[bj]];
    groups = groups.filter((_, k) => k !== bj);
  }
  return groups.sort((a, b) => b.length - a.length);
}

/** Personas de la sesión: grupos con ≥ 2 fotos (los sueltos no ayudan a filtrar), la cara más grande de portada. */
export function people(faces: FaceRef[], names: Record<string, string> = {}): Person[] {
  return cluster(faces).filter((g) => new Set(g.map((f) => f.photoId)).size >= 2).map((g, i) => {
    const cover = g.slice().sort((a, b) => b.size - a.size)[0];
    const id = `p${i + 1}`;
    return { id, name: names[id] ?? `Persona ${i + 1}`, faces: g, photoIds: [...new Set(g.map((f) => f.photoId))], cover: cover.thumb };
  });
}
