// «Mejorar con IA» en el móvil (como FX.enhance_detail de escritorio): Real-ESRGAN General x4v3 (BSD-3, ≈5 MB)
// con el truco ×0,5 → ×4 → ×1, por bloques de 128 px con solape, mezclado con la foto según `amount`.
// Con WebGPU si el móvil lo tiene; si no, WASM. Pensado para las fotos que el usuario elige, no para todas.
// El modelo lo sirve la propia app (/modelos/…, lo deja ahí tools/modelos.py) y el service worker lo guarda.
import * as ort from "onnxruntime-web/webgpu";
import type { Pixels } from "../render/image";

export const ENHANCE_MODEL = "/modelos/real_esrgan_general_x4v3.onnx";
/** Los pesos van aparte (así viene el modelo de Qualcomm AI Hub). */
const EXTERNAL = [{ path: "real_esrgan_general_x4v3.data", data: "/modelos/real_esrgan_general_x4v3.data" }];
const TILE = 128, PAD = 12;

ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/";

let sess: Promise<ort.InferenceSession> | null = null;

function session() {
  sess ??= (async () => {
    const eps: string[] = "gpu" in navigator ? ["webgpu", "wasm"] : ["wasm"];
    try {
      return await ort.InferenceSession.create(ENHANCE_MODEL, { executionProviders: eps, externalData: EXTERNAL });
    } catch {
      return ort.InferenceSession.create(ENHANCE_MODEL, { executionProviders: ["wasm"], externalData: EXTERNAL });
    }
  })();
  sess.catch(() => (sess = null));
  return sess;
}

/** ¿Se puede usar? (el modelo está en la app y carga). */
export async function enhanceReady(): Promise<boolean> {
  try { await session(); return true; } catch { return false; }
}

function canvas(w: number, h: number): Pixels {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}
const ctx2d = (c: Pixels) => c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;

/** Amplía ×4 con la IA (por bloques). */
async function x4(src: Pixels, onTile?: (k: number, n: number) => void): Promise<Pixels> {
  const s = await session();
  const W = src.width, H = src.height, S = TILE - 2 * PAD;
  const ny = Math.ceil(H / S), nx = Math.ceil(W / S);
  const sd = ctx2d(src).getImageData(0, 0, W, H).data;
  const out = canvas(W * 4, H * 4);
  const octx = ctx2d(out);
  const inp = new Float32Array(3 * TILE * TILE);
  const tileOut = new ImageData(S * 4, S * 4);
  const refl = (v: number, n: number) => (v < 0 ? -v : v >= n ? 2 * n - v - 2 : v); // borde en espejo
  let k = 0;
  for (let i = 0; i < ny; i++) for (let j = 0; j < nx; j++) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const sy = Math.max(0, Math.min(H - 1, refl(i * S + y - PAD, H)));
      const sx = Math.max(0, Math.min(W - 1, refl(j * S + x - PAD, W)));
      const p = (sy * W + sx) * 4, q = y * TILE + x;
      inp[q] = sd[p] / 255; inp[TILE * TILE + q] = sd[p + 1] / 255; inp[2 * TILE * TILE + q] = sd[p + 2] / 255;
    }
    const res = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", inp, [1, 3, TILE, TILE]) });
    const o = res[s.outputNames[0]].data as Float32Array;
    const T4 = TILE * 4, P4 = PAD * 4, S4 = S * 4;
    for (let y = 0; y < S4; y++) for (let x = 0; x < S4; x++) {
      const q = (y + P4) * T4 + (x + P4), d = (y * S4 + x) * 4;
      tileOut.data[d] = o[q] * 255; tileOut.data[d + 1] = o[T4 * T4 + q] * 255; tileOut.data[d + 2] = o[2 * T4 * T4 + q] * 255;
      tileOut.data[d + 3] = 255;
    }
    octx.putImageData(tileOut, j * S4, i * S4);
    onTile?.(++k, ny * nx);
  }
  return out;
}

/** Lo más grande que se crea de una vez: iOS no deja lienzos de más de ~16,7 MP. */
export const MAX_PIXELS = 16_000_000;

/**
 * Ampliar con IA hasta w×h exactos (como FX.upscale de escritorio: ×4 con la IA y luego se ajusta al tamaño).
 * Si el resultado ×4 no cabe en memoria, la entrada se reduce lo justo antes (sigue siendo mucho mejor que estirar).
 */
export async function upscaleTo(src: Pixels, w: number, h: number, onProgress?: (k: number, n: number) => void): Promise<Pixels> {
  // Entrada: si falta poco (hasta ×2), la mitad del destino, como «Mejorar» (×0,5 → ×4 → ×1): igual de nítido y
  // 4 veces menos trabajo que ampliar la foto entera. Si falta más, la foto tal cual. Y nunca más de lo que cabe.
  const f = Math.max(w / src.width, h / src.height);
  const maxIn = Math.sqrt(MAX_PIXELS / 16 / (src.width * src.height));
  const k = Math.min(1, f <= 2 ? f / 2 : 1, maxIn);
  let inp: Pixels = src;
  if (k < 0.999) {
    inp = canvas(Math.max(8, Math.round(src.width * k)), Math.max(8, Math.round(src.height * k)));
    const c = ctx2d(inp);
    c.imageSmoothingQuality = "high";
    c.drawImage(src as CanvasImageSource, 0, 0, inp.width, inp.height);
  }
  const big = await x4(inp, onProgress);
  if (big.width === w && big.height === h) return big;
  const out = canvas(w, h);
  const c = ctx2d(out);
  c.imageSmoothingQuality = "high";
  c.drawImage(big as CanvasImageSource, 0, 0, w, h);
  return out;
}

/** Enfocar y limpiar: ×0,5 → ×4 con la IA → tamaño original, mezclado con la foto (amount 0..1). */
export async function enhance(src: Pixels, amount = 0.6, onProgress?: (k: number, n: number) => void): Promise<Pixels> {
  const half = canvas(Math.max(8, Math.round(src.width / 2)), Math.max(8, Math.round(src.height / 2)));
  const hctx = ctx2d(half);
  hctx.imageSmoothingQuality = "high";
  hctx.drawImage(src as CanvasImageSource, 0, 0, half.width, half.height);
  const big = await x4(half, onProgress);
  const out = canvas(src.width, src.height);
  const c = ctx2d(out);
  c.drawImage(src as CanvasImageSource, 0, 0);
  c.imageSmoothingQuality = "high";
  c.globalAlpha = Math.max(0, Math.min(1, amount));
  c.drawImage(big as CanvasImageSource, 0, 0, big.width, big.height, 0, 0, src.width, src.height);
  return out;
}
