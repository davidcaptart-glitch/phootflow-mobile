// Editor en vivo de la foto guía. Solo aparecen las herramientas elegidas (más «Luz», siempre).
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  BW_LUTS, COLOR_LUTS, DEFAULT_LOOK, FORMATS, LUT_GROUPS, NETWORKS, LUT_SIZE, Renderer, WORK_SIDE, ZERO_LIGHT,
  ELEMENTS, warmUpPortrait, beautyEligible, bokehEligible, decode, elementName, formatById, loadLut, lutById, shrink, unionMask, warmUp,
  styles, type FormatId, type Light, type Look, type Photo, type Pixels, type Session, type Splash, type Style,
} from "@phootflow/core";
import type { Tools } from "./Choose";
import { CompareSwitch, CurtainOverlay, type CompareMode } from "../BeforeAfter";

type Tab = "styles" | "filters" | "bokeh" | "beauty" | "crop" | "splash" | "bw" | "light";

const TABS: { key: Tab; ico: string; name: string }[] = [
  { key: "styles", ico: "⭐", name: "Estilos" },
  { key: "filters", ico: "🎞️", name: "Filtros" },
  { key: "bokeh", ico: "🌫️", name: "Fondo" },
  { key: "beauty", ico: "✨", name: "Belleza" },
  { key: "crop", ico: "📐", name: "Recorte" },
  { key: "splash", ico: "🎨", name: "Color" },
  { key: "bw", ico: "◐", name: "B/N" },
  { key: "light", ico: "☀️", name: "Luz" },
];

const NEUTRAL = { ...ZERO_LIGHT, wbR: 1, wbB: 1 };
const HUES: [number, string, string][] = [
  [0, "Rojo", "#e53935"], [28, "Naranja", "#fb8c00"], [52, "Amarillo", "#fdd835"], [120, "Verde", "#43a047"],
  [185, "Turquesa", "#00acc1"], [220, "Azul", "#1e66d0"], [275, "Morado", "#8e24aa"], [330, "Rosa", "#e91e8c"],
];
const hueDist = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const hueName = (h: number) => HUES.reduce((a, b) => (hueDist(b[0], h) < hueDist(a[0], h) ? b : a))[1];

/** Tono (grados) del punto tocado en la foto original (media de 5×5 px). Null si es un gris. */
function sampleHue(img: Pixels, u: number, v: number): number | null {
  const ctx = (img as HTMLCanvasElement).getContext("2d") as CanvasRenderingContext2D;
  const x = Math.max(0, Math.min(img.width - 5, Math.round(u * img.width) - 2));
  const y = Math.max(0, Math.min(img.height - 5, Math.round(v * img.height) - 2));
  const d = ctx.getImageData(x, y, 5, 5).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  r /= 25 * 255; g /= 25 * 255; b /= 25 * 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  if (c < 0.06 || c / (mx + 1e-6) < 0.12) return null;
  const h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
  return Math.round((h * 60 + 360) % 360);
}

const BOKEH_LEVELS: [number, string][] = [[25, "Suave"], [45, "Medio"], [70, "Fuerte"], [100, "Muy fuerte"]];

interface Props {
  session: Session; tools: Tools; look: Look;
  setLook: (f: (l: Look) => Look) => void;
  setTools: (t: Tools) => void;
  onBack: () => void; onDone: () => void;
}

/** ¿Algún elemento elegido es un objeto (necesita el modelo de objetos)? */
const needsObjects = (l: Look) => l.splash.on && l.splash.parts.some((id) => ELEMENTS.find((e) => e.id === id)?.group === "Objetos");

