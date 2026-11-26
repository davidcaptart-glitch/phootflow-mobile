// IA local en el móvil (MediaPipe Tasks, Apache-2.0): caras, segmentación de la persona (pelo, piel, cara, ropa)
// y de objetos (DeepLab v3: coches, animales, plantas, muebles…). Nada sale del teléfono. Los modelos se
// descargan la primera vez y el service worker los guarda; en la app nativa irán dentro del paquete.
import { FaceDetector, FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";
import type { Box } from "../engine/types";
import type { Mask } from "../render/renderer";
import type { Pixels } from "../render/image";

const VERSION = "0.10.18";
export const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
export const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
export const SEG_MODEL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";
export const OBJ_MODEL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite";

/** Elementos que se pueden elegir como máscara (color selectivo y, en Pro, ajustes locales). */
export interface Element { id: string; name: string; group: "Persona" | "Objetos"; }

// selfie_multiclass: 0 fondo, 1 pelo, 2 piel del cuerpo, 3 piel de la cara, 4 ropa, 5 complementos
// deeplab_v3 (PASCAL VOC): 0 fondo, 1 avión, 2 bici, 3 pájaro, 4 barco, 5 botella, 6 autobús, 7 coche, 8 gato,
// 9 silla, 10 vaca, 11 mesa, 12 perro, 13 caballo, 14 moto, 15 persona, 16 planta, 17 oveja, 18 sofá, 19 tren, 20 tele
const OBJECTS: [string, string, number[]][] = [
  ["car", "Coche", [7, 6]], ["moto", "Moto", [14]], ["bike", "Bici", [2]], ["dog", "Perro", [12]], ["cat", "Gato", [8]],
  ["horse", "Caballo", [13]], ["bird", "Pájaro", [3]], ["animal", "Vaca u oveja", [10, 17]], ["plant", "Planta o flores", [16]],
  ["bottle", "Botella o copa", [5]], ["table", "Mesa", [11]], ["seat", "Silla o sofá", [9, 18]], ["boat", "Barco", [4]],
  ["plane", "Avión", [1]], ["train", "Tren", [19]], ["tv", "Pantalla", [20]],
];

export const ELEMENTS: Element[] = [
  { id: "clothes", name: "Ropa", group: "Persona" },
  { id: "accessories", name: "Complementos", group: "Persona" },
  { id: "hair", name: "Pelo", group: "Persona" },
  { id: "face", name: "Cara", group: "Persona" },
  { id: "skin", name: "Piel", group: "Persona" },
  { id: "person", name: "Persona entera", group: "Persona" },
  { id: "background", name: "Fondo", group: "Persona" },
  ...OBJECTS.map(([id, name]) => ({ id, name, group: "Objetos" as const })),
];
export const elementName = (id: string) => ELEMENTS.find((e) => e.id === id)?.name ?? id;

let faces: Promise<FaceDetector> | null = null;
let seg: Promise<ImageSegmenter> | null = null;
let obj: Promise<ImageSegmenter> | null = null;

async function fileset() {
  return FilesetResolver.forVisionTasks(WASM_URL);
}

async function withDelegate<T>(make: (d: "GPU" | "CPU") => Promise<T>): Promise<T> {
  try { return await make("GPU"); } catch { return make("CPU"); }
}

function faceDetector() {
  faces ??= fileset().then((fs) => withDelegate((delegate) => FaceDetector.createFromOptions(fs, {
    baseOptions: { modelAssetPath: FACE_MODEL, delegate }, runningMode: "IMAGE", minDetectionConfidence: 0.5,
  })));
  faces.catch(() => (faces = null));
  return faces;
}

function segmenter(model: string) {
  return fileset().then((fs) => withDelegate((delegate) => ImageSegmenter.createFromOptions(fs, {
    baseOptions: { modelAssetPath: model, delegate }, runningMode: "IMAGE",
    outputConfidenceMasks: true, outputCategoryMask: false,
  })));
}

function personSegmenter() {
  seg ??= segmenter(SEG_MODEL);
  seg.catch(() => (seg = null));
  return seg;
}

function objectSegmenter() {
  obj ??= segmenter(OBJ_MODEL);
  obj.catch(() => (obj = null));
  return obj;
}

/** Cargar los modelos antes de que hagan falta. */
export function warmUp(objects = false) {
  void faceDetector().catch(() => {});
  void personSegmenter().catch(() => {});
  if (objects) void objectSegmenter().catch(() => {});
}

/** Caras normalizadas 0..1. Con la IA no disponible (sin conexión la primera vez), lista vacía. */
export async function detectFaces(img: Pixels): Promise<Box[]> {
  try {
    const det = await faceDetector();
    const r = det.detect(img as unknown as HTMLCanvasElement);
    return r.detections.map((d) => {
      const b = d.boundingBox!;
      return { x: b.originX / img.width, y: b.originY / img.height, w: b.width / img.width, h: b.height / img.height };
    }).filter((b) => b.w > 0.015);
  } catch {
    return [];
  }
}

export interface Segmentation {
  person: Mask;
  skin: Mask;
  /** Máscaras con nombre (ids de ELEMENTS), solo las que aparecen en la foto. Todas del mismo tamaño. */
  masks: Record<string, Mask>;
  box: Box | null;
}

const u8 = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);

