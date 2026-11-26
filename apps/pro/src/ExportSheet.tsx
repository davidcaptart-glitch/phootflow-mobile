// Exportar una o varias fotos: tamaño, formato y calidad; después, compartir (Instagram, WhatsApp…) o guardar.
import { useState } from "preact/hooks";
import { platform, pro } from "@phootflow/core";
import { Icon } from "@phootflow/core/ui";
import { Sheet } from "./ui";
import { exportPhoto, type ExportOptions } from "./work";

const SIZES: [string, number, string][] = [
  ["Original", Infinity, "Sin reducir"],
  ["4K", 3840, "3840 px"],
  ["Redes", 2048, "2048 px"],
  ["Instagram", 1440, "1440 px"],
  ["Ligera", 1080, "1080 px"],
];

export function ExportSheet({ photos, devOf, onClose }: {
  photos: pro.CatalogPhoto[]; devOf: (p: pro.CatalogPhoto) => pro.Dev; onClose: () => void;
}) {
  const [size, setSize] = useState(2);
  const [type, setType] = useState<ExportOptions["type"]>("image/jpeg");
  const [quality, setQuality] = useState(92);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<File[] | null>(null);

  const run = async () => {
    const files: File[] = [];
    try {
      for (const [i, p] of photos.entries()) {
        setBusy(`Revelando ${i + 1} de ${photos.length}…`);
        files.push(await exportPhoto(p, devOf(p), { maxSide: SIZES[size][1], type, quality: quality / 100 }));
      }
      setDone(files);
      setBusy(null);
      await send(files);
    } catch (e) {
      setBusy(null);
      alert((e as Error).message);
    }
  };
  const send = async (files: File[]) => {
    const r = await platform.share(files, "Editada con PhootFlow Pro");
    if (r === "saved") setBusy("Guardadas en Descargas");
  };

  return (
    <Sheet title={photos.length === 1 ? "Exportar la foto" : `Exportar ${photos.length} fotos`} onClose={onClose}>
      <div class="sub">Tamaño (lado largo)</div>
      <div class="chips">
        {SIZES.map(([n, , d], i) => (
          <button class={"chip" + (size === i ? " on" : "")} onClick={() => setSize(i)} title={d}>{n}</button>
        ))}
      </div>
      <p class="hint">{SIZES[size][2]}{photos.length === 1 ? ` · ${(() => { const o = pro.outputSize(devOf(photos[0]), photos[0].width, photos[0].height, SIZES[size][1]); return `${o.width} × ${o.height} px`; })()}` : ""}</p>
      <div class="sub">Formato</div>
      <div class="chips">
        <button class={"chip" + (type === "image/jpeg" ? " on" : "")} onClick={() => setType("image/jpeg")}>JPEG</button>
        <button class={"chip" + (type === "image/png" ? " on" : "")} onClick={() => setType("image/png")}>PNG (sin pérdida)</button>
      </div>
      {type === "image/jpeg" && (
        <div class="slider" style={{ paddingTop: "8px" }}>
          <label>Calidad</label>
          <input type="range" min={60} max={100} value={quality} onInput={(e) => setQuality(Number((e.target as HTMLInputElement).value))} />
          <output>{quality}</output>
        </div>
      )}
      <div style={{ padding: "12px 16px 0", display: "grid", gap: "10px" }}>
        {busy && <p class="muted small" style={{ textAlign: "center", margin: 0 }}>{busy}</p>}
        {done ? (
          <button class="btn primary" onClick={() => send(done)}><Icon name="share" size={19} />Compartir de nuevo</button>
        ) : (
          <button class="btn primary" disabled={!!busy} onClick={run}><Icon name="share" size={19} />Exportar y compartir</button>
        )}
        <p class="muted small" style={{ textAlign: "center", margin: 0 }}>El original no cambia: se crea una copia revelada.</p>
      </div>
    </Sheet>
  );
}