export function Editor({ session, tools, look, setLook, setTools, onBack, onDone }: Props) {
  const tabs = TABS.filter((t) => t.key === "light" || t.key === "styles" || tools[t.key as keyof Tools]);
  const [tab, setTab] = useState<Tab>(tabs[1]?.key ?? "styles");
  const [aiTick, setAiTick] = useState(0);
  const [styleList, setStyleList] = useState<Style[]>([]);
  const [styleThumbs, setStyleThumbs] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<null | { mode: "save" } | { mode: "edit"; st: Style }>(null);
  const [nameInput, setNameInput] = useState("");
  const [usedStyle, setUsedStyle] = useState<string | null>(null);
  const [creator, setCreator] = useState(false);
  const [simple, setSimple] = useState<styles.Simple>(styles.SIMPLE_DEFAULT);
  const answer = <K extends keyof styles.Simple>(k: K, v: styles.Simple[K]) => {
    const s = { ...simple, [k]: v };
    setSimple(s);
    setLook((l) => styles.applySimple(l, s));
    setUsedStyle(null);
  };
  const loadStyles = () => styles.allStyles().then(setStyleList);
  useEffect(() => { void loadStyles(); }, []);
  const [guide, setGuide] = useState<Photo | null>(session.guide);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Preparando la foto…");
  const [compare, setCompare] = useState<CompareMode>("after");
  const [beforeUrl, setBeforeUrl] = useState("");
  const [shown, setShown] = useState({ w: 0, h: 0 });
  const [viewBW, setViewBW] = useState(false);
  const [previewFmt, setPreviewFmt] = useState<FormatId | null>(look.formats[0] ?? null);
  const [group, setGroup] = useState(lutById(look.lut)?.group ?? "Looks");
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [toast, setToast] = useState("");
  const [, setTick] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const r = useRef<Renderer | null>(null);
  const work = useRef<Pixels | null>(null);
  const tr = useRef<Renderer | null>(null);
  const frame = useRef(0);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  // --- preparar la guía
  useEffect(() => {
    warmUp(session.needObjects);
    if (session.needPortrait) warmUpPortrait();
    if (!r.current) {
      r.current = new Renderer();
      host.current!.appendChild(r.current.canvas as HTMLCanvasElement);
    }
    let alive = true;
    (async () => {
      const g = guide!;
      setReady(false);
      if (!g.stats || g.aiLevel < session.aiLevel) {
        setStatus(session.needSegmentation ? "Buscando a las personas (la primera vez se descarga la IA)…" : "Analizando la foto…");
        await session.analyze(g);
      }
      if (!alive) return;
      if (g.error) { setStatus(g.error); return; }
      work.current = await decode(g.blob, Math.min(WORK_SIDE, r.current!.maxSize));
      await session.prepare(r.current!, g, work.current, look);
      setThumbs({});
      if (alive) setReady(true);
      // las demás, en segundo plano
      void session.analyzeAll(() => alive && setTick((t) => t + 1));
    })();
    return () => { alive = false; };
  }, [guide, aiTick]);

  // --- tamaño del hueco
  useEffect(() => {
    const el = host.current!;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // --- LUT al cambiar de filtro
  useEffect(() => {
    if (!ready || !r.current) return;
    let alive = true;
    (async () => {
      const t = look.lut ? await loadLut(look.lut) : null;
      const b = look.bwLut ? await loadLut(look.bwLut) : null;
      if (!alive) return;
      r.current!.setLut(look.lut, t, LUT_SIZE);
      r.current!.setBwLut(look.bwLut, b, LUT_SIZE);
      draw();
    })();
    return () => { alive = false; };
  }, [look.lut, look.bwLut, ready]);

  useEffect(() => {
    if (!ready || !r.current || !guide) return;
    r.current.setSelection(look.splash.parts.length ? unionMask(guide.masks, look.splash.parts) : null);
    draw();
  }, [look.splash.parts.join(), ready]);

  const fmt = tab === "crop" || look.formats.length ? previewFmt : null;

  const draw = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const rr = r.current, g = guide;
      if (!rr || !g?.stats || !work.current || !box.w) return;
      const crop = fmt ? session.cropFor(g, fmt) : null;
      const aspect = crop ? formatById(fmt!).ratio : work.current.width / work.current.height;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      let w = box.w, h = w / aspect;
      if (h > box.h) { h = box.h; w = h * aspect; }
      const W = Math.round(Math.min(w * dpr, work.current.width)), H = Math.round(W / aspect);
      const c = rr.canvas as HTMLCanvasElement;
      c.style.width = `${Math.round(w)}px`;
      c.style.height = `${Math.round(h)}px`;
      c.style.borderRadius = fmt && formatById(fmt).circle ? "50%" : "";
      setShown({ w: Math.round(w), h: Math.round(h) });
      if (compare !== "after") {
        // el «antes» (la foto tal cual, con el mismo encuadre) como imagen encima del lienzo
        rr.render({ develop: NEUTRAL, look: DEFAULT_LOOK, crop, width: W, height: H });
        setBeforeUrl(c.toDataURL("image/jpeg", 0.85));
      }
      session.draw(rr, g, look, { width: W, height: H, crop, bw: viewBW || (tab === "bw" && look.alsoBW) });
    });
  };
  useEffect(draw, [look, compare, viewBW, fmt, box, ready, tab]);

  // --- miniaturas de los filtros (con la propia foto)
  const list = useMemo(() => {
    if (tab === "bw") return BW_LUTS;
    return COLOR_LUTS.filter((l) => l.group === group);
  }, [tab, group]);

  useEffect(() => {
    if (!ready || (tab !== "filters" && tab !== "bw")) return;
    const g = guide!;
    let alive = true;
    (async () => {
      if (!tr.current) tr.current = new Renderer();
      const t = tr.current;
      const small = shrink(g.thumb!, 160);
      await session.prepare(t, g, small, { ...look, lut: null, bwLut: null });
      const out: Record<string, string> = {};
      const sz = { width: small.width, height: small.height };
      const base = { ...look, lutAmount: 1, bokeh: 0, beauty: 0, grain: 0, vignette: 0 };
      const shot = () => (t.canvas as HTMLCanvasElement).toDataURL("image/jpeg", 0.8);
      session.draw(t, g, { ...base, lut: null, bwLut: null }, { ...sz, bw: tab === "bw" });
      out["__none"] = shot();
      for (const l of list) {
        if (!alive) return;
        if (thumbs[l.id + tab]) { out[l.id + tab] = thumbs[l.id + tab]; continue; }
        const tab3 = await loadLut(l.id);
        if (tab === "bw") { t.setBwLut(l.id, tab3, LUT_SIZE); session.draw(t, g, { ...base, bwLut: l.id }, { ...sz, bw: true }); }
        else { t.setLut(l.id, tab3, LUT_SIZE); session.draw(t, g, { ...base, lut: l.id }, sz); }
        out[l.id + tab] = shot();
        if (alive) setThumbs((p) => ({ ...p, ...out }));
      }
      if (alive) setThumbs((p) => ({ ...p, ...out }));
    })();
    return () => { alive = false; };
  }, [ready, tab, group, guide]);

  useEffect(() => {
    if (!ready || tab !== "styles" || !guide?.thumb) return;
    let alive = true;
    (async () => {
      tr.current ??= new Renderer();
      const t = tr.current, g = guide;
      const small = shrink(g.thumb!, 160);
      for (const st of styleList) {
        const key = st.id + st.created;
        if (!alive) return;
        if (styleThumbs[key]) continue;
        await session.prepare(t, g, small, st.look);
        session.draw(t, g, st.look, { width: small.width, height: small.height });
        const url = (t.canvas as HTMLCanvasElement).toDataURL("image/jpeg", 0.8);
        if (alive) setStyleThumbs((p) => ({ ...p, [key]: url }));
      }
    })();
    return () => { alive = false; };
  }, [ready, tab, styleList, guide, aiTick]);

  const applyStyle = (st: Style) => {
    const l = styles.styleLook(st.look);
    setLook(() => l);
    const merged = { ...tools };
    for (const [k, v] of Object.entries(st.tools)) if (v) (merged as Record<string, boolean>)[k] = true;
    setTools(merged);
    const before = session.aiLevel;
    session.require(l.bokeh > 0 || l.beauty > 0 || l.splash.on, needsObjects(l),
      l.beautyEyes + l.beautyTeeth + l.beautyUnder > 0);
    if (session.aiLevel > before) setAiTick((x) => x + 1);
    setPreviewFmt(l.formats[0] ?? null);
    setGroup(lutById(l.lut)?.group ?? "Looks");
    setUsedStyle(st.id);
    flash(`Estilo «${st.name}»`);
  };

  const set = (patch: Partial<Look>) => setLook((l) => ({ ...l, ...patch }));
  const setSplash = (patch: Partial<Splash>) => setLook((l) => ({ ...l, splash: { ...l.splash, on: true, ...patch } }));
  const [dropper, setDropper] = useState(false);
  const [net, setNet] = useState<string | null>(look.formats.length ? null : "Instagram");
  const setLight = (k: keyof Light, v: number) => setLook((l) => ({ ...l, light: { ...l.light, [k]: v } }));
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 1800); };

  // --- pasar de filtro con el dedo
  const step = (dir: number) => {
    const ids = [null, ...list.map((l) => l.id)];
    const cur = tab === "bw" ? look.bwLut : look.lut;
    const i = Math.max(0, ids.indexOf(cur));
    const n = ids[(i + dir + ids.length) % ids.length];
    if (tab === "bw") set({ bwLut: n }); else set({ lut: n });
    flash(n ? lutById(n)!.name : "Sin filtro");
  };

  const st = guide?.stats;
  const others = session.photos.filter((p) => p.id !== guide?.id);

  return (
    <div class="screen editor">
      <div class="topbar">
        <button class="icon-btn" onClick={onBack} aria-label="Atrás">‹</button>
        <div class="title">Foto guía <span class="muted small">· se aplicará a {session.photos.length}</span></div>
        <button class={"icon-btn" + (compare !== "after" ? " active" : "")} aria-label="Comparar antes y después"
          onClick={() => setCompare(compare === "after" ? "curtain" : "after")}>◑</button>
      </div>

      <div class="stage" ref={host}
        onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={(e) => {
          const s = swipe.current; swipe.current = null;
          if (!s) return;
          const dx = e.clientX - s.x, dy = e.clientY - s.y;
          if (tab === "splash" && dropper && Math.abs(dx) + Math.abs(dy) < 12 && guide?.thumb && r.current) {
            const rect = (r.current.canvas as HTMLCanvasElement).getBoundingClientRect();
            const nx = (e.clientX - rect.left) / rect.width, ny = (e.clientY - rect.top) / rect.height;
            if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
            const c = fmt ? session.cropFor(guide, fmt) : { x: 0, y: 0, w: 1, h: 1 };
            const h = sampleHue(guide.thumb, c.x + nx * c.w, c.y + ny * c.h);
            if (h === null) { flash("Ahí no hay color: toca una zona con color"); return; }
            setSplash({ hues: [...look.splash.hues.filter((x) => hueDist(x, h) > 12), h].slice(-4) });
            setDropper(false);
            flash(`Se queda en color: ${hueName(h).toLowerCase()}`);
            return;
          }
          if (tab !== "filters" && tab !== "bw") return;
          if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
        }}>
        {!ready && <div class="stage-msg"><div class="spinner" /><p class="muted small">{status}</p></div>}
        {compare !== "after" && ready && (
          <div class="ba-pos"><CurtainOverlay before={beforeUrl} mode={compare} width={shown.w} height={shown.h} /></div>
        )}
      </div>

      {compare !== "after" && <CompareSwitch mode={compare} setMode={setCompare} />}

      {others.length > 0 && (
        <div class="guides">
          {session.photos.map((p) => (
            <button class={"g-thumb" + (p.id === guide?.id ? " on" : "")} onClick={() => { session.guideId = p.id; setGuide(p); }}>
              {p.thumbUrl ? <img src={p.thumbUrl} /> : <span>…</span>}
            </button>
          ))}
        </div>
      )}

      <div class="panel">
        {tab === "styles" && creator && (
          <>
            <p class="hint" style={{ marginTop: 0 }}>Responde y mira cómo queda. Lo demás (fondo, belleza, recorte…) se mantiene.</p>
            {(Object.keys(styles.SIMPLE_OPTIONS) as (keyof styles.Simple)[]).map((k) => (
              <>
                <div class="sub">{styles.SIMPLE_OPTIONS[k].label}</div>
                <div class="chips">
                  {styles.SIMPLE_OPTIONS[k].options.map(([v, label]) => (
                    <button class={"chip" + (simple[k] === v ? " on" : "")} onClick={() => answer(k, v as never)}>{label}</button>
                  ))}
                </div>
              </>
            ))}
            <div class="row" style={{ padding: "12px 16px 4px" }}>
              <button class="btn ghost sm" onClick={() => setCreator(false)}>Volver a los estilos</button>
              <button class="btn primary sm grow" onClick={() => { setNameInput(""); setSheet({ mode: "save" }); }}>Guardar este estilo</button>
            </div>
          </>
        )}
        {tab === "styles" && !creator && (
          <>
            <div class="luts">
              {styleList.map((st) => {
                const key = st.id + st.created;
                return (
                  <div class={"lut style" + (usedStyle === st.id ? " on" : "")}>
                    <button class="lut-img" onClick={() => applyStyle(st)}>
                      {styleThumbs[key] ? <img src={styleThumbs[key]} /> : <div class="spinner sm" />}
                    </button>
                    <span>{st.name}</span>
                    {!st.builtin && (
                      <button class="st-more" aria-label={`Opciones de ${st.name}`}
                        onClick={() => { setNameInput(st.name); setSheet({ mode: "edit", st }); }}>⋯</button>
                    )}
                  </div>
                );
              })}
            </div>
            <p class="hint">
              {usedStyle ? styles.describeStyle(look, (id) => lutById(id)?.name)
                : "Toca un estilo para aplicarlo a todas. Después puedes retocar lo que quieras."}
            </p>
            <div style={{ padding: "4px 16px" }}>
              <div class="row">
                <button class="btn primary sm grow" onClick={() => setCreator(true)}>✨ Crear mi estilo</button>
                <button class="btn sm grow" onClick={() => { setNameInput(""); setSheet({ mode: "save" }); }}>＋ Guardar lo que llevo</button>
              </div>
            </div>
          </>
        )}
        {tab === "filters" && (
          <>
            <div class="chips">
              {LUT_GROUPS.map((g) => <button class={"chip" + (g === group ? " on" : "")} onClick={() => setGroup(g)}>{g}</button>)}
            </div>
            <LutStrip list={list} current={look.lut} thumbs={thumbs} tab="filters" onPick={(id) => set({ lut: id })} />
            {look.lut && <Slider label="Intensidad" min={0} max={100} value={Math.round(look.lutAmount * 100)} onInput={(v) => set({ lutAmount: v / 100 })} />}
            <p class="hint">Desliza sobre la foto para pasar de filtro.</p>
          </>
        )}
        {tab === "bokeh" && (
          <>
            <div class="chips" style={{ paddingBottom: "6px" }}>
              <button class={"chip" + (look.speed === 0 ? " on" : "")} onClick={() => set({ speed: 0 })}>Desenfoque</button>
              <button class={"chip" + (look.speed > 0 ? " on" : "")} onClick={() => set({ speed: look.speed || 50, bokeh: 0 })}>Velocidad</button>
            </div>
          </>
        )}
        {tab === "bokeh" && look.speed > 0 && (
          <>
            <Slider label="Velocidad" min={1} max={100} value={look.speed} onInput={(v) => set({ speed: v })} />
            <div class="chips">
              {([[0, "→ Horizontal"], [30, "↗ Diagonal"], [90, "↑ Vertical"], [-30, "↘ Diagonal"]] as [number, string][]).map(([a, n]) => (
                <button class={"chip" + (look.speedAngle === a ? " on" : "")} onClick={() => set({ speedAngle: a })}>{n}</button>
              ))}
            </div>
            <p class="hint">El fondo se barre como en una foto de movimiento y la persona queda nítida. Solo en fotos con una persona clara.</p>
          </>
        )}
        {tab === "bokeh" && look.speed === 0 && (
          <>
            <div class="chips">
              <button class={"chip" + (look.bokeh === 0 ? " on" : "")} onClick={() => set({ bokeh: 0 })}>No</button>
              {BOKEH_LEVELS.map(([v, n]) => <button class={"chip" + (look.bokeh === v ? " on" : "")} onClick={() => set({ bokeh: v })}>{n}</button>)}
            </div>
            <Slider label="Desenfoque" min={0} max={100} value={look.bokeh} onInput={(v) => set({ bokeh: v })} />
            {st && !bokehEligible(st) && <p class="hint warn">En esta foto no se ve una persona clara: aquí no se desenfoca. Se aplicará en las que sí la tengan.</p>}
            {st && bokehEligible(st) && !guide?.person && <p class="hint warn">No se ha podido cargar la IA (¿sin conexión?). Prueba de nuevo con internet.</p>}
          </>
        )}
        {tab === "beauty" && (
          <>
            <Slider label="Piel" min={0} max={100} value={look.beauty} onInput={(v) => set({ beauty: v })} />
            <Slider label="Ojos" min={0} max={100} value={look.beautyEyes} onInput={(v) => set({ beautyEyes: v })} />
            <Slider label="Dientes" min={0} max={100} value={look.beautyTeeth} onInput={(v) => set({ beautyTeeth: v })} />
            <Slider label="Ojeras" min={0} max={100} value={look.beautyUnder} onInput={(v) => set({ beautyUnder: v })} />
            {st && beautyEligible(st) && guide && guide.portraitDone && !guide.face && (
              <p class="hint warn">No se han podido localizar los ojos y la boca en esta foto (¿sin conexión la primera vez?).</p>
            )}
            {st && !beautyEligible(st) && <p class="hint warn">No hay caras lo bastante grandes en esta foto. Se aplicará en los retratos.</p>}
            <p class="hint">Piel suavizada con su textura; ojos más limpios y con el iris más vivo; dientes sin amarillo; ojeras aclaradas con la luz del pómulo. Solo en caras de cierto tamaño.</p>
          </>
        )}
        {tab === "crop" && (
          <>
            <div class="row" style={{ padding: "0 16px" }}>
              <label class="switch grow">
                <input type="checkbox" checked={look.straighten} onChange={(e) => set({ straighten: (e.target as HTMLInputElement).checked })} />
                <span>Enderezar el horizonte{st?.tilt ? ` (esta foto: ${st.tilt.toFixed(1).replace(".", ",")}°)` : ""}</span>
              </label>
            </div>
            <div class="row" style={{ padding: "0 16px" }}>
              <label class="switch grow">
                <input type="checkbox" checked={look.aiResize} onChange={(e) => set({ aiResize: (e.target as HTMLInputElement).checked })} />
                <span>Tamaño exacto con IA si la foto se queda corta</span>
              </label>
            </div>
            <p class="hint" style={{ marginTop: 0 }}>¿Para qué las quieres? Se recortan a la medida exacta de cada sitio, siguiendo a las personas.</p>
            <div class="chips">
              <button class={"chip" + (net === null ? " on" : "")} onClick={() => setNet(null)}>Elegidos ({look.formats.length})</button>
              {NETWORKS.map((n) => (
                <button class={"chip" + (net === n ? " on" : "")} onClick={() => setNet(n)}>{n}</button>
              ))}
            </div>
            <div class="dests">
              {(net === null
                ? [...look.formats.map((id) => formatById(id)), ...(look.formats.length ? [] : [])]
                : FORMATS.filter((f) => f.net === net)
              ).map((f) => {
                const on = look.formats.includes(f.id);
                return (
                  <button class={"dest" + (on ? " on" : "") + (previewFmt === f.id ? " seen" : "")} onClick={() => {
                    const fs = on ? look.formats.filter((x) => x !== f.id) : [...look.formats, f.id];
                    set({ formats: fs });
                    setPreviewFmt(on ? fs[0] ?? null : f.id);
                  }}>
                    <span class="shape" style={{ aspectRatio: String(f.ratio), borderRadius: f.circle ? "50%" : "3px" }} />
                    <span class="grow">
                      <span class="d-name">{net === null ? f.use : f.name}</span>
                      <span class="d-size">{f.w} × {f.h} px{(() => {
                        if (!st || !guide) return "";
                        const c = session.cropFor(guide, f.id);
                        const short = c.w * st.width < f.w * 0.95 || c.h * st.height < f.h * 0.95;
                        return short ? (look.aiResize ? " · ✨ esta foto se amplía con IA" : " · esta foto sale más pequeña") : "";
                      })()}</span>
                    </span>
                    <span class="check">{on ? "✓" : ""}</span>
                  </button>
                );
              })}
              {net === null && look.formats.length === 0 && (
                <p class="hint">Ninguno elegido: se exportarán con su proporción original. Elige una red arriba.</p>
              )}
            </div>
            {look.formats.length > 1 && (
              <div class="chips">
                {look.formats.map((id) => <button class={"chip" + (previewFmt === id ? " on" : "")} onClick={() => setPreviewFmt(id)}>Ver {formatById(id).use}</button>)}
              </div>
            )}
          </>
        )}
        {tab === "splash" && (
          <>
            <p class="hint" style={{ marginTop: 0 }}>Lo que elijas se queda en color; el resto, en blanco y negro. Puedes combinar varios.</p>
            {(["Persona", "Objetos"] as const).map((grp) => (
              <>
                <div class="sub">{grp}</div>
                <div class="chips">
                  {ELEMENTS.filter((el) => el.group === grp).map((el) => {
                    const on = look.splash.parts.includes(el.id);
                    const here = !!guide?.masks[el.id];
                    return (
                      <button class={"chip" + (on ? " on" : "") + (here ? "" : " absent")}
                        onClick={() => setSplash({ parts: on ? look.splash.parts.filter((x) => x !== el.id) : [...look.splash.parts, el.id] })}>
                        {el.name}
                      </button>
                    );
                  })}
                </div>
              </>
            ))}
            <div class="sub">Colores</div>
            <div class="chips">
              <button class={"chip" + (dropper ? " on" : "")} onClick={() => setDropper(!dropper)}>💧 Tocar la foto</button>
              {HUES.map(([h, n, css]) => {
                const on = look.splash.hues.includes(h);
                return (
                  <button class={"chip" + (on ? " on" : "")} onClick={() => setSplash({ hues: on ? look.splash.hues.filter((x) => x !== h) : [...look.splash.hues, h].slice(-4) })}>
                    <span class="dot-c" style={{ background: css }} />{n}
                  </button>
                );
              })}
              {look.splash.hues.filter((h) => !HUES.some((x) => x[0] === h)).map((h) => (
                <button class="chip on" onClick={() => setSplash({ hues: look.splash.hues.filter((x) => x !== h) })}>
                  <span class="dot-c" style={{ background: `hsl(${h} 75% 50%)` }} />{hueName(h)} ✕
                </button>
              ))}
            </div>
            {look.splash.hues.length > 0 && <Slider label="Margen" min={10} max={60} value={look.splash.tolerance} onInput={(v) => setSplash({ tolerance: v })} />}
            <p class="hint">
              {dropper ? "Toca en la foto el color que quieres conservar."
                : !look.splash.hues.length && !look.splash.parts.length ? "Elige elementos, colores o las dos cosas (p. ej. Ropa + Rojo: solo la prenda roja)."
                : "En color: " + [look.splash.parts.map(elementName).join(", ").toLowerCase(), look.splash.hues.map((h) => hueName(h).toLowerCase()).join(" o ")].filter(Boolean).join(" · solo si es ") + "."}
            </p>
            <p class="hint">Los elementos atenuados no aparecen en esta foto, pero sí pueden estar en otras.</p>
            {guide?.stats && !guide.person && <p class="hint warn">No se ha podido cargar la IA (¿sin conexión?): sin ella solo funcionan los colores.</p>}
            <div class="row" style={{ padding: "0 16px" }}>
              <label class="switch grow"><input type="checkbox" checked={look.splash.on} onChange={(e) => setSplash({ on: (e.target as HTMLInputElement).checked })} /><span>Color selectivo activado</span></label>
            </div>
          </>
        )}
        {tab === "bw" && (
          <>
            <div class="row" style={{ padding: "0 16px" }}>
              <label class="switch grow">
                <input type="checkbox" checked={look.alsoBW} onChange={(e) => set({ alsoBW: (e.target as HTMLInputElement).checked })} />
                <span>Exportar también en blanco y negro</span>
              </label>
            </div>
            {look.alsoBW && <LutStrip list={list} current={look.bwLut} thumbs={thumbs} tab="bw" noneLabel="Neutro" onPick={(id) => set({ bwLut: id })} />}
          </>
        )}
        {tab === "light" && (
          <div class="sliders">
            <Slider label="Exposición" min={-200} max={200} value={Math.round(look.light.exposure * 100)} fmt={(v) => (v / 100).toFixed(1)} onInput={(v) => setLight("exposure", v / 100)} />
            <Slider label="Contraste" min={-100} max={100} value={look.light.contrast} onInput={(v) => setLight("contrast", v)} />
            <Slider label="Luces" min={-100} max={100} value={look.light.highlights} onInput={(v) => setLight("highlights", v)} />
            <Slider label="Sombras" min={-100} max={100} value={look.light.shadows} onInput={(v) => setLight("shadows", v)} />
            <Slider label="Temperatura" min={-100} max={100} value={look.light.warmth} onInput={(v) => setLight("warmth", v)} />
            <Slider label="Tinte" min={-100} max={100} value={look.light.tint} onInput={(v) => setLight("tint", v)} />
            <Slider label="Saturación" min={-100} max={100} value={look.light.saturation} onInput={(v) => setLight("saturation", v)} />
            <Slider label="Grano" min={0} max={100} value={look.grain} onInput={(v) => set({ grain: v })} />
            <Slider label="Viñeta" min={0} max={100} value={look.vignette} onInput={(v) => set({ vignette: v })} />
            <div class="row" style={{ padding: "4px 16px" }}>
              <button class="btn ghost sm" onClick={() => set({ light: { ...ZERO_LIGHT }, grain: 0, vignette: 0 })}>Restablecer</button>
              <label class="switch grow"><input type="checkbox" checked={viewBW} onChange={(e) => setViewBW((e.target as HTMLInputElement).checked)} /><span>Ver en B/N</span></label>
            </div>
            <p class="hint">Son ajustes sobre lo automático: cada foto parte de su propia corrección.</p>
          </div>
        )}
      </div>

      <div class="apply">
        <button class="btn primary block" disabled={!ready} onClick={onDone}>
          Aplicar a {session.photos.length === 1 ? "la foto" : `las ${session.photos.length} fotos`} →
        </button>
      </div>

      <div class="tabs">
        {tabs.map((t) => (
          <button class={"tab" + (t.key === tab ? " on" : "")} onClick={() => setTab(t.key)}>
            <span class="t-ico">{t.ico}</span>{t.name}
          </button>
        ))}
      </div>
      {sheet && (
        <div class="sheet-bg" onClick={() => setSheet(null)}>
          <div class="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>{sheet.mode === "save" ? "Guardar estilo" : "Tu estilo"}</h2>
            <p class="muted small" style={{ margin: "0 0 10px" }}>
              {sheet.mode === "save"
                ? "Se guarda lo que has hecho (filtro, luz, fondo, belleza, color selectivo, B/N y destinos) para usarlo con otras fotos."
                : styles.describeStyle(sheet.st.look, (id) => lutById(id)?.name)}
            </p>
            <div style={{ padding: "0 16px 12px" }}>
              <input class="field" placeholder="Nombre (p. ej. Boda cálida)" value={nameInput} maxLength={40}
                onInput={(e) => setNameInput((e.target as HTMLInputElement).value)} />
            </div>
            {sheet.mode === "save" ? (
              <button class="btn primary" disabled={!nameInput.trim()} onClick={async () => {
                const st = await styles.saveStyle(nameInput, look);
                await loadStyles();
                setUsedStyle(st.id);
                setSheet(null);
                setCreator(false);
                flash(`Guardado: «${st.name}»`);
              }}>Guardar</button>
            ) : (
              <div style={{ display: "grid", gap: "10px" }}>
                <button class="btn primary" disabled={!nameInput.trim()} onClick={async () => {
                  await styles.renameStyle(sheet.st.id, nameInput);
                  await loadStyles();
                  setSheet(null);
                }}>Cambiar el nombre</button>
                <button class="btn" onClick={async () => {
                  await styles.saveStyle(sheet.st.name, look);
                  await loadStyles();
                  setStyleThumbs({});
                  setSheet(null);
                  flash(`«${sheet.st.name}» actualizado con la edición actual`);
                }}>Actualizar con la edición actual</button>
                <button class="btn ghost" onClick={async () => {
                  if (!confirm(`¿Borrar el estilo «${sheet.st.name}»?`)) return;
                  await styles.deleteStyle(sheet.st.id);
                  await loadStyles();
                  setSheet(null);
                }}>Borrar el estilo</button>
              </div>
            )}
          </div>
        </div>
      )}
      {toast && <div class="toast">{toast}</div>}
    </div>
  );
}