/** Remuestrea (vecino más próximo) una máscara de confianza a w×h. */
function resample(src: Float32Array, sw: number, sh: number, w: number, h: number): Float32Array {
  if (sw === w && sh === h) return src;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(sh - 1, Math.floor(((y + 0.5) / h) * sh)) * sw;
    for (let x = 0; x < w; x++) out[y * w + x] = src[sy + Math.min(sw - 1, Math.floor(((x + 0.5) / w) * sw))];
  }
  return out;
}

function toMask(f: (i: number) => number, w: number, h: number, minShare = 0.002): Mask | null {
  const data = new Uint8Array(w * h);
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    data[i] = u8(f(i));
    if (data[i] > 128) n++;
  }
  return n > w * h * minShare ? { data, width: w, height: h } : null;
}

/**
 * Persona (pelo, piel, cara, ropa, complementos, persona, fondo) y, con `objects`, también objetos de DeepLab.
 * null si la IA no está disponible.
 */
export async function segment(img: Pixels, objects = false): Promise<Segmentation | null> {
  try {
    const s = await personSegmenter();
    const r = s.segment(img as unknown as HTMLCanvasElement);
    const cm = r.confidenceMasks;
    if (!cm || cm.length < 6) { r.close(); return null; }
    const w = cm[0].width, h = cm[0].height;
    const [bg, hair, body, face, clothes, acc] = cm.map((m) => m.getAsFloat32Array());
    r.close();

    const person = toMask((i) => 1 - bg[i], w, h, 0)!;
    const skin = toMask((i) => face[i] + body[i] * 0.8, w, h, 0)!;
    const masks: Record<string, Mask> = {};
    const add = (id: string, m: Mask | null) => { if (m) masks[id] = m; };
    add("clothes", toMask((i) => clothes[i], w, h));
    add("accessories", toMask((i) => acc[i], w, h));
    add("hair", toMask((i) => hair[i], w, h));
    add("face", toMask((i) => face[i], w, h));
    add("skin", toMask((i) => face[i] + body[i], w, h));
    add("person", toMask((i) => 1 - bg[i], w, h));
    add("background", toMask((i) => bg[i], w, h));

    if (objects) {
      try {
        const os = await objectSegmenter();
        const ro = os.segment(img as unknown as HTMLCanvasElement);
        const om = ro.confidenceMasks ?? [];
        if (om.length >= 21) {
          const ow = om[0].width, oh = om[0].height;
          const cls = om.map((m) => resample(m.getAsFloat32Array(), ow, oh, w, h));
          for (const [id, , ids] of OBJECTS) add(id, toMask((i) => ids.reduce((a, k) => a + cls[k][i], 0), w, h, 0.003));
        }
        ro.close();
      } catch { /* sin modelo de objetos: solo los de la persona */ }
    }

    let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0;
    for (let i = 0; i < w * h; i++) {
      if (person.data[i] > 128) {
        const x = i % w, y = (i / w) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; n++;
      }
    }
    const box = n > w * h * 0.005 ? { x: x0 / w, y: y0 / h, w: (x1 - x0 + 1) / w, h: (y1 - y0 + 1) / h } : null;
    return { person, skin, masks, box };
  } catch {
    return null;
  }
}

/** Unión de las máscaras elegidas (máximo por píxel). null si la foto no tiene ninguna de ellas. */
export function unionMask(masks: Record<string, Mask>, ids: string[]): Mask | null {
  const ms = ids.map((id) => masks[id]).filter(Boolean);
  if (!ms.length) return null;
  if (ms.length === 1) return ms[0];
  const { width, height } = ms[0];
  const data = new Uint8Array(width * height);
  for (const m of ms) for (let i = 0; i < data.length; i++) if (m.data[i] > data[i]) data[i] = m.data[i];
  return { data, width, height };
}
