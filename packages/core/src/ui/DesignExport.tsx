// Publicar un diseño: imágenes (carrusel), vídeo para Reels/Historias/TikTok (con animaciones y música propia),
// GIF animado o PDF para imprimir. Después se abre el menú Compartir del sistema.
import { useState } from "preact/hooks";
import { canRecordVideo, exportBoard, exportGif, exportPdf, exportVideo, pageSize, platform, type Board, type Pixels } from "../index";
import { Icon } from "./Icon";

type Kind = "images" | "video" | "gif" | "pdf";

export function DesignExport({ board, pix, name, perPage, pro, savedIn, onSave, onBusy, flash, onDone }: {
  board: Board; pix: Map<string, Pixels>; name: string; perPage?: number; pro: boolean; savedIn?: string;
  onSave: (files: File[], format: string, size: { w: number; h: number }) => Promise<void>;
  onBusy: (m: string) => void; flash: (m: string) => void; onDone: () => void;
}) {
  const video = canRecordVideo();
  const animated = board.items.some((i) => i.anim && i.anim.kind !== "ninguna");
  const [kind, setKind] = useState<Kind>(perPage && video ? "video" : "images");
  const [caption, setCaption] = useState("");
  const [secs, setSecs] = useState(perPage ?? 2.5);
  const [music, setMusic] = useState<File | null>(null);
  const [volume, setVolume] = useState(80);

  const go = async () => {
    try {
      let files: File[];
      if (kind === "images") {
        onBusy("Preparando las imágenes…");
        files = await exportBoard(board, pix, name);
        await onSave(files, board.format, pageSize(board));
      } else if (kind === "video") {
        const blob = await exportVideo(board, pix, {
          perPage: secs, music: music ? { file: music, volume: volume / 100, fadeIn: 0.8, fadeOut: 1.2 } : undefined,
          onProgress: (p: number) => onBusy(`Grabando el vídeo… ${Math.round(p * 100)} %`),
        });
        const ext = blob.type.includes("mp4") ? "mp4" : "webm";
        files = [new File([blob], `${name}.${ext}`, { type: blob.type })];
      } else if (kind === "gif") {
        onBusy("Creando el GIF…");
        const blob = await exportGif(board, pix, { perPage: secs });
        files = [new File([blob], `${name}.gif`, { type: "image/gif" })];
      } else {
        onBusy("Creando el PDF…");
        const blob = await exportPdf(board, pix, { title: name });
        files = [new File([blob], `${name}.pdf`, { type: "application/pdf" })];
      }
      onBusy("");
      if (caption.trim()) {
        try { await navigator.clipboard.writeText(caption); flash("Texto copiado: pégalo en la publicación"); } catch { /* sin permiso */ }
      }
      const res = await platform.share(files, caption || undefined);
      if (res === "saved") flash(files.length === 1 ? "Archivo descargado" : `${files.length} imágenes descargadas`);
      onDone();
    } catch (e) {
      onBusy("");
      flash((e as Error).message);
    }
  };

  return (
    <div class="props" style={{ padding: "4px 0" }}>
      <h2>Publicar</h2>
      <div class="chips">
        <button class={"chip" + (kind === "images" ? " on" : "")} onClick={() => setKind("images")}><Icon name="image" size={15} />{board.pages > 1 ? "Carrusel" : "Imagen"}</button>
        <button class={"chip" + (kind === "video" ? " on" : "")} disabled={!video} onClick={() => setKind("video")}><Icon name="carousel" size={15} />Vídeo</button>
        <button class={"chip" + (kind === "gif" ? " on" : "")} onClick={() => setKind("gif")}>GIF</button>
        {pro && <button class={"chip" + (kind === "pdf" ? " on" : "")} onClick={() => setKind("pdf")}>PDF para imprimir</button>}
      </div>
      {kind === "images" && (
        <p class="muted small" style={{ margin: 0 }}>
          {board.pages > 1 ? `${board.pages} imágenes en orden para un carrusel.` : "Una imagen."} Se abrirá el menú Compartir:
          elige Instagram, TikTok, WhatsApp…{savedIn ? ` y se guarda en ${savedIn}.` : ""}
        </p>
      )}
      {(kind === "video" || kind === "gif") && (
        <>
          <p class="muted small" style={{ margin: 0 }}>
            Cada página es una escena{animated ? " con sus animaciones" : ""}. Para Reels, Historias y TikTok usa el formato 9:16.
            {!animated && " Consejo: «Animar» en la barra de herramientas da movimiento a todo de una vez."}
          </p>
          <div class="slider">
            <label>Por página</label>
            <input type="range" min={10} max={60} value={Math.round(secs * 10)} onInput={(e) => setSecs(Number((e.target as HTMLInputElement).value) / 10)} />
            <output>{secs.toFixed(1)} s</output>
          </div>
        </>
      )}
      {kind === "video" && (
        <>
          <div class="row" style={{ padding: "0 16px" }}>
            <label class="btn sm grow" style={{ position: "relative", overflow: "hidden" }}>
              <Icon name="plus" size={16} />{music ? music.name : "Añadir tu música"}
              <input type="file" accept="audio/*" style={{ position: "absolute", inset: 0, opacity: 0 }}
                onChange={(e) => setMusic((e.target as HTMLInputElement).files?.[0] ?? null)} />
            </label>
            {music && <button class="icon-btn" aria-label="Quitar la música" onClick={() => setMusic(null)}><Icon name="close" size={18} /></button>}
          </div>
          {music && (
            <div class="slider">
              <label>Volumen</label>
              <input type="range" min={10} max={100} value={volume} onInput={(e) => setVolume(Number((e.target as HTMLInputElement).value))} />
              <output>{volume}</output>
            </div>
          )}
          <p class="hint">La música de Instagram o TikTok no se puede meter en el archivo: añádela en la propia red al publicar.
            Graba en tiempo real: tarda lo que dura el vídeo.</p>
        </>
      )}
      {kind === "pdf" && <p class="muted small" style={{ margin: 0 }}>Una página por página del diseño, a 300 ppp. Para imprimir o enviar a un cliente.</p>}
      {kind !== "pdf" && (
        <textarea class="field" rows={3} placeholder="Texto de la publicación (se copia para pegarlo)" value={caption}
          onInput={(e) => setCaption((e.target as HTMLTextAreaElement).value)} />
      )}
      <button class="btn primary block" onClick={go}><Icon name="share" size={18} />{kind === "pdf" ? "Crear el PDF" : "Compartir"}</button>
    </div>
  );
}
