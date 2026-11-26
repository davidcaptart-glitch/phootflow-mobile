// Sesión de fotos del móvil: cargar, analizar, revelar con el Look de la foto guía y exportar.
import { dhash, measure, reviewPhotos, sharpness, type Review } from "./engine/analyze";
import type { Person } from "./ai/people";
import { beautyEligible, bokehEligible, developFor } from "./engine/congruence";
import { smartCrop } from "./engine/crop";
import { detectTilt } from "./engine/straighten";
import { formatById, formatTag, FORMATS, outputSize } from "./engine/formats";
import type { Box, FormatId, Look, PhotoStats } from "./engine/types";
import { detectFaces, segment, unionMask } from "./ai/vision";
import { portraitMask } from "./ai/portrait";
import { enhance, upscaleTo, MAX_PIXELS } from "./ai/enhance";

/** Cuánto se nota «Mejorar con IA» (como amount en escritorio). */
export const ENHANCE_AMOUNT = 0.65;
import { decode, decodeSized, pixelsOf, shrink, toJpeg, type Pixels } from "./render/image";
import { LUT_SIZE, loadLut } from "./render/luts";
import { Renderer, type Mask } from "./render/renderer";
import type { PickedPhoto } from "./platform";
import { newKey } from "./library";

/** Una versión exportada: el archivo y de dónde sale (para guardarla en la biblioteca). */
export interface ExportItem { file: File; photoId: string; format: FormatId | null; bw: boolean; width: number; height: number; }

export interface Photo {
  id: string;
  name: string;
  blob: Blob;
  thumb: Pixels | null;     // 400 px, para la rejilla
  thumbUrl: string | null;  // la misma miniatura (sin editar) como URL para <img>
  stats: PhotoStats | null;
  person: Mask | null;
  skin: Mask | null;
  /** Máscaras con nombre (ropa, pelo, coche, perro…) de los elementos que hay en la foto. */
  masks: Record<string, Mask>;
  /** Recortes elegidos a mano (si no, el automático). */
  cropOverride: Record<FormatId, Box>;
  /** Hasta dónde se analizó con IA: 0 caras, 1 + persona, 2 + objetos. */
  aiLevel: number;
  /** Máscaras de retrato (ojos, iris, boca, ojeras), si se pidieron y hay caras. */
  face: Mask | null;
  portraitDone: boolean;
  /** «Mejorar con IA» (enfocar y limpiar), elegido foto a foto. */
  enhance: boolean;
  /** La foto tal como llegó, si se le han quitado cosas (para deshacer). */
  originalBlob?: Blob;
  /** Revisión rápida antes de editar: huella (dhash), nitidez y miniatura. */
  check?: { hash: bigint; sharp: number; url: string };
  error?: string;
}

/** Lado de la imagen con la que se mide la nitidez (todas igual, para poder compararlas). */
export const CHECK_SIDE = 512;

/** Tamaño de la foto de trabajo en la vista en vivo. */
export const WORK_SIDE = 1600;
/** Lado largo de exportación sin formato (proporción original). */
export const ORIGINAL_SIDE = 2560;

export class Session {
  /** Id de la sesión en la biblioteca. */
  id = newKey("s");
  created = Date.now();
  photos: Photo[] = [];
  guideId: string | null = null;
  /** Qué usa la IA: la segmentación de la persona solo hace falta para el fondo, la belleza y las máscaras. */
  needSegmentation = true;
  /** Reconocer también objetos (coches, animales, plantas…): solo para el color selectivo. */
  needObjects = false;
  /** Puntos de la cara para el retrato completo (ojos, dientes, ojeras). */
  needPortrait = false;
  /** Personas encontradas en Resultados (con nombres y uniones a mano); null = aún no se han buscado. */
  people: Person[] | null = null;

  add(picked: (PickedPhoto & { id?: string })[]) {
    const nuevas = picked.map((p) => ({
      id: p.id ?? newKey("f"), name: p.name, blob: p.blob, thumb: null, thumbUrl: null, stats: null, person: null, skin: null, masks: {}, cropOverride: {}, aiLevel: 0, face: null, portraitDone: false, enhance: false,
    } satisfies Photo));
    this.photos.push(...nuevas);
    this.guideId ??= nuevas[0]?.id ?? null;
    return nuevas;
  }

