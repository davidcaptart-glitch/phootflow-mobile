// Retocar (tipo Photoshop): la foto revelada con capas no destructivas encima. Quitar objetos y personas con
// IA (MI-GAN), corrector y tampón con pincel, retoque de retrato, quitar o cambiar el fondo, texto y logo.
// Deshacer/rehacer, zoom para el detalle y exportar como en Revelar. Las capas se guardan solas en el catálogo.
import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { ELEMENTS, componentAt, platform, pro, retouch, segment, shrink, warmUpInpaint, type Mask, type Pixels } from "@phootflow/core";
import { Icon } from "@phootflow/core/ui";
import { ExportSheet } from "../ExportSheet";
import { PSlider } from "../ui";
import { RETOUCH_SIDE, developed, exportRetouched, thumbOf } from "./work";
import "./retouch.css";

type Layer = retouch.Layer;
type Tool = "remove" | "heal" | "clone" | "portrait" | "background" | "text" | "logo" | "layers";
const TOOLS: [Tool, string, string][] = [
  ["remove", "eraser", "Quitar"], ["heal", "heal", "Corrector"], ["clone", "stamp", "Tampón"], ["portrait", "beauty", "Retrato"],
  ["background", "person", "Fondo"], ["text", "text", "Texto"], ["logo", "image", "Logo"], ["layers", "layers", "Capas"],
];
const BRUSH_TOOLS: Tool[] = ["remove", "heal", "clone"];
const SWATCHES = ["#ffffff", "#05070f", "#f50d8a", "#7b2ff7", "#ffd166", "#3ccf91", "#4da3ff", "#ff5c6c"];
const BG_SWATCHES = ["#ffffff", "#f2efe9", "#05070f", "#e9e4ff", "#ffe1ef", "#d9f3e8", "#dbe9ff", "#7b2ff7", "#f50d8a"];
const toolOf = (l: Layer): Tool => (l.kind === "heal" ? (l.mode === "clone" ? "clone" : "heal") : l.kind);
const radiusOf = (b: number) => 0.004 + (b / 100) * 0.07;

let measureCtx: CanvasRenderingContext2D | null = null;
const measurer = () => (measureCtx ??= retouch.ctx2d(retouch.canvas(8, 8)));

