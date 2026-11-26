// Enderezar automático (como detect_tilt de escritorio): con los bordes fuertes de la foto se busca el giro que
// mejor alinea las líneas casi horizontales (horizonte) y casi verticales (edificios, marcos): una transformada
// de Hough limitada a ±maxDeg. Puro, sin DOM.

/** Inclinación en grados (positiva = el horizonte sube hacia la derecha). 0 si no hay base clara. */
export function detectTilt(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, maxDeg = 10): number {
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = rgba[i * 4] * 0.3 + rgba[i * 4 + 1] * 0.59 + rgba[i * 4 + 2] * 0.11;
  // bordes: casi horizontales (gradiente vertical fuerte) y casi verticales (gradiente horizontal fuerte)
  const hor: number[] = [], ver: number[] = [], mh: number[] = [], mv: number[] = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1];
    const gy = g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - w] - g[i - w + 1];
    const m = Math.hypot(gx, gy);
    if (m < 40) continue;
    if (Math.abs(gy) > Math.abs(gx) * 2.5) { hor.push(x, y); mh.push(m); }
    else if (Math.abs(gx) > Math.abs(gy) * 2.5) { ver.push(x, y); mv.push(m); }
  }
  const best = (pts: number[], vertical: boolean) => {
    const n = pts.length / 2;
    if (n < 30) return { deg: 0, score: 0 };
    const step = Math.max(1, Math.floor(n / 4000)); // como mucho ~4000 puntos
    const size = Math.ceil(Math.hypot(w, h)) * 2 + 4;
    const bins = new Float32Array(size);
    let bestDeg = 0, bestScore = 0, base = 0;
    for (let k = -maxDeg * 10; k <= maxDeg * 10; k++) {
      const a = (k / 10) * (Math.PI / 180), ca = Math.cos(a), sa = Math.sin(a);
      bins.fill(0);
      for (let j = 0; j < n; j += step) {
        const x = pts[j * 2], y = pts[j * 2 + 1];
        // horizonte que sube a la derecha: y + x·tan(a) constante; vertical inclinada: x − y·tan(a) constante
        const r = vertical ? x * ca - y * sa : y * ca + x * sa;
        bins[Math.round(r) + (size >> 1)] += 1;
      }
      let sc = 0;
      for (let b = 0; b < size; b++) sc += bins[b] * bins[b];
      if (k === 0) base = sc;
      if (sc > bestScore) { bestScore = sc; bestDeg = k / 10; }
    }
    // cuánto mejora frente a no girar (líneas de verdad alineadas dan mucho más)
    return { deg: bestDeg, score: base ? bestScore / base : 0, n };
  };
  const H = best(hor, false), V = best(ver, true);
  // la familia con más puntos alineados manda; si ambas coinciden mejor
  const cands = [H, V].filter((c) => c.score > 1.05 || (c.deg === 0 && c.score >= 1));
  if (!cands.length) return 0;
  const pick = cands.sort((a, b) => (b.n ?? 0) * b.score - (a.n ?? 0) * a.score)[0];
  return Math.abs(pick.deg) < 0.3 ? 0 : pick.deg;
}

/** Ampliación necesaria para que una foto w×h girada `deg` grados no deje esquinas vacías. */
export function rotateCover(deg: number, w: number, h: number): number {
  const a = Math.abs((deg * Math.PI) / 180);
  return Math.max((w * Math.cos(a) + h * Math.sin(a)) / w, (w * Math.sin(a) + h * Math.cos(a)) / h);
}
