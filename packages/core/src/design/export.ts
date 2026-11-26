// Exportar un tablero a vídeo (Reels / Historias / TikTok), GIF animado o PDF. Necesitan lienzo (navegador o
// WebView); la parte pura (codificar GIF y PDF, calcular animaciones) está en gif.ts, pdf.ts y anim.ts.
import type { Pixels } from "../render/image";
import { animEnd, type Anim, type AnimKind } from "./anim";
import { canvas, canvasToBlob, pageSize, paintPage, type Board, type Item } from "./board";
import { encodeGif, type GifFrame } from "./gif";
import { buildPdf, mmToPt, type PdfPage } from "./pdf";
import { itemRect, boardRatio } from "./layers";

const ctx2d = (c: Pixels) => c.getContext("2d") as CanvasRenderingContext2D;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

// ---------- tiempos ----------

export interface MotionOptions {
  /** Páginas a incluir (por defecto todas, en orden). */
  pages?: number[];
  /** Segundos por página (por defecto: lo que duran sus animaciones + 1,5 s, mínimo 2,5 s). */
  perPage?: number;
}

/** Elementos cuyo centro cae en la página `i` (para calcular cuánto dura su animación). */
export function itemsOnPage(b: Board, i: number): Item[] {
  const r = boardRatio(b);
  return b.items.filter((it) => { const q = itemRect(it, r); const c = q.x + q.w / 2; return c >= i && c < i + 1; });
}

/** Plan de reproducción: qué página se ve en cada tramo. */
export function motionPlan(b: Board, opts: MotionOptions = {}) {
  const pages = (opts.pages ?? [...Array(b.pages).keys()]).filter((p) => p >= 0 && p < b.pages);
  let t = 0;
  const segs = pages.map((page) => {
    const dur = opts.perPage ?? Math.max(2.5, animEnd(itemsOnPage(b, page)) + 1.5);
    const s = { page, start: t, dur };
    t += dur;
    return s;
  });
  return { segs, total: t };
}

/** Pone una animación de entrada a todos los elementos, escalonada por orden de capas (lo de abajo primero). */
export function autoAnimate(b: Board, kind: AnimKind = "subir", step = 0.18, dur = 0.7): Board {
  const counters = new Map<number, number>();
  const r = boardRatio(b);
  return {
    ...b, items: b.items.map((it) => {
      if (kind === "ninguna") return { ...it, anim: null };
      const q = itemRect(it, r);
      const page = Math.floor(q.x + q.w / 2);
      const k = counters.get(page) ?? 0;
      counters.set(page, k + 1);
      // lo que ocupa la página entera (fondo) no se anima
      if (it.kind === "photo" && q.w >= 0.95 && q.h >= 0.95) return { ...it, anim: null };
      const anim: Anim = { kind, delay: +(k * step).toFixed(3), dur };
      return { ...it, anim };
    }),
  };
}

// ---------- vídeo ----------

const VIDEO_TYPES = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];

/** Tipo de vídeo que puede grabar este navegador (MP4 si se puede, que es lo que mejor tragan las redes). */
export function videoMime(withAudio = false): string | null {
  if (typeof MediaRecorder === "undefined" || typeof document === "undefined") return null;
  const types = withAudio ? ["video/mp4;codecs=avc1,mp4a.40.2", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", ...VIDEO_TYPES] : VIDEO_TYPES;
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}
export const canRecordVideo = () => videoMime() !== null;

export interface VideoOptions extends MotionOptions {
  /** Ancho de página en px (por defecto el de la red, 1080). */
  width?: number;
  fps?: number;
  /** Bits por segundo (por defecto 8 Mbps). */
  bitrate?: number;
  /** Música del usuario (mp3, m4a, wav… lo que decodifique el navegador). Sin ella, vídeo mudo: luego se puede
   *  añadir la música de Instagram/TikTok en su propio editor al publicar. */
  music?: MusicOptions | null;
  onProgress?: (p: number) => void;
}

export interface MusicOptions {
  file: Blob;
  /** Segundo de la canción donde empieza (para saltar la intro). */
  start?: number;
  /** 0..1 (por defecto 1). */
  volume?: number;
  /** Fundido de entrada y de salida en segundos (por defecto 0,3 y 1,5). */
  fadeIn?: number;
  fadeOut?: number;
}

/** Curva de volumen de la música: [tiempo, ganancia] para un vídeo de `total` s (pura, probada). */
export function musicEnvelope(total: number, m: Pick<MusicOptions, "volume" | "fadeIn" | "fadeOut">): [number, number][] {
  const v = Math.max(0, Math.min(1, m.volume ?? 1));
  const fi = Math.max(0, Math.min(total / 2, m.fadeIn ?? 0.3)), fo = Math.max(0, Math.min(total / 2, m.fadeOut ?? 1.5));
  return [[0, fi ? 0 : v], [fi, v], [total - fo, v], [total, 0]];
}

/** Graba el tablero como vídeo (una página tras otra, con sus animaciones). Tarda lo que dura el vídeo
 *  (MediaRecorder graba en tiempo real). Devuelve WebM o MP4 según el navegador. */
export async function exportVideo(b: Board, photos: Map<string, Pixels>, opts: VideoOptions = {}): Promise<Blob> {
  const mime = videoMime(!!opts.music);
  if (!mime) throw new Error("Este dispositivo no puede grabar vídeo; prueba con GIF.");
  const { w, h } = pageSize(b, opts.width);
  const fps = opts.fps ?? 30;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = ctx2d(c);
  const plan = motionPlan(b, opts);
  const draw = (t: number) => {
    const seg = plan.segs.find((s) => t < s.start + s.dur) ?? plan.segs[plan.segs.length - 1];
    if (!seg) return;
    ctx.clearRect(0, 0, w, h);
    paintPage(ctx, b, photos, seg.page, w, h, { time: t - seg.start });
  };
  draw(0);
  const stream = c.captureStream(fps);
  // música: se decodifica, se recorta y se mezcla como pista de audio del vídeo
  let audio: { ac: AudioContext; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  if (opts.music?.file) {
    const ac = new AudioContext();
    const buf = await ac.decodeAudioData(await opts.music.file.arrayBuffer());
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = buf.duration - (opts.music.start ?? 0) < plan.total;
    if (src.loop) { src.loopStart = 0; src.loopEnd = buf.duration; }
    const gain = ac.createGain();
    const dest = ac.createMediaStreamDestination();
    src.connect(gain).connect(dest);
    dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    audio = { ac, src, gain };
  }
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: opts.bitrate ?? 8_000_000 });
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
  const done = new Promise<void>((res) => (rec.onstop = () => res()));
  rec.start(250);
  if (audio && opts.music) {
    // el volumen se programa justo al arrancar, para que los fundidos caigan donde toca
    const now = audio.ac.currentTime, env = musicEnvelope(plan.total, opts.music);
    audio.gain.gain.setValueAtTime(env[0][1], now);
    for (const [t, g] of env.slice(1)) audio.gain.gain.linearRampToValueAtTime(g, now + t);
    audio.src.start(now, Math.max(0, opts.music.start ?? 0));
  }
  const t0 = performance.now();
  await new Promise<void>((res) => {
    const step = () => {
      const t = (performance.now() - t0) / 1000;
      draw(Math.min(t, plan.total));
      opts.onProgress?.(Math.min(1, t / plan.total));
      if (t >= plan.total) return res();
      setTimeout(step, 1000 / fps);
    };
    step();
  });
  rec.stop();
  stream.getTracks().forEach((tr) => tr.stop());
  await done;
  if (audio) { try { audio.src.stop(); } catch { /* ya parado */ } await audio.ac.close(); }
  return new Blob(parts, { type: mime.split(";")[0] });
}