  /** Revisión rápida (≈ 50 ms por foto): repetidas y movidas, para quitarlas antes de editar. */
  async review(onProgress?: (done: number, total: number) => void): Promise<Review> {
    let done = 0;
    for (const p of this.photos) {
      if (!p.check) {
        try {
          const { img } = await decodeSized(p.blob, CHECK_SIDE);
          const px = pixelsOf(img);
          const url = URL.createObjectURL(await toJpeg(shrink(img, 240), 0.8));
          p.check = { hash: dhash(px.data, px.width, px.height), sharp: sharpness(px.data, px.width, px.height), url };
        } catch { /* la foto que no se abre se avisa al analizarla */ }
      }
      onProgress?.(++done, this.photos.length);
    }
    return reviewPhotos(this.photos.filter((p) => p.check).map((p) => ({ id: p.id, hash: p.check!.hash, sharp: p.check!.sharp })));
  }

  /** Quita fotos de la sesión (nunca todas). */
  remove(ids: string[]) {
    const keep = this.photos.filter((p) => !ids.includes(p.id));
    if (!keep.length) return;
    for (const p of this.photos) if (ids.includes(p.id)) { if (p.thumbUrl) URL.revokeObjectURL(p.thumbUrl); if (p.check) URL.revokeObjectURL(p.check.url); }
    this.photos = keep;
    if (!keep.some((p) => p.id === this.guideId)) this.guideId = keep[0].id;
    if (this.people) this.people = this.people.map((x) => ({ ...x, photoIds: x.photoIds.filter((id) => !ids.includes(id)), faces: x.faces.filter((f) => !ids.includes(f.photoId)) }));
  }

  get guide() { return this.photos.find((p) => p.id === this.guideId) ?? null; }

  private pending = new Map<string, Promise<void>>();

  /** Nivel de IA que pide la sesión ahora. */
  get aiLevel() { return this.needObjects ? 2 : this.needSegmentation ? 1 : 0; }

  /** Pide más IA (p. ej. al aplicar un estilo con fondo o color selectivo): las fotos ya analizadas con
   *  menos se vuelven a analizar cuando se necesiten. */
  require(segmentation: boolean, objects: boolean, portrait = false) {
    this.needSegmentation ||= segmentation || objects || portrait;
    this.needObjects ||= objects;
    this.needPortrait ||= portrait;
  }

  /** Analiza una foto (≈ 0,3–1 s en un móvil): miniatura, medidas, caras y máscaras. */
  analyze(p: Photo): Promise<void> {
    if ((p.stats && p.aiLevel >= this.aiLevel && (!this.needPortrait || p.portraitDone)) || p.error) return Promise.resolve();
    let job = this.pending.get(p.id);
    if (!job) {
      job = this.analyzeNow(p).finally(() => this.pending.delete(p.id));
      this.pending.set(p.id, job);
    }
    return job;
  }

  private async analyzeNow(p: Photo): Promise<void> {
    try {
      const { img, width, height } = await decodeSized(p.blob, 640);
      p.thumb = shrink(img, 400);
      p.thumbUrl = URL.createObjectURL(await toJpeg(p.thumb, 0.8));
      const faces = await detectFaces(img);
      const sg = this.needSegmentation ? await segment(img, this.needObjects) : null;
      const small = shrink(img, 256);
      const px = pixelsOf(small);
      p.stats = measure(px.data, px.width, px.height, faces, sg?.box ?? null);
      p.stats.tilt = detectTilt(px.data, px.width, px.height);
      // tamaño real de la foto (para recortes y formatos)
      p.stats.width = width;
      p.stats.height = height;
      p.person = sg?.person ?? null;
      p.skin = sg?.skin ?? null;
      p.masks = sg?.masks ?? {};
      p.aiLevel = this.aiLevel;
      if (this.needPortrait) {
        p.face = faces.length ? await portraitMask(img) : null;
        p.portraitDone = true;
      }
    } catch (e) {
      p.error = (e as Error).message;
    }
  }

