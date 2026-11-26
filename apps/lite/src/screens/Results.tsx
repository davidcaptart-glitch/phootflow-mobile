// Todas las fotos con el estilo de la guía. Desde aquí se comparten o se pasa a diseñar para redes.
import { useEffect, useRef, useState } from "preact/hooks";
import { ENHANCE_AMOUNT, Renderer, decode, peopleAI, type FaceRef, type Person, enhance, enhanceReady, formatById, platform, shrink, toJpeg, type Look, type Photo, type Pixels, type Session } from "@phootflow/core";
import { saveExports, saveSession } from "../saving";
import { BeforeAfter } from "../BeforeAfter";
import { Remove } from "./Remove";
import type { Tools } from "./Choose";

export function Results({ session, look, tools, onBack, onDesign, onRestart }: {
  session: Session; look: Look; tools: Tools; onBack: () => void; onDesign: () => void; onRestart: () => void;
}) {
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<{ done: number; total: number; msg: string } | null>(null);
  const [toast, setToast] = useState("");
  const [bw, setBw] = useState(false);
  const r = useRef<Renderer | null>(null);
  const fmt = look.formats[0] ?? null;
  const [open, setOpen] = useState<Photo | null>(null);
  const [removing, setRemoving] = useState<Photo | null>(null);
  const [redo, setRedo] = useState(0);
  const [big, setBig] = useState<{ before: string; after: string | null } | null>(null);
  const [enhBusy, setEnhBusy] = useState("");
  const [, setTick] = useState(0);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [who, setWho] = useState<string | null>(null);
  const person = people?.find((x) => x.id === who) ?? null;
  const shownPhotos = person ? session.photos.filter((p) => person.photoIds.includes(p.id)) : session.photos;

  const findPeople = async () => {
    const faces: FaceRef[] = [];
    try {
      const list = session.photos.filter((p) => !p.error);
      for (let i = 0; i < list.length; i++) {
        setBusy({ done: i, total: list.length, msg: "Buscando a las personas (la primera vez se descarga la IA, ≈40 MB)…" });
        const img = await decode(list[i].blob, 900);
        faces.push(...(await peopleAI.faceRefs(img, list[i].id)));
      }
      const ps = peopleAI.people(faces, names);
      setPeople(ps);
      setBusy(null);
      flash(ps.length ? `${ps.length} ${ps.length === 1 ? "persona" : "personas"} en varias fotos` : "No hay caras que se repitan en varias fotos.");
    } catch (e) {
      setBusy(null);
      flash("No se ha podido cargar la IA de personas: " + (e as Error).message);
    }
  };

  const coverUrl = (p: Person) => (p.cover ? URL.createObjectURL(p.cover) : "");

  const openPhoto = async (p: Photo) => {
    if (!p.stats || !r.current) return;
    setOpen(p); setBig(null);
    const rr = new Renderer();
    try {
      const out = await session.renderedPixels(rr, { ...p, enhance: false }, look, 900);
      const crop = fmt ? session.cropFor(p, fmt) : null;
      const shown = crop ? cropPixels(out, crop) : out;
      const before = URL.createObjectURL(await toJpeg(shown, 0.88));
      setBig({ before, after: null });
      if (p.enhance) await preview(p, shown, before);
    } finally {
      rr.dispose();
    }
  };

  const preview = async (p: Photo, shown: Pixels, before: string) => {
    setEnhBusy("Mejorando con IA… 0 %");
    try {
      const after = await enhance(shown, ENHANCE_AMOUNT, (k, n) => setEnhBusy(`Mejorando con IA… ${Math.round((100 * k) / n)} %`));
      setBig({ before, after: URL.createObjectURL(await toJpeg(after, 0.88)) });
    } catch {
      flash("No se ha podido cargar la IA de mejora en este móvil.");
      p.enhance = false;
    } finally {
      setEnhBusy("");
    }
  };

  // la sesión (originales + estilo) se guarda en la app al llegar aquí
  useEffect(() => {
    session.analyzeAll().then(() => saveSession(session, look, tools)).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      r.current ??= new Renderer();
      for (const p of session.photos) {
        await session.analyze(p);
        if (!alive) return;
        if (!p.stats || !p.thumb) continue;
        await session.prepare(r.current, p, p.thumb, look);
        const crop = fmt ? session.cropFor(p, fmt) : null;
        const ar = fmt ? formatById(fmt).ratio : p.thumb.width / p.thumb.height;
        const w = 360, h = Math.round(w / ar);
        session.draw(r.current, p, look, { width: w, height: h, crop, bw });
        const url = URL.createObjectURL(await r.current.toBlob(0.85));
        if (alive) setPreviews((x) => ({ ...x, [p.id]: url }));
      }
    })();
    return () => { alive = false; };
  }, [bw, redo]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2600); };

  const exportAndShare = async () => {
    const big = new Renderer();
    try {
      setBusy({ done: 0, total: shownPhotos.length, msg: "Preparando las fotos…" });
      await session.analyzeAll();
      const items = await session.exportAll(big, look, (done, total) => setBusy({ done, total, msg: "Revelando las fotos…" }),
        person ? person.photoIds : undefined);
      setBusy({ done: 1, total: 1, msg: "Guardando en Mis ediciones…" });
      await saveSession(session, look, tools);
      await saveExports(session, items);
      setBusy(null);
      const files = items.map((i) => i.file);
      if (!files.length) return flash("No hay fotos que exportar.");
      const res = await platform.share(files);
      flash(res === "shared" ? "¡Listo! También están en Mis ediciones" : res === "saved" ? `${files.length} fotos descargadas y guardadas en Mis ediciones` : "Guardadas en Mis ediciones");
    } catch (e) {
      setBusy(null);
      flash((e as Error).message);
    } finally {
      big.dispose();
    }
  };

  const n = session.photos.length;
  const errors = session.photos.filter((p) => p.error);
  const perPhoto = Math.max(1, look.formats.length) * (look.alsoBW ? 2 : 1);

  return (
    <div class="screen">
      <div class="topbar">
        <button class="icon-btn" onClick={onBack} aria-label="Volver a editar">‹</button>
        <div class="title">{n} {n === 1 ? "foto lista" : "fotos listas"}</div>
        <button class="icon-btn" onClick={onRestart} aria-label="Empezar de nuevo">↺</button>
      </div>
      <div class="scroll">
        {look.alsoBW && (
          <div class="chips" style={{ padding: "4px 16px 10px" }}>
            <button class={"chip" + (!bw ? " on" : "")} onClick={() => setBw(false)}>Color</button>
            <button class={"chip" + (bw ? " on" : "")} onClick={() => setBw(true)}>Blanco y negro</button>
          </div>
        )}
        <div class="people">
          {people === null ? (
            <button class="chip" onClick={findPeople}>👥 Buscar personas</button>
          ) : people.length === 0 ? (
            <span class="muted small">Ninguna persona se repite en varias fotos.</span>
          ) : (
            <>
              <button class={"person" + (who === null ? " on" : "")} onClick={() => setWho(null)}>
                <span class="av all">Todas</span><span class="pname">{session.photos.length} fotos</span>
              </button>
              {people.map((p) => (
                <button class={"person" + (who === p.id ? " on" : "")} onClick={() => {
                  if (who === p.id) {
                    const n = prompt("Nombre de esta persona:", names[p.id] ?? "");
                    if (n?.trim()) { setNames({ ...names, [p.id]: n.trim() }); p.name = n.trim(); }
                  } else setWho(p.id);
                }}>
                  <img class="av" src={coverUrl(p)} />
                  <span class="pname">{p.name}</span>
                  <span class="pcount">{p.photoIds.length} fotos</span>
                </button>
              ))}
            </>
          )}
        </div>
        {person && <p class="hint">Fotos de {person.name}. Vuelve a tocar su cara para ponerle nombre.</p>}
        <div class="grid">
          {shownPhotos.map((p) => (
            <button class="cell" style={{ aspectRatio: fmt ? String(formatById(fmt).ratio) : "1" }} onClick={() => openPhoto(p)}>
              {previews[p.id] ? <img src={previews[p.id]} /> : p.error ? <span class="error small">{p.error}</span> : <div class="spinner sm" />}
              {p.enhance && <span class="enh-badge">✨ IA</span>}
            </button>
          ))}
        </div>
        <p class="muted small pad">
          Se exportarán {n * perPhoto} archivos: {look.formats.length ? look.formats.map((f) => formatById(f).use).join(", ") : "proporción original"}
          {look.alsoBW ? ", en color y en B/N" : ""}.
          {errors.length ? ` ${errors.length} no se han podido abrir.` : ""}
        </p>
      </div>
      <div class="bottombar" style={{ display: "grid", gap: "10px" }}>
        <button class="btn primary block" onClick={exportAndShare}>{person ? `Subir las fotos de ${person.name}` : "Subir a redes / guardar"}</button>
        <button class="btn block" onClick={onDesign}>Diseñar post o carrusel</button>
      </div>
      {busy && (
        <div class="overlay">
          <div>
            <div class="spinner" />
            <p>{busy.msg}</p>
            <div class="progress"><div style={{ width: `${(100 * busy.done) / Math.max(1, busy.total)}%` }} /></div>
            <p class="muted small">{busy.done} de {busy.total}</p>
          </div>
        </div>
      )}
      {open && (
        <div class="sheet-bg" onClick={() => setOpen(null)}>
          <div class="sheet" onClick={(e) => e.stopPropagation()}>
            <div class="big-view">
              {!big ? <div class="spinner" /> : big.after ? <BeforeAfter before={big.before} after={big.after} /> : <img src={big.before} />}
            </div>
            <div class="row" style={{ padding: "10px 16px 0" }}>
              <label class="switch grow">
                <input type="checkbox" checked={open.enhance} disabled={!!enhBusy} onChange={async (e) => {
                  const on = (e.target as HTMLInputElement).checked;
                  if (on && !(await enhanceReady())) { flash("La IA de mejora no está disponible (¿sin conexión la primera vez?)."); setTick((t) => t + 1); return; }
                  open.enhance = on;
                  setTick((t) => t + 1);
                  if (on && big && !big.after) {
                    const img = new Image(); img.src = big.before; await img.decode();
                    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
                    c.getContext("2d")!.drawImage(img, 0, 0);
                    await preview(open, c, big.before);
                  }
                }} />
                <span>✨ Mejorar con IA (enfocar y limpiar)</span>
              </label>
            </div>
            <p class="hint">{enhBusy || "Recupera nitidez y quita ruido. Tarda unos segundos por foto: úsalo en las que lo necesiten."}</p>
            <div style={{ padding: "4px 16px 0" }}>
              <button class="btn block sm" disabled={!!enhBusy} onClick={() => { setRemoving(open); setOpen(null); }}>
                🧽 Quitar objetos o personas{open.originalBlob ? " (retocada)" : ""}
              </button>
            </div>
            <div class="row" style={{ padding: "4px 16px 10px" }}>
              {[2, 4].map((k) => (
                <button class="btn sm grow" disabled={!!enhBusy} onClick={async () => {
                  const rr = new Renderer();
                  try {
                    setEnhBusy(`Ampliando ×${k} con IA… 0 %`);
                    const it = await session.exportUpscaled(rr, open, look, k, (a, n) => setEnhBusy(`Ampliando ×${k} con IA… ${Math.round((100 * a) / n)} %`));
                    await saveSession(session, look, tools);
                    await saveExports(session, [it]);
                    setEnhBusy("");
                    const res = await platform.share([it.file]);
                    flash(`${it.width} × ${it.height} px · guardada en Mis ediciones${res === "saved" ? " y descargada" : ""}`);
                  } catch (e) {
                    setEnhBusy("");
                    flash((e as Error).message);
                  } finally {
                    rr.dispose();
                  }
                }}>🔍 Ampliar ×{k} con IA</button>
              ))}
            </div>
            <button class="btn" onClick={() => setOpen(null)}>Hecho</button>
          </div>
        </div>
      )}
      {removing && (
        <Remove session={session} photo={removing} onClose={(changed) => {
          const p = removing;
          setRemoving(null);
          if (changed) { setPreviews((x) => { const y = { ...x }; delete y[p.id]; return y; }); setRedo((n) => n + 1); flash("Foto retocada: se aplica a todas sus versiones"); }
        }} />
      )}
      {toast && <div class="toast">{toast}</div>}
    </div>
  );
}

/** Recorte normalizado de un lienzo. */
function cropPixels(src: Pixels, c: { x: number; y: number; w: number; h: number }): Pixels {
  const w = Math.max(1, Math.round(c.w * src.width)), h = Math.max(1, Math.round(c.h * src.height));
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  out.getContext("2d")!.drawImage(src as CanvasImageSource, c.x * src.width, c.y * src.height, w, h, 0, 0, w, h);
  return shrink(out, 900);
}

