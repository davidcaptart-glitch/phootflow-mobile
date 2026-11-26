// Importar al catálogo, miniaturas y exportar a resolución completa (con un revelador aparte del de la vista).
import { decode, decodeSized, loadLut, LUT_SIZE, measure, pixelsOf, pro, shrink, toJpeg, type PickedPhoto, type Pixels } from "@phootflow/core";

let offscreen: pro.ProRenderer | null = null;
const renderer = () => (offscreen ??= new pro.ProRenderer(typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(1, 1) : undefined));

export async function prepareLut(r: pro.ProRenderer, dev: pro.Dev) {
  if (dev.lut) r.setLut(dev.lut, await loadLut(dev.lut), LUT_SIZE);
}

/** Añade fotos al catálogo (sin ajustes: como salieron de la cámara). */
export async function importPhotos(picked: PickedPhoto[], onProgress?: (done: number, total: number) => void) {
  await pro.catalog.persist();
  const added: pro.CatalogPhoto[] = [];
  const errors: string[] = [];
  for (const [i, p] of picked.entries()) {
    try {
      const { img, width, height } = await decodeSized(p.blob, 640);
      const small = shrink(img, 256);
      const px = pixelsOf(small);
      const stats = { ...measure(px.data, px.width, px.height), width, height };
      const ph: pro.CatalogPhoto = {
        id: pro.catalog.newId(), name: p.name, added: Date.now() + i, edited: 0, width, height,
        thumb: await toJpeg(shrink(img, 480), 0.82), dev: pro.cloneDev(pro.DEFAULT_DEV), stats,
        rating: 0, flag: 0, touched: false,
      };
      await pro.catalog.addPhoto(ph, p.blob);
      added.push(ph);
    } catch (e) {
      errors.push(`${p.name}: ${(e as Error).message}`);
    }
    onProgress?.(i + 1, picked.length);
  }
  return { added, errors };
}

/** Miniatura revelada a partir de la foto de trabajo ya decodificada. */
export async function thumbFrom(work: Pixels, dev: pro.Dev, side = 480): Promise<Blob> {
  const r = renderer();
  const src = shrink(work, side * 2);
  r.setSource(src as unknown as HTMLCanvasElement);
  await prepareLut(r, dev);
  const o = pro.outputSize(dev, src.width, src.height, side);
  r.render(dev, o);
  return r.toBlob("image/jpeg", 0.82);
}

/** Vistas previas pequeñas de varios ajustes sobre la misma foto (para los presets). */
export async function previews(work: Pixels, devs: pro.Dev[], side = 160): Promise<string[]> {
  const r = renderer();
  const src = shrink(work, side * 2);
  r.setSource(src as unknown as HTMLCanvasElement);
  const out: string[] = [];
  for (const d of devs) {
    await prepareLut(r, d);
    const o = pro.outputSize(d, src.width, src.height, side);
    r.render(d, o);
    out.push(URL.createObjectURL(await r.toBlob("image/jpeg", 0.8)));
  }
  return out;
}

export interface ExportOptions {
  /** Lado largo máximo (Infinity = tamaño original). */
  maxSide: number;
  type: "image/jpeg" | "image/png";
  quality: number;
}

/** Revela una foto del catálogo con sus ajustes a resolución de salida. */
export async function exportPhoto(ph: pro.CatalogPhoto, dev: pro.Dev, opt: ExportOptions): Promise<File> {
  const blob = await pro.catalog.original(ph.id);
  if (!blob) throw new Error("No se encuentra el original de esta foto.");
  const r = renderer();
  const final = pro.outputSize(dev, ph.width, ph.height, opt.maxSide);
  // se decodifica lo justo para el tamaño pedido (y nunca más de lo que admite la GPU)
  const scale = Math.max(final.width, final.height) / Math.max(1, Math.max(ph.width * dev.crop.w, ph.height * dev.crop.h));
  const need = Math.min(r.maxSize, Math.ceil(Math.max(ph.width, ph.height) * Math.min(1, scale * 1.05)));
  const img = await decode(blob, need);
  r.setSource(img as unknown as HTMLCanvasElement);
  await prepareLut(r, dev);
  const o = pro.outputSize(dev, img.width, img.height, opt.maxSide);
  r.render(dev, o);
  const out = await r.toBlob(opt.type, opt.quality);
  const ext = opt.type === "image/png" ? "png" : "jpg";
  const base = ph.name.replace(/\.[^.]+$/, "");
  return new File([out], `${base}_PhootFlow.${ext}`, { type: opt.type });
}
