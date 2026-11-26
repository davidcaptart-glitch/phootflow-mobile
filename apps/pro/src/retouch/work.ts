// Retocar: revelar la foto del catálogo (con sus ajustes de Revelar) a un lienzo 2D, componer las capas y
// exportar a resolución completa.
import { decode, pro, retouch, shrink, toJpeg, type Pixels } from "@phootflow/core";
import { prepareLut, type ExportOptions } from "../work";
import { MaskWork } from "../maskwork";

/** Lado largo de la foto de trabajo en Retocar (la vista y los cálculos en vivo). */
export const RETOUCH_SIDE = 1600;

let offscreen: pro.ProRenderer | null = null;
const renderer = () => (offscreen ??= new pro.ProRenderer(typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(1, 1) : undefined));

/** La foto revelada (ajustes de Revelar, recorte incluido) a `maxSide` px de lado largo como mucho. */
export async function developed(ph: pro.CatalogPhoto, maxSide: number): Promise<Pixels> {
  const blob = await pro.catalog.original(ph.id);
  if (!blob) throw new Error("No se encuentra el original de esta foto.");
  const r = renderer();
  const dev = ph.dev;
  const final = pro.outputSize(dev, ph.width, ph.height, maxSide);
  const scale = Math.max(final.width, final.height) / Math.max(1, Math.max(ph.width * dev.crop.w, ph.height * dev.crop.h));
  const need = Math.min(r.maxSize, Math.ceil(Math.max(ph.width, ph.height) * Math.min(1, scale * 1.05)));
  const img = await decode(blob, need);
  r.setSource(img as unknown as HTMLCanvasElement);
  await prepareLut(r, dev);
  // las máscaras de Revelar también (cada foto las suyas)
  r.keepMasks([]);
  if (dev.masks.length) await new MaskWork(img).sync(r, dev.masks);
  const o = pro.outputSize(dev, img.width, img.height, maxSide);
  r.render(dev, o);
  const out = retouch.canvas(o.width, o.height);
  retouch.ctx2d(out).drawImage(r.canvas as CanvasImageSource, 0, 0);
  return out;
}

/** Miniatura del retoque (≈480 px). */
export function thumbOf(composed: Pixels): Promise<Blob> {
  return toJpeg(shrink(composed, 480), 0.82);
}

/**
 * Exporta la foto revelada y retocada. Usa las máscaras de la IA ya calculadas en el editor (`assets`) para que
 * el resultado sea el mismo que se ve; si no las hay, las calcula.
 */
export async function exportRetouched(ph: pro.CatalogPhoto, layers: retouch.Layer[], opt: ExportOptions, assets?: retouch.Assets): Promise<File> {
  const base = await developed(ph, opt.maxSide);
  const a = await retouch.loadAssets(layers, base, assets ?? retouch.emptyAssets());
  let out = retouch.composeAll(base, layers, a);
  const type = opt.type;
  if (type === "image/jpeg" && retouch.hasTransparency(layers)) out = retouch.flatten(out);
  const blob = await retouch.toBlob(out, type, opt.quality);
  const ext = type === "image/png" ? "png" : "jpg";
  const name = ph.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${name}_retocada.${ext}`, { type });
}
