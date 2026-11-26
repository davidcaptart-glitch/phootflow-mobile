// Quitar objetos y personas de una foto: se toca la figura (la IA la separa) o se pinta con el dedo, y MI-GAN
// rellena el hueco. Se aplica a la foto original (luego el estilo se aplica encima como a las demás).
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "@phootflow/core/ui";
import {
  ELEMENTS, INPAINT_SIDE, componentAt, decode, removeArea, segment, shrink, toJpeg, warmUpInpaint,
  type Mask, type Photo, type Pixels, type Session,
} from "@phootflow/core";
import { CompareSwitch, CurtainOverlay, type CompareMode } from "../BeforeAfter";
import { Slider } from "./Editor";

type Mode = "tap" | "brush";

export function Remove({ session, photo, onClose }: { session: Session; photo: Photo; onClose: (changed: boolean) => void }) {
  const [mode, setMode] = useState<Mode>("tap");
  const [brush, setBrush] = useState(5);
  const [busy, setBusy] = useState("Preparando la foto…");
  const [result, setResult] = useState<Pixels | null>(null);
  const [beforeUrl, setBeforeUrl] = useState("");
  const [cmp, setCmp] = useState<CompareMode>("curtain");
  const [hasSel, setHasSel] = useState(false);
  const [toast, setToast] = useState("");
  const [size, setSize] = useState({ w: 0, h: 0 });
  const work = useRef<Pixels | null>(null);
  const seg = useRef<Record<string, Mask>>({});
  const view = useRef<HTMLCanvasElement>(null);
  const sel = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2200); };

  useEffect(() => {
    warmUpInpaint();
    (async () => {
      const img = await decode(photo.blob, INPAINT_SIDE);
      work.current = img;
      const el = host.current!;
      const ar = img.width / img.height;
      let w = el.clientWidth - 20, h = w / ar;
      if (h > el.clientHeight - 10) { h = el.clientHeight - 10; w = h * ar; }
      setSize({ w: Math.round(w), h: Math.round(h) });
      const small = shrink(img, 1200);
      for (const c of [view.current!, sel.current!]) { c.width = small.width; c.height = small.height; }
      view.current!.getContext("2d")!.drawImage(small as CanvasImageSource, 0, 0);
      setBeforeUrl(view.current!.toDataURL("image/jpeg", 0.85));
      setBusy("Buscando personas y objetos…");
      const sg = await segment(shrink(img, 640), true);
      if (sg) seg.current = { person: sg.person, ...sg.masks };
      setBusy("");
    })().catch((e) => setBusy((e as Error).message));
  }, []);

  const pos = (e: PointerEvent) => {
    const r = sel.current!.getBoundingClientRect();
    return { u: (e.clientX - r.left) / r.width, v: (e.clientY - r.top) / r.height };
  };

  const paintMask = (m: Mask) => {
    const c = sel.current!, ctx = c.getContext("2d")!;
    const tmp = document.createElement("canvas");
    tmp.width = m.width; tmp.height = m.height;
    const t = tmp.getContext("2d")!, d = t.createImageData(m.width, m.height);
    for (let i = 0; i < m.data.length; i++) { d.data[i * 4] = 245; d.data[i * 4 + 1] = 13; d.data[i * 4 + 2] = 138; d.data[i * 4 + 3] = m.data[i] ? 255 : 0; }
    t.putImageData(d, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tmp, 0, 0, c.width, c.height);
    setHasSel(true);
  };

  const tap = (u: number, v: number) => {
    // la figura más concreta primero: objetos, luego persona
    const order = [...ELEMENTS.filter((e) => e.group === "Objetos").map((e) => e.id), "person"];
    for (const id of order) {
      const m = seg.current[id];
      if (!m) continue;
      const comp = componentAt(m, u, v);
      if (comp) { paintMask(comp); flash(`Marcado: ${ELEMENTS.find((e) => e.id === id)?.name ?? "persona"}`); return; }
    }
    flash("Ahí no reconozco nada: usa el pincel para marcarlo.");
  };

  const stroke = (u: number, v: number) => {
    const c = sel.current!, ctx = c.getContext("2d")!;
    const x = u * c.width, y = v * c.height, r = (brush / 100) * Math.max(c.width, c.height) * 0.5;
    ctx.fillStyle = "rgb(245,13,138)"; ctx.strokeStyle = "rgb(245,13,138)"; ctx.lineCap = "round"; ctx.lineWidth = r * 2;
    ctx.beginPath();
    if (last.current) { ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(x, y); ctx.stroke(); }
    else { ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    last.current = { x, y };
    setHasSel(true);
  };

  const clearSel = () => { const c = sel.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setHasSel(false); };

  const run = async () => {
    if (!work.current) return;
    setBusy("Quitando y rellenando con IA… (la primera vez se descarga, ≈28 MB)");
    try {
      const out = await removeArea(work.current, sel.current!);
      work.current = out;
      const small = shrink(out, 1200);
      view.current!.getContext("2d")!.drawImage(small as CanvasImageSource, 0, 0);
      clearSel();
      setResult(out);
      setCmp("curtain");
    } catch (e) {
      flash("No se ha podido cargar la IA de relleno: " + (e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const apply = async () => {
    if (!result) return onClose(false);
    setBusy("Guardando…");
    await session.replacePhoto(photo, await toJpeg(result, 0.95));
    onClose(true);
  };

  return (
    <div class="screen remove">
      <div class="topbar">
        <button class="icon-btn" onClick={() => onClose(false)} aria-label="Cancelar"><Icon name="close" /></button>
        <div class="title">Quitar objetos o personas</div>
        <button class="btn primary sm" disabled={!result || !!busy} onClick={apply}>Aplicar</button>
      </div>
      <div class="stage" ref={host}>
        <div class="rm-wrap" style={{ width: `${size.w}px`, height: `${size.h}px` }}>
          <canvas ref={view} class="rm-view" />
          <canvas ref={sel} class="rm-sel"
            onPointerDown={(e) => {
              if (busy) return;
              (e.target as Element).setPointerCapture(e.pointerId);
              const p = pos(e);
              if (mode === "tap") tap(p.u, p.v); else { last.current = null; stroke(p.u, p.v); }
            }}
            onPointerMove={(e) => { if (mode === "brush" && e.buttons && !busy) { const p = pos(e); stroke(p.u, p.v); } }}
            onPointerUp={() => (last.current = null)} />
          {result && cmp !== "after" && (
            <div class="ba-pos"><CurtainOverlay before={beforeUrl} mode={cmp} width={size.w} height={size.h} /></div>
          )}
        </div>
        {busy && <div class="stage-msg"><div class="spinner" /><p class="muted small">{busy}</p></div>}
      </div>
      {result && <CompareSwitch mode={cmp} setMode={setCmp} />}
      <div class="panel">
        <div class="chips">
          <button class={"chip" + (mode === "tap" ? " on" : "")} onClick={() => setMode("tap")}><Icon name="tap" size={16} />Tocar lo que quitar</button>
          <button class={"chip" + (mode === "brush" ? " on" : "")} onClick={() => setMode("brush")}><Icon name="brush" size={16} />Pintar</button>
          <button class="chip" disabled={!hasSel} onClick={clearSel}>Borrar marca</button>
        </div>
        {mode === "brush" && <Slider label="Pincel" min={1} max={15} value={brush} onInput={setBrush} />}
        <p class="hint">
          {mode === "tap" ? "Toca una persona, un coche, un animal… y se marca entera. Puedes marcar varias." : "Pinta encima de lo que quieras quitar (cables, papeles, manchas…)."}
          {result ? " Puedes seguir quitando cosas." : ""}
        </p>
        <div style={{ padding: "4px 16px 10px", display: "grid", gap: "8px" }}>
          <button class="btn primary block" disabled={!hasSel || !!busy} onClick={run}><Icon name="eraser" size={18} />Quitar lo marcado</button>
          {photo.originalBlob && !result && (
            <button class="btn ghost block sm" onClick={async () => { setBusy("Volviendo a la original…"); await session.restorePhoto(photo); onClose(true); }}>
              Deshacer: volver a la foto original
            </button>
          )}
        </div>
      </div>
      {toast && <div class="toast">{toast}</div>}
    </div>
  );
}
