// Decodificar fotos del móvil a un tamaño de trabajo. La orientación EXIF la aplica el navegador.

export type Pixels = HTMLCanvasElement | OffscreenCanvas;

function canvas(w: number, h: number): Pixels {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

export class DecodeError extends Error {}

/** Foto reducida a `maxSide` px de lado largo como mucho (nunca se amplía). */
export async function decode(blob: Blob, maxSide: number): Promise<Pixels> {
  return (await decodeSized(blob, maxSide)).img;
}

/** Igual que decode, y además el tamaño original de la foto. */
export async function decodeSized(blob: Blob, maxSide: number): Promise<{ img: Pixels; width: number; height: number }> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch {
    const heic = /heic|heif/i.test(blob.type) || ("name" in blob && /\.(heic|heif)$/i.test((blob as File).name));
    throw new DecodeError(heic
      ? "Este navegador no abre fotos HEIC. En el iPhone: Ajustes › Cámara › Formatos › «Más compatible», o compártelas como JPEG."
      : "No se ha podido abrir esta foto.");
  }
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
  const c = canvas(w, h);
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  const size = { width: bmp.width, height: bmp.height };
  bmp.close();
  return { img: c, ...size };
}

/** Copia reducida de un lienzo (para medir o para la IA). */
export function shrink(src: Pixels, maxSide: number): Pixels {
  const s = Math.min(1, maxSide / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * s)), h = Math.max(1, Math.round(src.height * s));
  const c = canvas(w, h);
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src as CanvasImageSource, 0, 0, w, h);
  return c;
}

export function pixelsOf(c: Pixels): ImageData {
  return (c.getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, c.width, c.height);
}

export async function toJpeg(c: Pixels, quality = 0.9): Promise<Blob> {
  if ("convertToBlob" in c) return c.convertToBlob({ type: "image/jpeg", quality });
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/jpeg", quality));
}