export function Retouch({ id, onBack }: { id: string; onBack: () => void }) {
  const [photo, setPhoto] = useState<pro.CatalogPhoto | null>(null);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [, setTick] = useState(0);
  const [tool, setTool] = useState<Tool>("remove");
  const [sel, setSel] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [before, setBefore] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [hand, setHand] = useState(false);
  const [brush, setBrush] = useState(25);
  const [rmMode, setRmMode] = useState<"brush" | "tap">("brush");
  const [pending, setPending] = useState<{ strokes: retouch.Stroke[]; hole: Uint8Array | null }>({ strokes: [], hole: null });
  const [cloneSrc, setCloneSrc] = useState<{ u: number; v: number } | null>(null);
  const [picking, setPicking] = useState(false);
  const [sheet, setSheet] = useState<"" | "export">("");

  const base = useRef<Pixels | null>(null);
  const comp = useRef<retouch.Composer | null>(null);
  const hist = useRef(new retouch.History<Layer[]>([]));
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLCanvasElement>(null);
  const over = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<retouch.Stroke | null>(null);
  const cloneOff = useRef<{ dx: number; dy: number } | null>(null);
  const drag = useRef<{ id: string; u: number; v: number; x: number; y: number } | null>(null);
  const objMasks = useRef<Record<string, Mask> | null>(null);
  const holePreview = useRef<Pixels | null>(null);
  const thumb = useRef<Blob | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2200); };

  // ---- abrir
  useEffect(() => {
    let alive = true;
    warmUpInpaint();
    (async () => {
      const p = await pro.catalog.getPhoto(id);
      if (!p || !alive) return;
      setPhoto(p);
      const rec = await pro.catalog.getRetouch(id);
      thumb.current = rec?.thumb ?? null;
      const b = await developed(p, RETOUCH_SIDE);
      if (!alive) return;
      base.current = b;
      comp.current = new retouch.Composer(b);
      const ls = retouch.normalizeLayers(rec?.layers);
      if (ls.length) {
        setBusy("Preparando las capas…");
        await retouch.loadAssets(ls, b, comp.current.assets);
      }
      hist.current = new retouch.History(ls);
      setLayers(ls);
      setBusy(null);
      setReady(true);
    })().catch((e) => { setBusy(null); flash((e as Error).message); });
    return () => { alive = false; };
  }, [id]);

  // ---- encajar la foto en el escenario
  useEffect(() => {
    const fit = () => {
      const el = host.current, b = base.current;
      if (!el || !b) return;
      const ar = b.width / b.height;
      let w = el.clientWidth - 16, h = w / ar;
      if (h > el.clientHeight - 16) { h = el.clientHeight - 16; w = h * ar; }
      setSize({ w: Math.round(w), h: Math.round(h) });
    };
    fit();
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, [ready]);

  // ---- componer y pintar
  const frame = useRef(0);
  useEffect(() => {
    if (!ready || !comp.current || !base.current) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const out = before ? base.current! : comp.current!.compose(layers);
      const c = view.current;
      if (!c) return;
      if (c.width !== out.width || c.height !== out.height) { c.width = out.width; c.height = out.height; }
      const x = c.getContext("2d")!;
      x.clearRect(0, 0, c.width, c.height);
      x.drawImage(out as CanvasImageSource, 0, 0);
    });
  }, [layers, ready, before]);

  // ---- guardar (capas + miniatura)
  const saveTimer = useRef(0);
  const save = async (withThumb: boolean) => {
    if (!photo) return;
    if (withThumb && comp.current) thumb.current = layersRef.current.length ? await thumbOf(comp.current.compose(layersRef.current)) : null;
    await pro.catalog.saveRetouch({ id: photo.id, layers: layersRef.current, edited: Date.now(), thumb: thumb.current });
  };
  const scheduleSave = () => { clearTimeout(saveTimer.current); saveTimer.current = window.setTimeout(() => void save(false), 700); };
  const back = async () => {
    clearTimeout(saveTimer.current);
    setBusy("Guardando…");
    try { await save(true); } catch { /* se guarda lo que se pueda */ }
    onBack();
  };

  // ---- cambios e historial
  const commit = (label: string, next: Layer[] = layersRef.current) => {
    hist.current.push(label, next);
    layersRef.current = next;
    setLayers(next);
    setTick((t) => t + 1);
    scheduleSave();
  };
  const live = (next: Layer[]) => { layersRef.current = next; setLayers(next); };
  const patched = (lid: string, patch: Partial<Layer>) => layersRef.current.map((l) => (l.id === lid ? ({ ...l, ...patch } as Layer) : l));
  const undo = () => { const v = hist.current.undo(); live(v); setTick((t) => t + 1); scheduleSave(); };
  const redo = () => { const v = hist.current.redo(); live(v); setTick((t) => t + 1); scheduleSave(); };

  const selected = layers.find((l) => l.id === sel) ?? null;
  const W = base.current?.width ?? 1, H = base.current?.height ?? 1;

  // ---- superposición: trazos, marca del origen, caja de la capa elegida
  const drawOverlay = () => {
    const c = over.current;
    if (!c || !size.w) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const ow = Math.round(size.w * zoom * dpr), oh = Math.round(size.h * zoom * dpr);
    if (c.width !== ow || c.height !== oh) { c.width = ow; c.height = oh; }
    const x = c.getContext("2d")!;
    x.clearRect(0, 0, ow, oh);
    const L = Math.max(ow, oh);
    const strokes = [...(tool === "remove" ? pending.strokes : []), ...(drawing.current ? [drawing.current] : [])];
    x.strokeStyle = x.fillStyle = "rgba(245, 13, 138, 0.55)";
    x.lineCap = x.lineJoin = "round";
    if (tool === "remove" && holePreview.current) x.drawImage(holePreview.current as CanvasImageSource, 0, 0, ow, oh);
    for (const s of strokes) {
      const r = s.r * L;
      x.lineWidth = r * 2;
      x.beginPath();
      for (let i = 0; i < s.pts.length; i += 2) {
        const px = s.pts[i] * ow, py = s.pts[i + 1] * oh;
        if (i) x.lineTo(px, py); else x.moveTo(px, py);
      }
      if (s.pts.length === 2) { x.arc(s.pts[0] * ow, s.pts[1] * oh, r, 0, Math.PI * 2); x.fill(); } else x.stroke();
    }
    // origen del tampón
    if (tool === "clone") {
      let src = cloneSrc;
      const d = drawing.current;
      if (d && cloneOff.current) src = { u: d.pts[d.pts.length - 2] + cloneOff.current.dx, v: d.pts[d.pts.length - 1] + cloneOff.current.dy };
      if (src) {
        const px = src.u * ow, py = src.v * oh, r = (radiusOf(brush) / zoom) * L;
        x.lineWidth = 2 * dpr;
        x.strokeStyle = "#fff";
        x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.stroke();
        x.beginPath(); x.moveTo(px - r * 0.5, py); x.lineTo(px + r * 0.5, py); x.moveTo(px, py - r * 0.5); x.lineTo(px, py + r * 0.5); x.stroke();
      }
    }
    // caja del texto o logo elegido
    if (selected && (selected.kind === "text" || selected.kind === "logo") && (tool === "text" || tool === "logo")) {
      const b = boxOf(selected);
      if (b) {
        const k = ow / W;
        x.save();
        x.translate(selected.x * ow, selected.y * oh);
        x.rotate((selected.rotation * Math.PI) / 180);
        x.setLineDash([6 * dpr, 5 * dpr]);
        x.lineWidth = 1.5 * dpr;
        x.strokeStyle = "#fff";
        x.strokeRect((-b.w / 2) * k - 4 * dpr, (-b.h / 2) * k - 4 * dpr, b.w * k + 8 * dpr, b.h * k + 8 * dpr);
        x.restore();
      }
    }
  };
  useEffect(drawOverlay, [size, zoom, pending, cloneSrc, tool, sel, layers, brush]);

  const boxOf = (l: Layer) => {
    if (l.kind === "text") { const m = retouch.textMetrics(l, W, H, measurer()); return { w: m.w, h: m.h }; }
    if (l.kind === "logo") return retouch.logoSize(l, W, l.image ? comp.current?.assets.images.get(l.image) : undefined);
    return null;
  };

  /** Texto o logo bajo el dedo (el de más arriba). */
  const hit = (u: number, v: number): Layer | null => {
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      if (!l.visible || (l.kind !== "text" && l.kind !== "logo")) continue;
      const b = boxOf(l)!;
      const a = (-l.rotation * Math.PI) / 180, dx = (u - l.x) * W, dy = (v - l.y) * H;
      const rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(rx) <= b.w / 2 + W * 0.02 && Math.abs(ry) <= b.h / 2 + W * 0.02) return l;
    }
    return null;
  };

  // ---- dedo sobre la foto
  const pos = (e: PointerEvent) => {
    const r = over.current!.getBoundingClientRect();
    return { u: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), v: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  const down = (e: PointerEvent) => {
    if (busy || !ready || before) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const { u, v } = pos(e);
    if (tool === "text" || tool === "logo" || tool === "layers") {
      const l = hit(u, v);
      if (l && (l.kind === "text" || l.kind === "logo")) {
        setSel(l.id);
        if (tool === "layers") setTool(l.kind);
        drag.current = { id: l.id, u, v, x: l.x, y: l.y };
      }
      return;
    }
    if (tool === "remove" && rmMode === "tap") { void tapRemove(u, v); return; }
    if (tool === "clone" && (picking || !cloneSrc)) {
      setCloneSrc({ u, v }); cloneOff.current = null; setPicking(false);
      flash("Origen elegido: ahora pinta donde quieras copiarlo");
      return;
    }
    if (!BRUSH_TOOLS.includes(tool)) return;
    if (tool === "clone" && cloneSrc && !cloneOff.current) cloneOff.current = { dx: cloneSrc.u - u, dy: cloneSrc.v - v };
    drawing.current = { r: radiusOf(brush) / zoom, pts: [u, v] };
    drawOverlay();
  };

  const move = (e: PointerEvent) => {
    if (drag.current) {
      const { u, v } = pos(e), d = drag.current;
      live(patched(d.id, { x: d.x + u - d.u, y: d.y + v - d.v } as Partial<Layer>));
      return;
    }
    const s = drawing.current;
    if (!s) return;
    const { u, v } = pos(e);
    const lu = s.pts[s.pts.length - 2], lv = s.pts[s.pts.length - 1];
    if (Math.hypot((u - lu) * W, (v - lv) * H) < Math.max(W, H) * s.r * 0.25) return;
    s.pts.push(u, v);
    drawOverlay();
  };

  const up = () => {
    if (drag.current) {
      const d = drag.current;
      drag.current = null;
      const l = layersRef.current.find((x) => x.id === d.id);
      if (l && (l.kind === "text" || l.kind === "logo") && (l.x !== d.x || l.y !== d.y)) commit("Mover");
      return;
    }
    const s = drawing.current;
    if (!s) return;
    drawing.current = null;
    if (tool === "remove") setPending((p) => ({ ...p, strokes: [...p.strokes, s] }));
    else if (tool === "heal") {
      const below = comp.current!.compose(layersRef.current);
      const o = retouch.healOffset(below, [s]);
      commit("Corrector", [...layersRef.current, retouch.newHeal("heal", [s], o.dx, o.dy)]);
    } else if (tool === "clone" && cloneOff.current) {
      commit("Tampón", [...layersRef.current, retouch.newHeal("clone", [s], cloneOff.current.dx, cloneOff.current.dy)]);
    }
    drawOverlay();
  };

  // ---- quitar con IA
  const setHole = (hole: Uint8Array | null) => {
    if (!hole) { holePreview.current = null; } else {
      const c = retouch.canvas(W, H), x = retouch.ctx2d(c), d = x.createImageData(W, H);
      for (let i = 0; i < W * H; i++) if (hole[i]) { d.data[i * 4] = 245; d.data[i * 4 + 1] = 13; d.data[i * 4 + 2] = 138; d.data[i * 4 + 3] = 140; }
      x.putImageData(d, 0, 0);
      holePreview.current = c;
    }
    setPending((p) => ({ ...p, hole }));
  };

  const tapRemove = async (u: number, v: number) => {
    if (!objMasks.current) {
      setBusy("Buscando personas y objetos…");
      const sg = await segment(shrink(comp.current!.compose(layersRef.current), 640), true);
      setBusy(null);
      objMasks.current = sg ? { person: sg.person, ...sg.masks } : {};
    }
    const order = [...ELEMENTS.filter((e) => e.group === "Objetos").map((e) => e.id), "person"];
    for (const eid of order) {
      const m = objMasks.current[eid];
      const c = m && componentAt(m, u, v);
      if (!c) continue;
      // la segmentación va justa en los bordes (pelo, pies): se ensancha la marca un poco
      const raw = retouch.upsampleMask(c, W, H), f = new Float32Array(raw.length);
      for (let i = 0; i < raw.length; i++) f[i] = raw[i];
      const grown = retouch.blurChannel(f, W, H, Math.max(W, H) * 0.012, 2);
      const up = new Uint8Array(raw.length);
      for (let i = 0; i < up.length; i++) up[i] = grown[i] > 14 ? 255 : 0;
      const prev = pending.hole;
      if (prev) for (let i = 0; i < up.length; i++) if (prev[i] > up[i]) up[i] = prev[i];
      setHole(up);
      flash(`Marcado: ${eid === "person" ? "persona" : (ELEMENTS.find((x) => x.id === eid)?.name ?? "").toLowerCase()}`);
      return;
    }
    flash("Ahí no reconozco nada: usa el pincel para marcarlo.");
  };

  const clearPending = () => { setHole(null); setPending({ strokes: [], hole: null }); };

  const runRemove = async () => {
    if (!comp.current || (!pending.strokes.length && !pending.hole)) return;
    setBusy("Quitando y rellenando con IA… (la primera vez se descarga, ≈28 MB)");
    try {
      const below = comp.current.compose(layersRef.current);
      let hole = retouch.rasterStrokes(pending.strokes, W, H, undefined, 0.8);
      if (pending.hole) { const h = pending.hole; hole = hole.map((a, i) => Math.max(a, h[i])); }
      const l = await retouch.computeRemovePatch(below, retouch.newRemove(pending.strokes), hole);
      await retouch.prepareLayer(l, below, comp.current.assets);
      clearPending();
      commit("Quitar", [...layersRef.current, l]);
      objMasks.current = null; // la foto ha cambiado: se vuelve a buscar al tocar
    } catch (e) {
      flash("No se ha podido usar la IA de relleno: " + (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // ---- capas que necesitan la IA de caras o de personas
  const addPortrait = async () => {
    const l = retouch.newPortrait();
    setBusy("Buscando la cara…");
    await retouch.prepareLayer(l, comp.current!.compose(layersRef.current), comp.current!.assets);
    setBusy(null);
    const m = comp.current!.assets.masks.get(l.id);
    if (!m?.face && !m?.skin) { flash("No encuentro ninguna cara en esta foto (o la IA no está disponible sin conexión)."); return; }
    commit("Retrato", [...layersRef.current, l]);
    setSel(l.id);
  };

  const setBackground = async (mode: retouch.BackgroundMode, extra: Partial<retouch.BackgroundLayer> = {}) => {
    const cur = layersRef.current.find((l) => l.kind === "background") as retouch.BackgroundLayer | undefined;
    if (cur) {
      const next = patched(cur.id, { mode, ...extra });
      if (extra.image) await retouch.prepareLayer(next.find((x) => x.id === cur.id)!, base.current!, comp.current!.assets);
      commit("Fondo", next);
      setSel(cur.id);
      return;
    }
    const l = { ...retouch.newBackground(mode), ...extra };
    setBusy("Separando a la persona del fondo…");
    await retouch.prepareLayer(l, comp.current!.compose(layersRef.current), comp.current!.assets);
    setBusy(null);
    if (!comp.current!.assets.masks.get(l.id)?.person) { flash("No encuentro a ninguna persona en esta foto."); return; }
    commit("Fondo", [...layersRef.current, l]);
    setSel(l.id);
  };

  const pickImage = async (): Promise<Blob | null> => {
    const picked = await platform.pickPhotos();
    return picked[0]?.blob ?? null;
  };

  const addText = () => {
    const l = retouch.newText();
    commit("Texto", [...layersRef.current, l]);
    setSel(l.id);
  };

  const addLogo = async () => {
    const blob = await pickImage();
    if (!blob) return;
    const l = retouch.newLogo(blob);
    await retouch.prepareLayer(l, base.current!, comp.current!.assets);
    if (!comp.current!.assets.images.get(blob)) { flash("No se ha podido abrir esa imagen."); return; }
    commit("Logo", [...layersRef.current, l]);
    setSel(l.id);
  };

  const removeLayer = (lid: string) => { commit("Borrar capa", layersRef.current.filter((l) => l.id !== lid)); if (sel === lid) setSel(null); };
  const moveLayer = (lid: string, d: number) => {
    const ls = [...layersRef.current], i = ls.findIndex((l) => l.id === lid), j = i + d;
    if (i < 0 || j < 0 || j >= ls.length) return;
    [ls[i], ls[j]] = [ls[j], ls[i]];
    commit("Orden de capas", ls);
  };

  // reguladores de la capa elegida
  const lslider = (l: Layer, key: string, label: string, o: { min?: number; max?: number; def?: number; k?: number; fmt?: (v: number) => string } = {}) => {
    const k = o.k ?? 1;
    return (
      <PSlider label={label} value={((l as unknown as Record<string, number>)[key]) / k} min={o.min ?? 0} max={o.max ?? 100} def={o.def ?? 0} fmt={o.fmt}
        onInput={(v) => live(patched(l.id, { [key]: v * k } as Partial<Layer>))} onCommit={(lb) => commit(lb)} />
    );
  };

  const portrait = [...layers].reverse().find((l) => l.kind === "portrait") as retouch.PortraitLayer | undefined;
  const bg = layers.find((l) => l.kind === "background") as retouch.BackgroundLayer | undefined;
  const textSel = selected?.kind === "text" ? selected : null;
  const logoSel = selected?.kind === "logo" ? selected : null;
  const brushy = BRUSH_TOOLS.includes(tool) && !(tool === "remove" && rmMode === "tap");

  return (
    <div class="screen retouch">
      <div class="topbar">
        <button class="icon-btn" onClick={back} aria-label="Volver"><Icon name="back" /></button>
        <div class="title">
          <span class="ellipsis">{photo?.name ?? "…"}</span>
          <span class="sub-t">{layers.length} {layers.length === 1 ? "capa" : "capas"}</span>
        </div>
        <button class="icon-btn plain" disabled={!hist.current.canUndo || !!busy} onClick={undo}
          aria-label={hist.current.undoLabel ? `Deshacer: ${hist.current.undoLabel}` : "Deshacer"}><Icon name="undo" size={19} /></button>
        <button class="icon-btn plain" disabled={!hist.current.canRedo || !!busy} onClick={redo}
          aria-label={hist.current.redoLabel ? `Rehacer: ${hist.current.redoLabel}` : "Rehacer"}><Icon name="redo" size={19} /></button>
        <button class="btn primary sm" disabled={!ready || !!busy} onClick={() => setSheet("export")}>Exportar</button>
      </div>

      <div class={"stage rt-stage" + (zoom > 1 ? " zoomed" : "")} ref={host}>
        <div class="rt-wrap" style={{ width: `${size.w * zoom}px`, height: `${size.h * zoom}px` }}>
          <canvas ref={view} class="rt-view" />
          <canvas ref={over} class={"rt-over" + (hand ? " hand" : "") + (brushy ? " brush" : "")}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        </div>
        {!ready && !busy && <div class="stage-msg"><div class="spinner" /></div>}
        {ready && (
          <div class="rt-float">
            <button class={"rt-fbtn" + (zoom > 1 ? " on" : "")} onClick={() => { const z = zoom === 1 ? 2 : zoom === 2 ? 4 : 1; setZoom(z); if (z === 1) setHand(false); }}
              aria-label="Ampliar"><Icon name="zoom" size={17} />{zoom}×</button>
            {zoom > 1 && <button class={"rt-fbtn" + (hand ? " on" : "")} onClick={() => setHand(!hand)} aria-label="Mover la vista"><Icon name="hand" size={17} /></button>}
          </div>
        )}
        {ready && (
          <button class={"before-btn" + (before ? " on" : "")} aria-label="Mantén para ver sin retoques"
            onPointerDown={() => setBefore(true)} onPointerUp={() => setBefore(false)} onPointerLeave={() => setBefore(false)}>
            <Icon name="compare" size={18} />{before ? "Sin retoques" : "Antes"}
          </button>
        )}
      </div>

      <div class="panel dev-panel rt-panel">
        {tool === "remove" && (
          <>
            <div class="chips">
              <button class={"chip" + (rmMode === "brush" ? " on" : "")} onClick={() => setRmMode("brush")}><Icon name="brush" size={16} />Pintar</button>
              <button class={"chip" + (rmMode === "tap" ? " on" : "")} onClick={() => setRmMode("tap")}><Icon name="tap" size={16} />Tocar lo que quitar</button>
              <button class="chip" disabled={!pending.strokes.length && !pending.hole} onClick={clearPending}>Borrar marca</button>
            </div>
            {rmMode === "brush" && <PSlider label="Tamaño del pincel" value={brush} min={1} max={100} def={25} onInput={setBrush} onCommit={() => {}} />}
            <p class="hint">{rmMode === "tap" ? "Toca una persona, un coche, un animal… y se marca entera. Puedes marcar varias."
              : "Pinta encima de lo que quieras quitar: cables, papeles, gente al fondo… Amplía para el detalle."}</p>
            <div class="rt-cta">
              <button class="btn primary block" disabled={(!pending.strokes.length && !pending.hole) || !!busy} onClick={runRemove}>
                <Icon name="eraser" size={18} />Quitar lo marcado</button>
            </div>
          </>
        )}
        {tool === "heal" && (
          <>
            <PSlider label="Tamaño del pincel" value={brush} min={1} max={100} def={25} onInput={setBrush} onCommit={() => {}} />
            <p class="hint">Pinta sobre granos, manchas o polvo: el corrector busca piel o fondo parecido alrededor y funde el color.
              Amplía con la lupa para afinar.</p>
          </>
        )}
        {tool === "clone" && (
          <>
            <div class="chips">
              <button class={"chip" + (picking || !cloneSrc ? " on" : "")} onClick={() => { setPicking(true); cloneOff.current = null; }}>
                <Icon name="target" size={16} />{cloneSrc ? "Cambiar el origen" : "Elegir el origen"}</button>
            </div>
            <PSlider label="Tamaño del pincel" value={brush} min={1} max={100} def={25} onInput={setBrush} onCommit={() => {}} />
            <p class="hint">{picking || !cloneSrc ? "Toca la zona que quieres copiar." : "Pinta donde quieras copiarla: el origen sigue a tu dedo (el círculo blanco)."}</p>
          </>
        )}
        {tool === "portrait" && (
          portrait ? (
            <>
              {lslider(portrait, "skin", "Suavizar piel")}
              {lslider(portrait, "eyes", "Ojos más claros")}
              {lslider(portrait, "teeth", "Blanquear dientes")}
              {lslider(portrait, "circles", "Quitar ojeras")}
              {!comp.current?.assets.masks.get(portrait.id)?.face && <p class="hint">No veo bien los ojos ni la boca: solo se suaviza la piel.</p>}
            </>
          ) : (
            <div class="rt-empty">
              <p class="hint">Piel, ojos, dientes y ojeras con la IA del móvil (nada sale del teléfono). Funciona mejor con caras de frente.</p>
              <div class="rt-cta"><button class="btn primary block" disabled={!ready || !!busy} onClick={addPortrait}><Icon name="beauty" size={18} />Retocar el retrato</button></div>
            </div>
          )
        )}
        {tool === "background" && (
          <>
            <div class="chips">
              {([["transparent", "Quitar"], ["color", "Color"], ["blur", "Desenfocar"], ["image", "Imagen"]] as [retouch.BackgroundMode, string][]).map(([m, n]) => (
                <button class={"chip" + (bg?.mode === m ? " on" : "")} disabled={!ready || !!busy} onClick={async () => {
                  if (m === "image") { const b = await pickImage(); if (b) await setBackground("image", { image: b }); }
                  else await setBackground(m);
                }}>{n}</button>
              ))}
            </div>
            {bg?.mode === "color" && (
              <div class="rt-swatches">
                {BG_SWATCHES.map((c) => <button class={"rt-sw" + (bg.color === c ? " on" : "")} style={{ background: c }} aria-label={`Fondo ${c}`}
                  onClick={() => commit("Color del fondo", patched(bg.id, { color: c }))} />)}
                <label class="rt-sw rt-custom" aria-label="Otro color"><input type="color" value={bg.color}
                  onInput={(e) => live(patched(bg.id, { color: (e.target as HTMLInputElement).value }))} onChange={() => commit("Color del fondo")} /></label>
              </div>
            )}
            {bg?.mode === "blur" && lslider(bg, "blur", "Desenfoque", { def: 60 })}
            {bg && lslider(bg, "feather", "Borde suave", { def: 30 })}
            {bg ? (
              <div class="rt-cta"><button class="btn ghost sm block" onClick={() => removeLayer(bg.id)}><Icon name="trash" size={16} />Volver al fondo original</button></div>
            ) : (
              <p class="hint">La IA separa a la persona: quita el fondo (PNG transparente), ponle un color, desenfócalo o usa otra foto.</p>
            )}
          </>
        )}
        {tool === "text" && (
          textSel ? <TextPanel l={textSel} live={(p) => live(patched(textSel.id, p))} commit={commit} lslider={lslider} onDelete={() => removeLayer(textSel.id)} onAdd={addText} />
            : (
              <div class="rt-empty">
                <p class="hint">Añade un título, una firma o un precio. Arrástralo con el dedo para colocarlo; toca un texto para editarlo.</p>
                <div class="rt-cta"><button class="btn primary block" disabled={!ready} onClick={addText}><Icon name="text" size={18} />Añadir texto</button></div>
              </div>
            )
        )}
        {tool === "logo" && (
          logoSel ? (
            <>
              {lslider(logoSel, "scale", "Tamaño", { min: 3, max: 90, def: 22, k: 0.01 })}
              {lslider(logoSel, "opacity", "Opacidad", { min: 5, max: 100, def: 90, k: 0.01 })}
              {lslider(logoSel, "rotation", "Giro", { min: -180, max: 180, fmt: (v) => `${Math.round(v)}°` })}
              <div class="chips" style={{ paddingTop: "6px" }}>
                <button class="chip" onClick={async () => {
                  const b = await pickImage(); if (!b) return;
                  const next = patched(logoSel.id, { image: b });
                  await retouch.prepareLayer(next.find((x) => x.id === logoSel.id)!, base.current!, comp.current!.assets);
                  commit("Cambiar logo", next);
                }}><Icon name="image" size={16} />Cambiar imagen</button>
                <button class="chip" onClick={addLogo}><Icon name="plus" size={16} />Otro logo</button>
                <button class="chip" onClick={() => removeLayer(logoSel.id)}><Icon name="trash" size={16} />Borrar</button>
              </div>
            </>
          ) : (
            <div class="rt-empty">
              <p class="hint">Tu marca de agua o tu logo (mejor un PNG con fondo transparente). Arrástralo para colocarlo.</p>
              <div class="rt-cta"><button class="btn primary block" disabled={!ready} onClick={addLogo}><Icon name="image" size={18} />Elegir el logo</button></div>
            </div>
          )
        )}
        {tool === "layers" && (
          <LayersPanel layers={layers} sel={sel} onSelect={(l) => { setSel(l.id); }} onOpen={(l) => { setSel(l.id); setTool(toolOf(l)); }}
            onToggle={(l) => commit(l.visible ? "Ocultar capa" : "Mostrar capa", patched(l.id, { visible: !l.visible }))}
            onMove={moveLayer} onDelete={removeLayer} lslider={lslider} selected={selected} />
        )}
      </div>

      <div class="tabs">
        {TOOLS.map(([k, ico, name]) => (
          <button class={"tab" + (tool === k ? " on" : "")} onClick={() => {
            setTool(k); setPicking(false);
            if (k === "portrait" && portrait) setSel(portrait.id);
            if (k === "background" && bg) setSel(bg.id);
            if ((k === "text" || k === "logo") && selected?.kind !== k) {
              const last = [...layers].reverse().find((l) => l.kind === k);
              setSel(last?.id ?? null);
            }
          }}><Icon name={ico} size={20} />{name}</button>
        ))}
      </div>

      {busy && <div class="overlay"><div><div class="spinner" /><p class="muted small" style={{ maxWidth: "30ch" }}>{busy}</p></div></div>}
      {toast && <div class="toast">{toast}</div>}
      {sheet === "export" && photo && (
        <ExportSheet photos={[photo]} devOf={(p) => p.dev} onClose={() => setSheet("")}
          exporter={(p, opt) => exportRetouched(p, layersRef.current, opt, comp.current?.assets)} />
      )}
    </div>
  );
}

type LSlider = (l: Layer, key: string, label: string, o?: { min?: number; max?: number; def?: number; k?: number; fmt?: (v: number) => string }) => JSX.Element;

function TextPanel({ l, live, commit, lslider, onDelete, onAdd }: {
  l: retouch.TextLayer; live: (p: Partial<retouch.TextLayer>) => void; commit: (label: string) => void; lslider: LSlider;
  onDelete: () => void; onAdd: () => void;
}) {
  const set = (label: string, p: Partial<retouch.TextLayer>) => { live(p); commit(label); };
  return (
    <>
      <div style={{ padding: "0 16px 6px" }}>
        <textarea class="field rt-text" rows={2} value={l.text} aria-label="Texto"
          onInput={(e) => live({ text: (e.target as HTMLTextAreaElement).value })} onChange={() => commit("Escribir")} />
      </div>
      <div class="chips">
        {(Object.entries(retouch.FONTS) as [retouch.FontId, { name: string; css: string }][]).map(([f, d]) => (
          <button class={"chip" + (l.font === f ? " on" : "")} style={{ fontFamily: d.css }} onClick={() => set("Letra", { font: f })}>{d.name}</button>
        ))}
      </div>
      <div class="rt-swatches">
        {SWATCHES.map((c) => <button class={"rt-sw" + (l.color === c ? " on" : "")} style={{ background: c }} aria-label={`Color ${c}`} onClick={() => set("Color", { color: c })} />)}
        <label class="rt-sw rt-custom" aria-label="Otro color"><input type="color" value={l.color}
          onInput={(e) => live({ color: (e.target as HTMLInputElement).value })} onChange={() => commit("Color")} /></label>
      </div>
      <div class="chips">
        <button class={"chip" + (l.bold ? " on" : "")} onClick={() => set("Negrita", { bold: !l.bold })}><b>N</b></button>
        {(["left", "center", "right"] as const).map((a) => (
          <button class={"chip" + (l.align === a ? " on" : "")} onClick={() => set("Alineación", { align: a })}>{{ left: "Izquierda", center: "Centro", right: "Derecha" }[a]}</button>
        ))}
        <button class={"chip" + (l.shadow ? " on" : "")} onClick={() => set("Sombra", { shadow: !l.shadow })}>Sombra</button>
        <button class={"chip" + (l.box ? " on" : "")} onClick={() => set("Recuadro", { box: l.box ? "" : l.color === "#05070f" ? "rgba(255,255,255,0.85)" : "rgba(5,7,15,0.62)" })}>Recuadro</button>
      </div>
      {lslider(l, "size", "Tamaño", { min: 1.5, max: 30, def: 7.5, k: 0.01 })}
      {lslider(l, "rotation", "Giro", { min: -180, max: 180, fmt: (v) => `${Math.round(v)}°` })}
      {lslider(l, "opacity", "Opacidad", { min: 5, max: 100, def: 100, k: 0.01 })}
      <div class="chips" style={{ paddingTop: "6px" }}>
        <button class="chip" onClick={onAdd}><Icon name="plus" size={16} />Otro texto</button>
        <button class="chip" onClick={onDelete}><Icon name="trash" size={16} />Borrar</button>
      </div>
    </>
  );
}

function LayersPanel({ layers, sel, selected, onSelect, onOpen, onToggle, onMove, onDelete, lslider }: {
  layers: Layer[]; sel: string | null; selected: Layer | null; onSelect: (l: Layer) => void; onOpen: (l: Layer) => void;
  onToggle: (l: Layer) => void; onMove: (id: string, d: number) => void; onDelete: (id: string) => void; lslider: LSlider;
}) {
  if (!layers.length) return <p class="hint">Aún no hay capas. Cada retoque crea una capa: puedes ocultarla, cambiar el orden o borrarla cuando quieras.</p>;
  const ICON: Record<retouch.LayerKind, string> = { remove: "eraser", heal: "heal", portrait: "beauty", background: "person", text: "text", logo: "image" };
  return (
    <>
      <div class="rt-layers">
        {[...layers].reverse().map((l, ri) => {
          const i = layers.length - 1 - ri;
          return (
            <div class={"rt-layer" + (sel === l.id ? " on" : "") + (l.visible ? "" : " off")}>
              <button class="rt-vis" onClick={() => onToggle(l)} aria-label={l.visible ? "Ocultar" : "Mostrar"}><Icon name={l.visible ? "eye" : "eyeOff"} size={18} /></button>
              <button class="rt-lname" onClick={() => (sel === l.id ? onOpen(l) : onSelect(l))}>
                <Icon name={l.kind === "heal" && l.mode === "clone" ? "stamp" : ICON[l.kind]} size={16} />
                <span class="ellipsis">{retouch.layerName(l)}</span>
              </button>
              <button class="rt-mini" disabled={i === layers.length - 1} onClick={() => onMove(l.id, 1)} aria-label="Subir"><Icon name="up" size={16} /></button>
              <button class="rt-mini" disabled={i === 0} onClick={() => onMove(l.id, -1)} aria-label="Bajar"><Icon name="down" size={16} /></button>
              <button class="rt-mini" onClick={() => onDelete(l.id)} aria-label="Borrar"><Icon name="trash" size={16} /></button>
            </div>
          );
        })}
      </div>
      {selected && lslider(selected, "opacity", `Opacidad · ${retouch.layerName(selected)}`, { min: 0, max: 100, def: 100, k: 0.01 })}
      {selected && <p class="hint">Toca de nuevo la capa elegida para editarla con su herramienta.</p>}
    </>
  );
}
