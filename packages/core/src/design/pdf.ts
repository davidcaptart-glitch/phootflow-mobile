// PDF escrito a mano (sin librerías): una imagen JPEG a página completa por página. Lógica pura: recibe los JPEG
// ya hechos y devuelve los bytes del PDF. El tamaño físico de cada página va en puntos (1 pt = 1/72 pulgada).

export interface PdfPage {
  jpeg: Uint8Array;
  /** Píxeles de la imagen. */
  pxW: number; pxH: number;
  /** Tamaño de la página en puntos. */
  ptW: number; ptH: number;
}

export const mmToPt = (mm: number) => (mm * 72) / 25.4;

const enc = new TextEncoder();
const pdfString = (s: string) =>
  "(" + [...s].map((c) => (c.charCodeAt(0) > 126 ? "?" : c)).join("").replace(/([\\()])/g, "\\$1") + ")";

export function buildPdf(pages: PdfPage[], meta: { title?: string } = {}): Uint8Array {
  const chunks: Uint8Array[] = [];
  let len = 0;
  const offsets: number[] = [];
  const put = (x: string | Uint8Array) => { const b = typeof x === "string" ? enc.encode(x) : x; chunks.push(b); len += b.length; };
  const obj = (n: number, body: string | (() => void)) => {
    offsets[n] = len;
    put(`${n} 0 obj\n`);
    if (typeof body === "string") put(body); else body();
    put("\nendobj\n");
  };
  put("%PDF-1.4\n");
  put(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  // 1 catálogo, 2 páginas, 3 info; luego por página: página, contenido, imagen
  const first = 4, per = 3;
  const kids = pages.map((_, i) => `${first + i * per} 0 R`).join(" ");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  obj(3, `<< /Producer (PhootFlow Pro) /Title ${pdfString(meta.title ?? "PhootFlow")} >>`);
  pages.forEach((p, i) => {
    const n = first + i * per, w = +p.ptW.toFixed(3), h = +p.ptH.toFixed(3);
    obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`);
    const content = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`;
    obj(n + 1, `<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream`);
    obj(n + 2, () => {
      put(`<< /Type /XObject /Subtype /Image /Width ${p.pxW} /Height ${p.pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      put(p.jpeg);
      put("\nendstream");
    });
  });
  const total = first + pages.length * per;
  const xref = len;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) x += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  put(x);
  put(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