  async analyzeAll(onProgress?: (done: number, total: number) => void) {
    let done = 0;
    for (const p of this.photos) {
      await this.analyze(p);
      onProgress?.(++done, this.photos.length);
    }
  }

  /** Sustituye la foto por una versión retocada (p. ej. con algo quitado) y la vuelve a analizar. */
  async replacePhoto(p: Photo, blob: Blob) {
    p.originalBlob ??= p.blob;
    p.blob = blob;
    this.resetAnalysis(p);
    await this.analyze(p);
  }

  /** Deshace los retoques de la foto (vuelve a la original). */
  async restorePhoto(p: Photo) {
    if (!p.originalBlob) return;
    p.blob = p.originalBlob;
    p.originalBlob = undefined;
    this.resetAnalysis(p);
    await this.analyze(p);
  }

  private resetAnalysis(p: Photo) {
    if (p.thumbUrl) URL.revokeObjectURL(p.thumbUrl);
    Object.assign(p, { thumb: null, thumbUrl: null, stats: null, person: null, skin: null, masks: {}, face: null, aiLevel: 0, portraitDone: false, error: undefined });
  }

  cropFor(p: Photo, f: FormatId): Box {
    return p.cropOverride[f] ?? smartCrop(p.stats!, formatById(f).ratio);
  }

  /** Prepara el revelador para una foto ya decodificada. */
  async prepare(r: Renderer, p: Photo, img: Pixels, look: Look) {
    r.setSource(img as unknown as TexImageSource & { width: number; height: number });
    r.setMasks(p.person, p.skin);
    r.setFace(p.face);
    r.setSelection(look.splash.parts.length ? unionMask(p.masks, look.splash.parts) : null);
    r.setLut(look.lut, look.lut ? await loadLut(look.lut) : null, LUT_SIZE);
    r.setBwLut(look.bwLut, look.bwLut ? await loadLut(look.bwLut) : null, LUT_SIZE);
  }

  /** Revela una foto en el lienzo del revelador. */
  draw(r: Renderer, p: Photo, look: Look, o: { width: number; height: number; crop?: Box | null; bw?: boolean }) {
    const s = p.stats!;
    r.render({
      develop: developFor(s, look, this.guide?.stats ?? null), look,
      angle: look.straighten ? -(s.tilt ?? 0) : 0, crop: o.crop ?? null, bw: o.bw, width: o.width, height: o.height,
      bokeh: bokehEligible(s), beauty: beautyEligible(s),
    });
  }

  /** Exporta todas: cada formato elegido (o la proporción original) y, si se pide, su versión en B/N. */
  async exportAll(r: Renderer, look: Look, onProgress?: (done: number, total: number) => void, only?: string[]): Promise<ExportItem[]> {
    const ok = this.photos.filter((p) => p.stats && (!only || only.includes(p.id)));
    const out: ExportItem[] = [];
    let done = 0;
    for (const p of ok) {
      out.push(...(await this.exportOne(r, p, look)));
      onProgress?.(++done, ok.length);
    }
    return out;
  }

