// Retrato completo (dentro de «Belleza»): con los 478 puntos de la cara de MediaPipe FaceLandmarker se dibujan
// máscaras de ojos, iris, boca (dientes) y ojeras, como el retoque de retrato de Edits en escritorio
// (dientes, ojos, iris, ojeras con la luz del pómulo). Todo en el móvil.
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import type { Mask } from "../render/renderer";
import type { Pixels } from "../render/image";
import { WASM_URL } from "./vision";

export const LANDMARK_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// Índices de la malla de la cara (MediaPipe Face Mesh)
const EYE_L = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const EYE_R = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const LOWER_L = [33, 7, 163, 144, 145, 153, 154, 155, 133];
const LOWER_R = [263, 249, 390, 373, 374, 380, 381, 382, 362];
const MOUTH_IN = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
const IRIS_L = [468, 469, 470, 471, 472];
const IRIS_R = [473, 474, 475, 476, 477];

let lm: Promise<FaceLandmarker> | null = null;

function landmarker() {
  lm ??= FilesetResolver.forVisionTasks(WASM_URL).then(async (fs) => {
    const make = (delegate: "GPU" | "CPU") => FaceLandmarker.createFromOptions(fs, {
      baseOptions: { modelAssetPath: LANDMARK_MODEL, delegate }, runningMode: "IMAGE", numFaces: 6,
    });
    try { return await make("GPU"); } catch { return make("CPU"); }
  });
  lm.catch(() => (lm = null));
  return lm;
}

/** Puntos de las caras (normalizados 0..1) de una foto; [] si no hay o la IA no está disponible. */
export async function faceLandmarks(img: Pixels): Promise<{ x: number; y: number }[][]> {
  try {
    const det = await landmarker();
    return (det.detect(img as unknown as HTMLCanvasElement).faceLandmarks ?? []) as { x: number; y: number }[][];
  } catch {
    return [];
  }
}

export function warmUpPortrait() {
  void landmarker().catch(() => {});
}

type P = { x: number; y: number };

function canvas(w: number, h: number) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

/**
 * Máscara RGBA de retrato a w×h: R = ojos (blanco del ojo), G = iris, B = interior de la boca (dientes),
 * A = ojeras. null si no hay caras o la IA no está disponible.
 */
export async function portraitMask(img: Pixels, w = 512): Promise<Mask | null> {
  try {
    const det = await landmarker();
    const r = det.detect(img as unknown as HTMLCanvasElement);
    const faces = r.faceLandmarks ?? [];
    if (!faces.length) return null;
    const h = Math.max(1, Math.round((w * img.height) / img.width));
    const layers = [0, 1, 2, 3].map(() => {
      const c = canvas(w, h);
      const ctx = c.getContext("2d") as CanvasRenderingContext2D;
      ctx.fillStyle = "#fff";
      return { c, ctx };
    });
    const pt = (f: P[], i: number) => ({ x: f[i].x * w, y: f[i].y * h });
    const poly = (ctx: CanvasRenderingContext2D, ps: P[]) => {
      ctx.beginPath();
      ps.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
    };
    for (const f of faces as P[][]) {
      const faceW = Math.hypot((f[454].x - f[234].x) * w, (f[454].y - f[234].y) * h);
      const feather = Math.max(1, faceW * 0.012);
      for (const L of layers) L.ctx.filter = `blur(${feather}px)`;
      // ojos
      for (const eye of [EYE_L, EYE_R]) poly(layers[0].ctx, eye.map((i) => pt(f, i)));
      // iris: círculo con el centro y el radio de sus 4 puntos
      if (f.length > 477) {
        for (const ir of [IRIS_L, IRIS_R]) {
          const c = pt(f, ir[0]);
          const rad = ir.slice(1).reduce((a, i) => a + Math.hypot(pt(f, i).x - c.x, pt(f, i).y - c.y), 0) / 4;
          layers[1].ctx.beginPath();
          layers[1].ctx.arc(c.x, c.y, rad, 0, Math.PI * 2);
          layers[1].ctx.fill();
        }
      }
      // boca por dentro
      poly(layers[2].ctx, MOUTH_IN.map((i) => pt(f, i)));
      // ojeras: media luna bajo el párpado inferior
      layers[3].ctx.filter = `blur(${feather * 3}px)`;
      for (const lower of [LOWER_L, LOWER_R]) {
        const ps = lower.map((i) => pt(f, i));
        const eyeW = Math.hypot(ps[ps.length - 1].x - ps[0].x, ps[ps.length - 1].y - ps[0].y);
        const down = ps.map((p, k) => {
          const t = Math.sin((k / (ps.length - 1)) * Math.PI); // más hondo en el centro
          return { x: p.x, y: p.y + eyeW * (0.12 + 0.3 * t) };
        });
        poly(layers[3].ctx, [...ps.map((p) => ({ x: p.x, y: p.y + eyeW * 0.04 })), ...down.reverse()]);
      }
    }
    const data = new Uint8Array(w * h * 4);
    layers.forEach((L, ch) => {
      const d = L.ctx.getImageData(0, 0, w, h).data;
      for (let i = 0; i < w * h; i++) data[i * 4 + ch] = d[i * 4 + 3];
    });
    return { data, width: w, height: h, channels: 4 };
  } catch {
    return null;
  }
}