// ---------- GIF ----------

export interface GifOptions extends MotionOptions {
  /** Ancho de página en px (por defecto 540: los GIF pesan mucho). */
  width?: number;
  fps?: number;
  onProgress?: (p: number) => void;
}

export async function exportGif(b: Board, photos: Map<string, Pixels>, opts: GifOptions = {}): Promise<Blob> {
  const { w, h } = pageSize(b, opts.width ?? 540);
  const fps = opts.fps ?? 12;
  const c = canvas(w, h), ctx = ctx2d(c);
  const plan = motionPlan(b, opts);
  const frames: GifFrame[] = [];
  const n = Math.max(1, Math.round(plan.total * fps));
  for (let f = 0; f < n; f++) {
    const t = f / fps;
    const seg = plan.segs.find((s) => t < s.start + s.dur) ?? plan.segs[plan.segs.length - 1];
    ctx.clearRect(0, 0, w, h);
    paintPage(ctx, b, photos, seg.page, w, h, { time: t - seg.start });
    frames.push({ data: ctx.getImageData(0, 0, w, h).data, delay: 100 / fps });
    opts.onProgress?.((f + 1) / n / 2);
    if (f % 4 === 0) await tick();
  }
  // fotogramas iguales seguidos → uno más largo (pesa menos)
  const merged: GifFrame[] = [];
  for (const fr of frames) {
    const last = merged[merged.length - 1];
    if (last && same(last.data, fr.data)) last.delay += fr.delay;
    else merged.push({ ...fr });
  }
  await tick();
  const bytes = encodeGif(merged, w, h);
  opts.onProgress?.(1);
  return new Blob([bytes as BlobPart], { type: "image/gif" });
}

function same(a: Uint8ClampedArray | Uint8Array, b: Uint8ClampedArray | Uint8Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) return false;
  return true;
}

// ---------- PDF ----------

export interface PdfOptions {
  /** Ancho físico de cada página en mm (por defecto 210, el de un A4). El alto sale del formato. */
  widthMm?: number;
  /** Resolución (por defecto 300 ppp, imprenta). */
  dpi?: number;
  quality?: number;
  title?: string;
  onProgress?: (p: number) => void;
}

/** PDF de imprenta: una página del PDF por página del tablero, a 300 ppp. */
export async function exportPdf(b: Board, photos: Map<string, Pixels>, opts: PdfOptions = {}): Promise<Blob> {
  const widthMm = opts.widthMm ?? 210, dpi = opts.dpi ?? 300;
  const pxW = Math.round((widthMm / 25.4) * dpi);
  const { w, h } = pageSize(b, pxW);
  const pages: PdfPage[] = [];
  for (let i = 0; i < b.pages; i++) {
    const c = canvas(w, h);
    paintPage(ctx2d(c), b, photos, i, w, h);
    const jpeg = new Uint8Array(await (await canvasToBlob(c, "image/jpeg", opts.quality ?? 0.92)).arrayBuffer());
    pages.push({ jpeg, pxW: w, pxH: h, ptW: mmToPt(widthMm), ptH: mmToPt((widthMm * h) / w) });
    opts.onProgress?.((i + 1) / b.pages);
    await tick();
  }
  return new Blob([buildPdf(pages, { title: opts.title }) as BlobPart], { type: "application/pdf" });
}