  async exportOne(r: Renderer, p: Photo, look: Look): Promise<ExportItem[]> {
    const side = Math.min(r.maxSize, Math.max(ORIGINAL_SIDE, 2200));
    const img = await decode(p.blob, side);
    await this.prepare(r, p, img, look);
    const base = p.name.replace(/\.[^.]+$/, "");
    const files: ExportItem[] = [];
    const jobs: { tag: string; format: FormatId | null; crop: Box | null; w: number; h: number }[] = [];
    if (look.formats.length === 0) {
      const sc = Math.min(1, ORIGINAL_SIDE / Math.max(img.width, img.height));
      jobs.push({ tag: "", format: null, crop: null, w: Math.round(img.width * sc), h: Math.round(img.height * sc) });
    }
    for (const id of look.formats) {
      const f = formatById(id);
      const c = this.cropFor(p, id);
      // lo que da de sí la foto en ese recorte; con «tamaño exacto con IA», se pide el de la red aunque no llegue
      const sz = look.aiResize ? { w: f.w, h: f.h } : outputSize(f, c.w * img.width, c.h * img.height);
      jobs.push({ tag: "_" + formatTag(id), format: id, crop: c, ...sz });
    }
    for (const j of jobs) {
      // píxeles reales de la foto en ese recorte: se revela a ese tamaño como mucho y la IA amplía el resto
      const natW = Math.round((j.crop?.w ?? 1) * img.width), natH = Math.round((j.crop?.h ?? 1) * img.height);
      const short = j.w > natW * 1.05 || j.h > natH * 1.05;
      const rw = short ? Math.min(j.w, natW) : j.w, rh = short ? Math.round((rw * j.h) / j.w) : j.h;
      for (const bw of look.alsoBW ? [false, true] : [false]) {
        this.draw(r, p, look, { width: rw, height: rh, crop: j.crop, bw });
        let px: Pixels | null = null;
        if (short) px = await upscaleSafe(shrink(r.canvas as Pixels, Math.max(rw, rh)), j.w, j.h);
        if (p.enhance) px = await enhance(px ?? shrink(r.canvas as Pixels, Math.max(rw, rh)), ENHANCE_AMOUNT);
        const blob = px ? await toJpeg(px, 0.92) : await r.toBlob(0.92);
        const file = new File([blob], `${base}${j.tag}${bw ? "_bn" : ""}.jpg`, { type: "image/jpeg" });
        files.push({ file, photoId: p.id, format: j.format, bw, width: j.w, height: j.h });
      }
    }
    return files;
  }

  /** Versión ampliada ×factor con IA (2 o 4) de una foto, revelada con el Look, al tamaño de su primer destino
   *  o entera. Limitada a MAX_PIXELS (lo que admite un iPhone). */
  async exportUpscaled(r: Renderer, p: Photo, look: Look, factor: number, onProgress?: (k: number, n: number) => void): Promise<ExportItem> {
    const img = await decode(p.blob, Math.min(r.maxSize, 4096));
    await this.prepare(r, p, img, look);
    const fmt = look.formats[0] ?? null;
    const crop = fmt ? this.cropFor(p, fmt) : null;
    const w0 = Math.round((crop?.w ?? 1) * img.width), h0 = Math.round((crop?.h ?? 1) * img.height);
    // tamaño final: ×factor, sin pasar de MAX_PIXELS
    const k = Math.min(factor, Math.sqrt(MAX_PIXELS / (w0 * h0)));
    const W = Math.round(w0 * k), H = Math.round(h0 * k);
    this.draw(r, p, look, { width: w0, height: h0, crop });
    let px = await upscaleSafe(shrink(r.canvas as Pixels, Math.max(w0, h0)), W, H, onProgress);
    if (p.enhance) px = await enhance(px, ENHANCE_AMOUNT);
    const base = p.name.replace(/\.[^.]+$/, "");
    const tag = `${fmt ? "_" + formatTag(fmt) : ""}_x${factor}`;
    const file = new File([await toJpeg(px, 0.93)], `${base}${tag}.jpg`, { type: "image/jpeg" });
    return { file, photoId: p.id, format: fmt, bw: false, width: W, height: H };
  }

  /** Foto revelada como lienzo 2D (para el diseño de redes). */
  async renderedPixels(r: Renderer, p: Photo, look: Look, maxSide: number, bw = false): Promise<Pixels> {
    const img = await decode(p.blob, maxSide);
    await this.prepare(r, p, img, look);
    this.draw(r, p, look, { width: img.width, height: img.height, bw });
    const out = shrink(r.canvas as Pixels, maxSide);
    return p.enhance ? enhance(out, ENHANCE_AMOUNT) : out;
  }
}

/** Ampliar con IA; si la IA no está disponible (sin conexión la primera vez), ampliación clásica de alta calidad. */
async function upscaleSafe(src: Pixels, w: number, h: number, onProgress?: (k: number, n: number) => void): Promise<Pixels> {
  try {
    return await upscaleTo(src, w, h, onProgress);
  } catch {
    const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
    const ctx = c.getContext("2d") as CanvasRenderingContext2D;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src as CanvasImageSource, 0, 0, w, h);
    return c;
  }
}

export { FORMATS, toJpeg };