function LutStrip({ list, current, thumbs, tab, onPick, noneLabel = "Ninguno" }: {
  list: { id: string; name: string }[]; current: string | null; thumbs: Record<string, string>; tab: string;
  onPick: (id: string | null) => void; noneLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector(".lut.on")?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [current]);
  return (
    <div class="luts" ref={ref}>
      <button class={"lut" + (current === null ? " on" : "")} onClick={() => onPick(null)}>
        <div class="lut-img">{thumbs["__none"] && <img src={thumbs["__none"]} />}</div>
        <span>{noneLabel}</span>
      </button>
      {list.map((l) => (
        <button class={"lut" + (current === l.id ? " on" : "")} onClick={() => onPick(l.id)}>
          <div class="lut-img">{thumbs[l.id + tab] ? <img src={thumbs[l.id + tab]} /> : <div class="spinner sm" />}</div>
          <span>{l.name}</span>
        </button>
      ))}
    </div>
  );
}

export function Slider({ label, min, max, value, onInput, fmt }: {
  label: string; min: number; max: number; value: number; onInput: (v: number) => void; fmt?: (v: number) => string;
}) {
  return (
    <div class="slider">
      <label>{label}</label>
      <input type="range" min={min} max={max} value={value}
        onInput={(e) => onInput(Number((e.target as HTMLInputElement).value))}
        onDblClick={() => onInput(min < 0 ? 0 : min)} />
      <output>{fmt ? fmt(value) : value}</output>
    </div>
  );
}
