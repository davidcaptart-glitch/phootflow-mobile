// Quitar objetos y personas (como el relleno con LaMa de Edits en escritorio, pero con un modelo pensado para
// móviles): MI-GAN de Picsart AI Research (MIT, ≈28 MB). El «pipeline» acepta la foto entera (uint8, NCHW) y una
// máscara (0 = rellenar, 255 = conservar), recorta alrededor del hueco, lo rellena a 512 px y lo devuelve pegado.
// El modelo lo sirve la app (/modelos/, tools/modelos.py) y el service worker lo guarda.
import * as ort from "onnxruntime-web/webgpu";
import type { Pixels } from "../render/image";
import type { Mask } from "../render/renderer";

export const INPAINT_MODEL = "/modelos/migan_pipeline_v2.onnx";
/** Lado largo con el que se trabaja (el relleno es a 512 px; más no aporta y gasta memoria). */
export const INPAINT_SIDE = 3072;

let sess: Promise<ort.InferenceSession> | null = null;
function session() {
  // WASM: el pipeline usa operaciones con uint8 que WebGPU no siempre admite
  sess ??= ort.InferenceSession.create(INPAINT_MODEL, { executionProviders: ["wasm"] });
  sess.catch(() => (sess = null));
  return sess;
}

export function warmUpInpaint() {
  void session().catch(() => {});
}

function canvas(w: number, h: number): Pixels {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}
const ctx2d = (c: Pixels) => c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;

/**
 * Rellena lo marcado en `hole` (lienzo del mismo tamaño o no: se escala; alfa > 0 = quitar) con algo coherente.
 * El hueco se ensancha un poco (`grow`, fracción del lado largo) para llevarse también el borde y la sombra.
 */
export async function removeArea(img: Pixels, hole: Pixels, grow = 0.008): Promise<Pixels> {
  const s = await session();
  const W = img.width, H = img.height;
  // máscara al tamaño de la foto, ensanchada con un desenfoque y umbral
  const m = canvas(W, H);
  const mc = ctx2d(m);
  const g = Math.max(2, Math.round(Math.max(W, H) * grow));
  mc.filter = `blur(${g}px)`;
  mc.drawImage(hole as CanvasImageSource, 0, 0, W, H);
  mc.filter = "none";
  const md = mc.getImageData(0, 0, W, H).data;
  const id = ctx2d(img).getImageData(0, 0, W, H).data;
  const image = new Uint8Array(3 * W * H), mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    image[i] = id[i * 4]; image[W * H + i] = id[i * 4 + 1]; image[2 * W * H + i] = id[i * 4 + 2];
    mask[i] = md[i * 4 + 3] > 8 ? 0 : 255;
  }
  const res = await s.run({
    image: new ort.Tensor("uint8", image, [1, 3, H, W]),
    mask: new ort.Tensor("uint8", mask, [1, 1, H, W]),
  });
  const o = res[s.outputNames[0]].data as Uint8Array;
  const out = canvas(W, H);
  const oc = ctx2d(out);
  const od = oc.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    od.data[i * 4] = o[i]; od.data[i * 4 + 1] = o[W * H + i]; od.data[i * 4 + 2] = o[2 * W * H + i]; od.data[i * 4 + 3] = 255;
  }
  oc.putImageData(od, 0, 0);
  return out;
}

/**
 * La figura que se ha tocado: la zona conectada de una máscara (persona, coche…) que contiene el punto (u, v).
 * Devuelve una máscara del mismo tamaño solo con esa figura, o null si ahí no hay nada.
 */
export function componentAt(m: Mask, u: number, v: number, thr = 110): Mask | null {
  const { width: w, height: h, data } = m;
  const x0 = Math.min(w - 1, Math.max(0, Math.floor(u * w))), y0 = Math.min(h - 1, Math.max(0, Math.floor(v * h)));
  if (data[y0 * w + x0] < thr) return null;
  const out = new Uint8Array(w * h);
  const stack = [y0 * w + x0];
  out[y0 * w + x0] = 255;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w, y = (i / w) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j >= 0 && !out[j] && data[j] >= thr) { out[j] = 255; stack.push(j); }
    }
  }
  return { data: out, width: w, height: h };
}
