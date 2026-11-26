// Codificador GIF animado escrito a mano (GIF89a + LZW), sin dependencias. Lógica pura: recibe fotogramas RGBA y
// devuelve los bytes. Paleta global de hasta 256 colores elegida por popularidad (cubos de 4 bits por canal) y
// tramado ordenado opcional para suavizar degradados.

export interface GifFrame { data: Uint8ClampedArray | Uint8Array; /** centésimas de segundo */ delay: number }

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Paleta global (r,g,b × n) y tabla cubo(4096) → índice. */
export function buildPalette(frames: GifFrame[], w: number, h: number) {
  const count = new Float64Array(4096), sr = new Float64Array(4096), sg = new Float64Array(4096), sb = new Float64Array(4096);
  const step = Math.max(1, Math.floor((w * h * frames.length) / 400000));
  for (const f of frames) {
    const d = f.data;
    for (let i = 0; i < w * h; i += step) {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      count[k]++; sr[k] += r; sg[k] += g; sb[k] += b;
    }
  }
  const bins = [...count.keys()].filter((k) => count[k] > 0).sort((a, b) => count[b] - count[a]).slice(0, 256);
  if (!bins.length) bins.push(0);
  const pal = new Uint8Array(256 * 3);
  bins.forEach((k, i) => {
    pal[i * 3] = Math.round(sr[k] / count[k] || 0);
    pal[i * 3 + 1] = Math.round(sg[k] / count[k] || 0);
    pal[i * 3 + 2] = Math.round(sb[k] / count[k] || 0);
  });
  const lut = new Uint8Array(4096);
  for (let k = 0; k < 4096; k++) {
    const r = ((k >> 8) << 4) + 8, g = (((k >> 4) & 15) << 4) + 8, b = ((k & 15) << 4) + 8;
    let best = 0, bd = Infinity;
    for (let i = 0; i < bins.length; i++) {
      const dr = pal[i * 3] - r, dg = pal[i * 3 + 1] - g, db = pal[i * 3 + 2] - b;
      const dist = dr * dr * 2 + dg * dg * 4 + db * db * 3;
      if (dist < bd) { bd = dist; best = i; }
    }
    lut[k] = best;
  }
  return { pal, size: bins.length, lut };
}

/** Índices de paleta de un fotograma. */
export function indexFrame(d: Uint8ClampedArray | Uint8Array, w: number, h: number, lut: Uint8Array, dither = true) {
  const out = new Uint8Array(w * h);
  const c = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const o = dither ? (BAYER[(y & 3) * 4 + (x & 3)] - 7.5) * 1.6 : 0;
    const r = c(d[i * 4] + o), g = c(d[i * 4 + 1] + o), b = c(d[i * 4 + 2] + o);
    out[i] = lut[((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)];
  }
  return out;
}

class Bytes {
  buf = new Uint8Array(1 << 16); n = 0;
  push(...v: number[]) { for (const x of v) this.byte(x); }
  byte(x: number) {
    if (this.n >= this.buf.length) { const b = new Uint8Array(this.buf.length * 2); b.set(this.buf); this.buf = b; }
    this.buf[this.n++] = x & 255;
  }
  u16(x: number) { this.byte(x); this.byte(x >> 8); }
  str(s: string) { for (const ch of s) this.byte(ch.charCodeAt(0)); }
  bytes(a: Uint8Array) { for (const x of a) this.byte(x); }
  out() { return this.buf.slice(0, this.n); }
}

/** Compresión LZW de GIF (códigos de longitud variable, hasta 12 bits). */
export function lzwEncode(idx: Uint8Array, minCode = 8): Uint8Array {
  const out = new Bytes();
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, next = eoi + 1;
  let acc = 0, bits = 0;
  const emit = (code: number) => {
    acc |= code << bits; bits += size;
    while (bits >= 8) { out.byte(acc & 255); acc >>>= 8; bits -= 8; }
  };
  const dict = new Map<number, number>();
  emit(clear);
  if (!idx.length) { emit(eoi); if (bits) out.byte(acc); return out.out(); }
  let prefix = idx[0];
  for (let i = 1; i < idx.length; i++) {
    const k = idx[i], key = (prefix << 8) | k;
    const hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix);
    if (next === 4096) {
      emit(clear);
      dict.clear(); size = minCode + 1; next = eoi + 1;
    } else {
      if (next >= 1 << size) size++;
      dict.set(key, next++);
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) out.byte(acc & 255);
  return out.out();
}

export function encodeGif(frames: GifFrame[], w: number, h: number, opts: { loop?: number; dither?: boolean } = {}): Uint8Array {
  const { pal, lut } = buildPalette(frames, w, h);
  const o = new Bytes();
  o.str("GIF89a");
  o.u16(w); o.u16(h);
  o.push(0xf7, 0, 0);            // paleta global de 256 colores
  o.bytes(pal);
  // bucle (NETSCAPE2.0)
  o.push(0x21, 0xff, 0x0b); o.str("NETSCAPE2.0"); o.push(3, 1); o.u16(opts.loop ?? 0); o.push(0);
  for (const f of frames) {
    o.push(0x21, 0xf9, 4, 0x04); o.u16(Math.max(2, Math.round(f.delay))); o.push(0, 0); // control: no tocar
    o.push(0x2c); o.u16(0); o.u16(0); o.u16(w); o.u16(h); o.push(0);
    o.push(8);
    const data = lzwEncode(indexFrame(f.data, w, h, lut, opts.dither ?? true), 8);
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.subarray(i, i + 255);
      o.byte(chunk.length); o.bytes(chunk);
    }
    o.byte(0);
  }
  o.byte(0x3b);
  return o.out();
}
