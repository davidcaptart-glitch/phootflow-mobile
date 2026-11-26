// Personas (como people.py de escritorio): cada cara se alinea con 5 puntos (ojos, nariz, comisuras) a la plantilla
// de 112 px, SFace (OpenCV Zoo, Apache-2.0) saca su huella de 128 valores y las caras se agrupan por parecido medio
// (enlace medio, umbrales JOIN/MERGE de escritorio). Todo en el móvil; el modelo lo sirve la app (/modelos/).
import * as ort from "onnxruntime-web/webgpu";
import type { Pixels } from "../render/image";
import { faceLandmarks } from "./portrait";
import { similarity } from "./people-math";
export { JOIN, cluster, cosine, mergePeople, people, renamePerson, similarity } from "./people-math";

export const SFACE_MODEL = "/modelos/face_recognition_sface_2021dec.onnx";
/** Caras más pequeñas que esto (fracción del ancho de la foto) no cuentan: no se reconocen bien. */
export const MIN_FACE = 0.035;

// plantilla de 5 puntos de ArcFace/SFace a 112×112: ojo izq., ojo dcho., nariz, comisura izq., comisura dcha.
const TEMPLATE: [number, number][] = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];

let sess: Promise<ort.InferenceSession> | null = null;
function session() {
  sess ??= ort.InferenceSession.create(SFACE_MODEL, { executionProviders: "gpu" in navigator ? ["webgpu", "wasm"] : ["wasm"] })
    .catch(() => ort.InferenceSession.create(SFACE_MODEL, { executionProviders: ["wasm"] }));
  sess.catch(() => (sess = null));
  return sess;
}

export interface FaceRef {
  photoId: string;
  /** Huella normalizada (128). */
  emb: Float32Array;
  /** Recorte de la cara para mostrarla (96 px). */
  thumb: Blob | null;
  /** Ancho de la cara (fracción de la foto). */
  size: number;
}

export interface Person {
  id: string;
  name: string;
  /** El nombre lo ha puesto el usuario (si no, es «Persona N»). */
  named?: boolean;
  faces: FaceRef[];
  photoIds: string[];
  cover: Blob | null;
}

function canvas(w: number, h: number) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

/** Caras de una foto con su huella. */
export async function faceRefs(img: Pixels, photoId: string): Promise<FaceRef[]> {
  const faces = await faceLandmarks(img);
  if (!faces.length) return [];
  const s = await session();
  const out: FaceRef[] = [];
  for (const f of faces) {
    const P = (i: number): [number, number] => [f[i].x * img.width, f[i].y * img.height];
    const mid = (i: number[]): [number, number] => {
      const ps = i.map(P);
      return [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length];
    };
    // en la imagen, el ojo «izquierdo» de la plantilla es el que sale a la izquierda (el derecho de la persona)
    const pts: [number, number][] = [mid([33, 133, 159, 145]), mid([362, 263, 386, 374]), P(1), P(61), P(291)];
    const width = Math.hypot(P(454)[0] - P(234)[0], P(454)[1] - P(234)[1]) / img.width;
    if (width < MIN_FACE) continue;
    const t = similarity(pts, TEMPLATE);
    const c = canvas(112, 112);
    const ctx = c.getContext("2d") as CanvasRenderingContext2D;
    ctx.setTransform(t.a, t.b, -t.b, t.a, t.tx, t.ty);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img as CanvasImageSource, 0, 0);
    const px = ctx.getImageData(0, 0, 112, 112).data;
    // como cv2.FaceRecognizerSF: RGB, 0..255, sin normalizar, NCHW
    const inp = new Float32Array(3 * 112 * 112);
    for (let i = 0; i < 112 * 112; i++) { inp[i] = px[i * 4]; inp[112 * 112 + i] = px[i * 4 + 1]; inp[2 * 112 * 112 + i] = px[i * 4 + 2]; }
    const res = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", inp, [1, 3, 112, 112]) });
    const e = Float32Array.from(res[s.outputNames[0]].data as Float32Array);
    let n = 0;
    for (const v of e) n += v * v;
    n = Math.sqrt(n) || 1;
    for (let i = 0; i < e.length; i++) e[i] /= n;
    const th = canvas(96, 96);
    (th.getContext("2d") as CanvasRenderingContext2D).drawImage(c as CanvasImageSource, 0, 0, 96, 96);
    const thumb = "convertToBlob" in th ? await th.convertToBlob({ type: "image/jpeg", quality: 0.85 }) : null;
    out.push({ photoId, emb: e, thumb, size: width });
  }
  return out;
}

