// Revelar (tipo Lightroom): una foto, ajustes no destructivos, historial, copiar/pegar, presets, recorte,
// histograma, antes/después y exportar. Los ajustes se guardan solos en el catálogo.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  COLOR_LUTS, LUT_GROUPS, decode, detectTilt, lutById, pixelsOf, pro, shrink, type Pixels, type PhotoStats,
} from "@phootflow/core";
import { Icon } from "@phootflow/core/ui";
import { CurveEditor } from "./CurveEditor";
import { ExportSheet } from "./ExportSheet";
import { PresetSheet } from "./PresetSheet";
import { Group, Histogram, PSlider, Sheet, TRACKS } from "./ui";
import { prepareLut, previews, thumbFrom } from "./work";
import type { Clip } from "./Library";

type Tab = "profile" | "light" | "color" | "curve" | "mix" | "grade" | "detail" | "effects" | "crop";
const TABS: [Tab, string, string][] = [
  ["light", "light", "Luz"], ["color", "palette", "Color"], ["curve", "styles", "Curva"], ["mix", "filters", "Mezcla"],
  ["grade", "color", "Gradación"], ["effects", "beauty", "Efectos"], ["detail", "zoom", "Detalle"], ["profile", "bw", "Perfil"],
  ["crop", "crop", "Recorte"],
];
type Key = keyof pro.Dev;
const D = pro.DEFAULT_DEV;
const WORK_SIDE = 2560;

export function Develop({ id, onBack, clip, setClip }: {
  id: string; onBack: () => void; clip: Clip | null; setClip: (c: Clip) => void;
}) {
  const [photo, setPhoto] = useState<pro.CatalogPhoto | null>(null);
  const [dev, setDev] = useState<pro.Dev>(pro.cloneDev(D));
  const [hist, setHist] = useState<{ label: string; dev: pro.Dev }[]>([]);
  const [idx, setIdx] = useState(0);
  const [tab, setTab] = useState<Tab>("light");
  const [ready, setReady] = useState(false);
  const [before, setBefore] = useState(false);
  const [histo, setHisto] = useState<Float32Array[] | null>(null);
  const [showHisto, setShowHisto] = useState(true);
  const [sheet, setSheet] = useState<"" | "presets" | "export" | "copy" | "history">("");
  const [toast, setToast] = useState("");
  const [shown, setShown] = useState({ w: 0, h: 0 });
  const r = useRef<pro.ProRenderer | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const work = useRef<Pixels | null>(null);
  const devRef = useRef(dev);
  devRef.current = dev;
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 1600); };

  // ---- abrir la foto
  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await pro.catalog.getPhoto(id);
      const blob = await pro.catalog.original(id);
      if (!p || !blob || !alive) return;
      setPhoto(p);
      setDev(p.dev);
      setHist([{ label: "Abrir", dev: pro.cloneDev(p.dev) }]);
      setIdx(0);
      r.current ??= new pro.ProRenderer();
      const c = r.current.canvas as HTMLCanvasElement;
      if (host.current && !host.current.contains(c)) host.current.appendChild(c);
      work.current = await decode(blob, Math.min(WORK_SIDE, r.current.maxSize));
      if (!alive) return;
      r.current.setSource(work.current as unknown as HTMLCanvasElement);
      setReady(true);
    })();
    return () => { alive = false; };
  }, [id]);

  // ---- guardar al salir (ajustes + miniatura revelada)
  const save = async (withThumb: boolean) => {
    if (!photo) return;
    const d = devRef.current;
    const patch: Partial<pro.CatalogPhoto> = { dev: d, touched: pro.changedGroups(d).length > 0, edited: Date.now() };
    if (withThumb && work.current) patch.thumb = await thumbFrom(work.current, d);
    await pro.catalog.updatePhoto(photo.id, patch);
  };
  const saveTimer = useRef<number>(0);
  const back = async () => { clearTimeout(saveTimer.current); await save(true); onBack(); };

  // ---- revelar en vivo
  const frame = useRef(0);
  const histTimer = useRef<number>(0);
  useEffect(() => {
    if (!ready || !r.current || !work.current) return;
    cancelAnimationFrame(frame.current);
    let alive = true;
    frame.current = requestAnimationFrame(async () => {
      const R = r.current!, img = work.current!, el = host.current!;
      await prepareLut(R, dev);
      if (!alive) return;
      const cropping = tab === "crop";
      const o = cropping ? pro.outputSize({ ...dev, crop: { x: 0, y: 0, w: 1, h: 1 } }, img.width, img.height) : pro.outputSize(dev, img.width, img.height);
      const ar = o.width / o.height;
      const pad = cropping ? 36 : 16;
      let w = el.clientWidth - pad, h = w / ar;
      if (h > el.clientHeight - pad) { h = el.clientHeight - pad; w = h * ar; }
      const c = R.canvas as HTMLCanvasElement;
      c.style.width = `${w}px`; c.style.height = `${h}px`;
      setShown((s) => (Math.abs(s.w - w) > 0.5 || Math.abs(s.h - h) > 0.5 ? { w, h } : s));
      const W = Math.round(Math.min(o.width, w * Math.min(2, devicePixelRatio)));
      R.render(dev, { width: W, height: Math.max(1, Math.round(W / ar)), original: before, noCrop: cropping });
      clearTimeout(histTimer.current);
      histTimer.current = window.setTimeout(() => setHisto(R.histogram()), 120);
    });
    return () => { alive = false; };
  }, [dev, ready, before, tab]);

  // ---- cambios e historial
  const set = (patch: Partial<pro.Dev>) => setDev((d) => ({ ...d, ...patch }));
  const commit = (label: string, next?: pro.Dev) => {
    const d = next ?? devRef.current;
    if (next) setDev(next);
    setHist((h) => [...h.slice(0, idx + 1), { label, dev: pro.cloneDev(d) }].slice(-120));
    setIdx((i) => Math.min(i + 1, 119));
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void save(false), 700);
  };
  const go = (i: number) => {
    if (i < 0 || i >= hist.length) return;
    setIdx(i);
    setDev(pro.cloneDev(hist[i].dev));
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void save(false), 700);
  };

  const slider = (k: Key, label: string, o: { min?: number; max?: number; step?: number; track?: string; fmt?: (v: number) => string } = {}) => (
    <PSlider label={label} value={dev[k] as number} def={D[k] as number} {...o}
      onInput={(v) => set({ [k]: v } as Partial<pro.Dev>)} onCommit={commit} />
  );

  const stats = photo?.stats as PhotoStats | null;
  const auto = () => {
    if (!stats) return;
    commit("Auto", pro.autoDev(stats, devRef.current));
    flash("Ajuste automático");
  };

  return (
    <div class="screen develop">
      <div class="topbar">
        <button class="icon-btn" onClick={back} aria-label="Volver a la biblioteca"><Icon name="back" /></button>
        <div class="title">
          <span class="ellipsis">{photo?.name ?? "…"}</span>
          <span class="sub-t">{photo ? `${photo.width} × ${photo.height}` : ""}</span>
        </div>
        <button class="icon-btn plain" disabled={idx <= 0} onClick={() => go(idx - 1)} aria-label="Deshacer"><Icon name="back" size={18} /></button>
        <button class="icon-btn plain" disabled={idx >= hist.length - 1} onClick={() => go(idx + 1)} aria-label="Rehacer"><Icon name="forward" size={18} /></button>
        <button class="btn primary sm" disabled={!ready} onClick={() => setSheet("export")}>Exportar</button>
      </div>

      <div class="stage" ref={host}>
        {!ready && <div class="stage-msg"><div class="spinner" /></div>}
        {ready && tab === "crop" && shown.w > 0 && (
          <CropBox dev={dev} w={shown.w} h={shown.h} imgW={work.current!.width} imgH={work.current!.height}
            onInput={(crop) => set({ crop })} onCommit={() => commit("Recorte")} />
        )}
        {showHisto && ready && tab !== "crop" && <div class="histo-wrap" onClick={() => setShowHisto(false)}><Histogram data={histo} /></div>}
        {!showHisto && ready && tab !== "crop" && <button class="histo-btn" onClick={() => setShowHisto(true)} aria-label="Mostrar histograma"><Icon name="carousel" size={16} /></button>}
        {ready && tab !== "crop" && (
          <button class={"before-btn" + (before ? " on" : "")} aria-label="Mantén para ver el original"
            onPointerDown={() => setBefore(true)} onPointerUp={() => setBefore(false)} onPointerLeave={() => setBefore(false)}>
            <Icon name="compare" size={18} />{before ? "Original" : "Antes"}
          </button>
        )}
      </div>

      <div class="dev-actions">
        <button class="chip" onClick={auto} disabled={!stats}><Icon name="wand" size={16} />Auto</button>
        <button class="chip" onClick={() => setSheet("presets")}><Icon name="styles" size={16} />Presets</button>
        <button class="chip" onClick={() => setSheet("copy")}><Icon name="edited" size={16} />Copiar</button>
        <button class="chip" disabled={!clip} onClick={() => clip && commit("Pegar ajustes", pro.pasteDev(devRef.current, clip.dev, clip.groups))}>
          <Icon name="layers" size={16} />Pegar</button>
        <button class="chip" onClick={() => setSheet("history")}>Historial · {idx}</button>
        <button class="chip" onClick={() => commit("Restablecer", { ...pro.cloneDev(D), wbR: 1, wbB: 1 })}>Restablecer</button>
        {photo && <Rating photo={photo} onChange={(p) => { setPhoto(p); void pro.catalog.updatePhoto(p.id, { rating: p.rating, flag: p.flag }); }} />}
      </div>

      <div class="panel dev-panel">
        {tab === "light" && (
          <>
            {slider("exposure", "Exposición", { min: -5, max: 5, step: 0.05, track: TRACKS.exposure, fmt: (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)} EV` })}
            {slider("contrast", "Contraste")}
            {slider("highlights", "Iluminaciones")}
            {slider("shadows", "Sombras")}
            {slider("whites", "Blancos")}
            {slider("blacks", "Negros")}
          </>
        )}
        {tab === "color" && (
          <>
            <div class="chips" style={{ padding: "0 16px 6px" }}>
              <button class="chip" disabled={!stats} onClick={() => {
                if (!stats) return;
                const a = pro.autoDev(stats);
                commit("Balance automático", { ...devRef.current, wbR: a.wbR, wbB: a.wbB, temp: 0, tint: 0 });
              }}>Balance automático</button>
              <button class="chip" onClick={() => commit("Balance como se tomó", { ...devRef.current, wbR: 1, wbB: 1, temp: 0, tint: 0 })}>Como se tomó</button>
            </div>
            {slider("temp", "Temperatura", { track: TRACKS.temp })}
            {slider("tint", "Matiz", { track: TRACKS.tint })}
            {slider("vibrance", "Intensidad", { track: TRACKS.vib })}
            {slider("saturation", "Saturación", { track: TRACKS.sat })}
          </>
        )}
        {tab === "curve" && <CurveEditor curves={dev.curves} onInput={(curves) => set({ curves })} onCommit={commit} />}
        {tab === "mix" && <MixPanel dev={dev} set={set} commit={commit} />}
        {tab === "grade" && <GradePanel dev={dev} set={set} commit={commit} />}
        {tab === "effects" && (
          <>
            <Group title="Presencia">
              {slider("texture", "Textura")}
              {slider("clarity", "Claridad")}
              {slider("dehaze", "Neblina")}
            </Group>
            <Group title="Viñeta">
              {slider("vignette", "Cantidad")}
              {slider("vignetteMid", "Punto medio", { min: 0, max: 100 })}
            </Group>
            <Group title="Grano">
              {slider("grain", "Cantidad", { min: 0, max: 100 })}
              {slider("grainSize", "Tamaño", { min: 0, max: 100 })}
            </Group>
          </>
        )}
        {tab === "detail" && (
          <>
            <Group title="Enfoque">
              {slider("sharpen", "Cantidad", { min: 0, max: 150 })}
              {slider("sharpenMask", "Solo en bordes", { min: 0, max: 100 })}
            </Group>
            <Group title="Reducción de ruido">
              {slider("noise", "Luminancia", { min: 0, max: 100 })}
              {slider("colorNoise", "Color", { min: 0, max: 100 })}
            </Group>
            <p class="hint">Para ver bien el detalle, amplía la foto con dos dedos o exporta a tamaño completo.</p>
          </>
        )}
        {tab === "profile" && <ProfilePanel dev={dev} set={set} commit={commit} work={work.current} />}
        {tab === "crop" && work.current && (
          <CropPanel dev={dev} imgW={work.current.width} imgH={work.current.height} commit={commit} set={set} work={work.current} />
        )}
      </div>

      <div class="tabs">
        {TABS.map(([k, ico, name]) => (
          <button class={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}><Icon name={ico} size={20} />{name}</button>
        ))}
      </div>

      {sheet === "presets" && (
        <PresetSheet work={work.current} base={dev} onClose={() => setSheet("")}
          onPick={(p) => { commit(`Preset: ${p.name}`, pro.applyPreset(devRef.current, p)); flash(p.name); }}
          onSaveCurrent={async (name) => {
            const d = pro.cloneDev(devRef.current);
            const keep = pro.GROUPS.filter((g) => g.id !== "geometry").flatMap((g) => g.keys).filter((k) => k !== "exposure" && k !== "wbR" && k !== "wbB");
            const partial = Object.fromEntries(keep.map((k) => [k, d[k]])) as Partial<pro.Dev>;
            await pro.catalog.savePreset({ id: pro.catalog.newId("p"), name, group: "Tuyos", dev: partial });
            flash(`Guardado: ${name}`);
          }} />
      )}
      {sheet === "export" && photo && <ExportSheet photos={[photo]} devOf={() => devRef.current} onClose={() => setSheet("")} />}
      {sheet === "copy" && <CopySheet dev={dev} onClose={() => setSheet("")} onCopy={(groups) => { setClip({ dev: pro.cloneDev(dev), groups }); setSheet(""); flash("Ajustes copiados"); }} />}
      {sheet === "history" && (
        <Sheet title="Historial" onClose={() => setSheet("")}>
          <div class="hist-list">
            {hist.map((h, i) => (
              <button class={"hist-row" + (i === idx ? " on" : "") + (i > idx ? " future" : "")} onClick={() => go(i)}>
                <span>{h.label}</span><span class="muted small">{i}</span>
              </button>
            )).reverse()}
          </div>
        </Sheet>
      )}
      {toast && <div class="toast">{toast}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ valoración
function Rating({ photo, onChange }: { photo: pro.CatalogPhoto; onChange: (p: pro.CatalogPhoto) => void }) {
  return (
    <span class="rating">
      <button class={"chip" + (photo.flag === 1 ? " on" : "")} aria-label="Elegida" onClick={() => onChange({ ...photo, flag: photo.flag === 1 ? 0 : 1 })}>
        <Icon name="check" size={15} /></button>
      <button class={"chip" + (photo.flag === -1 ? " on" : "")} aria-label="Rechazada" onClick={() => onChange({ ...photo, flag: photo.flag === -1 ? 0 : -1 })}>
        <Icon name="close" size={15} /></button>
      {[1, 2, 3, 4, 5].map((n) => (
        <button class={"star" + (photo.rating >= n ? " on" : "")} aria-label={`${n} estrellas`} onClick={() => onChange({ ...photo, rating: photo.rating === n ? 0 : n })}>★</button>
      ))}
    </span>
  );
}

// ------------------------------------------------------------------ mezcla de color
function MixPanel({ dev, set, commit }: { dev: pro.Dev; set: (p: Partial<pro.Dev>) => void; commit: (l: string) => void }) {
  const [band, setBand] = useState(0);
  const b = dev.hsl[band];
  const put = (k: keyof pro.Hsl, v: number) => set({ hsl: dev.hsl.map((x, i) => (i === band ? { ...x, [k]: v } : x)) });
  const hue = pro.BAND_HUES[band];
  return (
    <>
      <div class="bands">
        {pro.BANDS.map((n, i) => (
          <button class={"band" + (band === i ? " on" : "") + (dev.hsl[i].h || dev.hsl[i].s || dev.hsl[i].l ? " used" : "")}
            style={{ background: pro.BAND_CSS[i] }} aria-label={n} onClick={() => setBand(i)} />
        ))}
      </div>
      <p class="band-name">{pro.BANDS[band]}</p>
      <PSlider label="Tono" value={b.h} onInput={(v) => put("h", v)} onCommit={() => commit(`Tono ${pro.BANDS[band].toLowerCase()}`)}
        track={`linear-gradient(90deg, hsl(${hue - 30} 80% 50%), hsl(${hue} 80% 50%), hsl(${hue + 30} 80% 50%))`} />
      <PSlider label="Saturación" value={b.s} onInput={(v) => put("s", v)} onCommit={() => commit(`Saturación ${pro.BANDS[band].toLowerCase()}`)}
        track={`linear-gradient(90deg, hsl(${hue} 0% 50%), hsl(${hue} 90% 50%))`} />
      <PSlider label="Luminancia" value={b.l} onInput={(v) => put("l", v)} onCommit={() => commit(`Luminancia ${pro.BANDS[band].toLowerCase()}`)}
        track={`linear-gradient(90deg, hsl(${hue} 70% 15%), hsl(${hue} 70% 50%), hsl(${hue} 70% 85%))`} />
      <div class="chips" style={{ paddingTop: "6px" }}>
        <button class="chip" onClick={() => { set({ hsl: dev.hsl.map((x, i) => (i === band ? { h: 0, s: 0, l: 0 } : x)) }); commit("Restablecer color"); }}>Restablecer {pro.BANDS[band].toLowerCase()}</button>
        <button class="chip" onClick={() => { set({ hsl: pro.DEFAULT_DEV.hsl.map((x) => ({ ...x })) }); commit("Restablecer mezcla"); }}>Restablecer todo</button>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ gradación de color
type Zone = "shadows" | "mid" | "highlights" | "global";
const ZONES: [Zone, string][] = [["shadows", "Sombras"], ["mid", "Medios tonos"], ["highlights", "Iluminaciones"], ["global", "Global"]];

function GradePanel({ dev, set, commit }: { dev: pro.Dev; set: (p: Partial<pro.Dev>) => void; commit: (l: string) => void }) {
  const [zone, setZone] = useState<Zone>("shadows");
  const g = dev.grade[zone];
  const put = (k: keyof pro.Grade, v: number) => set({ grade: { ...dev.grade, [zone]: { ...g, [k]: v } } });
  const name = ZONES.find((z) => z[0] === zone)![1];
  return (
    <>
      <div class="chips" style={{ paddingBottom: "6px" }}>
        {ZONES.map(([z, n]) => (
          <button class={"chip" + (zone === z ? " on" : "")} onClick={() => setZone(z)}>
            <span class="dot-c" style={{ background: dev.grade[z].sat ? `hsl(${dev.grade[z].hue} 80% 55%)` : "transparent" }} />{n}
          </button>
        ))}
      </div>
      <PSlider label="Tono" value={g.hue} min={0} max={360} def={0} fmt={(v) => `${Math.round(v)}°`} track={TRACKS.hue}
        onInput={(v) => put("hue", v)} onCommit={() => commit(`Gradación ${name.toLowerCase()}`)} />
      <PSlider label="Saturación" value={g.sat} min={0} max={100} def={0}
        track={`linear-gradient(90deg, #8a8a8a, hsl(${g.hue} 85% 55%))`} onInput={(v) => put("sat", v)} onCommit={() => commit(`Gradación ${name.toLowerCase()}`)} />
      <PSlider label="Luminancia" value={g.lum} onInput={(v) => put("lum", v)} onCommit={() => commit(`Gradación ${name.toLowerCase()}`)} />
      <Group title="Reparto">
        <PSlider label="Fusión" value={dev.grade.blending} min={0} max={100} def={50}
          onInput={(v) => set({ grade: { ...dev.grade, blending: v } })} onCommit={() => commit("Fusión")} />
        <PSlider label="Equilibrio" value={dev.grade.balance}
          onInput={(v) => set({ grade: { ...dev.grade, balance: v } })} onCommit={() => commit("Equilibrio")} />
      </Group>
    </>
  );
}

// ------------------------------------------------------------------ perfil (LUT) y B/N
function ProfilePanel({ dev, set, commit, work }: { dev: pro.Dev; set: (p: Partial<pro.Dev>) => void; commit: (l: string, d?: pro.Dev) => void; work: Pixels | null }) {
  const [group, setGroup] = useState(() => (dev.lut ? lutById(dev.lut)?.group : null) ?? LUT_GROUPS[1] ?? LUT_GROUPS[0]);
  const list = useMemo(() => COLOR_LUTS.filter((l) => (group === "Looks" ? false : l.group === group)), [group]);
  const [thumbs, setThumbs] = useState<string[]>([]);
  useEffect(() => {
    if (!work) return;
    let alive = true;
    const base = { ...dev, lut: null, lutAmount: 100, bw: false };
    previews(work, [base, ...list.map((l) => ({ ...base, lut: l.id }))], 120).then((u) => {
      if (alive) setThumbs(u); else u.forEach((x) => URL.revokeObjectURL(x));
    });
    return () => { alive = false; };
  }, [group, work]);
  return (
    <>
      <div class="chips" style={{ paddingBottom: "6px" }}>
        <button class={"chip" + (!dev.bw ? " on" : "")} onClick={() => commit("Color", { ...dev, bw: false })}>Color</button>
        <button class={"chip" + (dev.bw ? " on" : "")} onClick={() => commit("Blanco y negro", { ...dev, bw: true })}>Blanco y negro</button>
      </div>
      {dev.bw && (
        <Group title="Mezcla de blanco y negro">
          {pro.BANDS.map((n, i) => (
            <PSlider label={n} value={dev.bwMix[i]} track={`linear-gradient(90deg, #111, ${pro.BAND_CSS[i]}, #eee)`}
              onInput={(v) => set({ bwMix: dev.bwMix.map((x, k) => (k === i ? v : x)) })} onCommit={() => commit(`B/N ${n.toLowerCase()}`)} />
          ))}
        </Group>
      )}
      <div class="sub">Perfiles creativos</div>
      <div class="chips">
        {LUT_GROUPS.filter((g) => g !== "Looks").map((g) => <button class={"chip" + (g === group ? " on" : "")} onClick={() => setGroup(g)}>{g}</button>)}
      </div>
      <div class="luts">
        <button class={"lut" + (!dev.lut ? " on" : "")} onClick={() => commit("Sin perfil", { ...dev, lut: null })}>
          <div class="lut-img">{thumbs[0] && <img src={thumbs[0]} alt="" />}</div><span>Ninguno</span>
        </button>
        {list.map((l, i) => (
          <button class={"lut" + (dev.lut === l.id ? " on" : "")} onClick={() => commit(`Perfil: ${l.name}`, { ...dev, lut: l.id })}>
            <div class="lut-img">{thumbs[i + 1] ? <img src={thumbs[i + 1]} alt="" /> : <div class="spinner sm" />}</div><span>{l.name}</span>
          </button>
        ))}
      </div>
      {dev.lut && (
        <PSlider label="Cantidad" value={dev.lutAmount} min={0} max={200} def={100}
          onInput={(v) => set({ lutAmount: v })} onCommit={() => commit("Cantidad del perfil")} />
      )}
    </>
  );
}

// ------------------------------------------------------------------ copiar ajustes
function CopySheet({ dev, onCopy, onClose }: { dev: pro.Dev; onCopy: (groups: string[]) => void; onClose: () => void }) {
  const changed = pro.changedGroups(dev);
  const [on, setOn] = useState<string[]>(changed.filter((g) => g !== "geometry"));
  return (
    <Sheet title="Copiar ajustes" onClose={onClose}>
      <p class="muted small" style={{ margin: "0 0 8px" }}>Elige qué copiar; luego «Pegar» en otra foto o en varias desde la biblioteca.</p>
      <div class="copy-list">
        {pro.GROUPS.map((g) => (
          <label class="switch">
            <input type="checkbox" checked={on.includes(g.id)} onChange={() => setOn(on.includes(g.id) ? on.filter((x) => x !== g.id) : [...on, g.id])} />
            <span class="grow">{g.name}</span>
            {changed.includes(g.id) && <span class="badge">editado</span>}
          </label>
        ))}
      </div>
      <button class="btn primary" disabled={!on.length} onClick={() => onCopy(on)}>Copiar {on.length} {on.length === 1 ? "grupo" : "grupos"}</button>
    </Sheet>
  );
}

// ------------------------------------------------------------------ recorte
function CropPanel({ dev, imgW, imgH, set, commit, work }: {
  dev: pro.Dev; imgW: number; imgH: number; set: (p: Partial<pro.Dev>) => void; commit: (l: string, d?: pro.Dev) => void; work: Pixels;
}) {
  const rs = pro.rotatedSize(imgW, imgH, dev.rotate);
  const aspect = (id: string, d = dev) => {
    const a = pro.ASPECTS.find((x) => x[0] === id)!;
    const s = pro.rotatedSize(imgW, imgH, d.rotate);
    const ratio = id === "original" ? s.w / s.h : a[2];
    return ratio ? pro.fitAspect(ratio, s.w, s.h, d.crop) : d.crop;
  };
  const rotate = (dir: 1 | -1) => {
    const r = (((dev.rotate + dir * 90) % 360) + 360) % 360 as 0 | 90 | 180 | 270;
    const d = { ...dev, rotate: r, crop: { x: 0, y: 0, w: 1, h: 1 } };
    commit("Girar", { ...d, crop: dev.aspect === "libre" ? d.crop : aspect(dev.aspect, d) });
  };
  return (
    <>
      <div class="chips" style={{ paddingBottom: "6px" }}>
        {pro.ASPECTS.map(([id, name]) => (
          <button class={"chip" + (dev.aspect === id ? " on" : "")} onClick={() => commit(`Proporción ${name}`, { ...dev, aspect: id, crop: aspect(id) })}>{name}</button>
        ))}
      </div>
      <PSlider label="Enderezar" value={dev.angle} min={-45} max={45} step={0.1} fmt={(v) => `${v.toFixed(1)}°`}
        onInput={(v) => set({ angle: v })} onCommit={() => commit("Enderezar")} />
      <div class="chips" style={{ paddingTop: "4px" }}>
        <button class="chip" onClick={() => {
          const px = pixelsOf(shrink(work, 256));
          const t = detectTilt(px.data, px.width, px.height);
          commit("Enderezar automático", { ...dev, angle: Math.round(-t * 10) / 10 });
        }}><Icon name="wand" size={15} />Nivelar</button>
        <button class="chip" onClick={() => rotate(-1)} aria-label="Girar a la izquierda"><Icon name="rotateL" size={16} />90°</button>
        <button class="chip" onClick={() => rotate(1)} aria-label="Girar a la derecha"><Icon name="rotateR" size={16} />90°</button>
        <button class={"chip" + (dev.flipH ? " on" : "")} onClick={() => commit("Voltear", { ...dev, flipH: !dev.flipH })}><Icon name="flip" size={16} />Voltear</button>
        <button class="chip" onClick={() => commit("Restablecer recorte", { ...dev, crop: { x: 0, y: 0, w: 1, h: 1 }, angle: 0, flipH: false, rotate: 0, aspect: "original" })}>Restablecer</button>
      </div>
      <p class="hint">{Math.round(rs.w * dev.crop.w)} × {Math.round(rs.h * dev.crop.h)} px de la foto de trabajo. Arrastra las esquinas o mueve el marco.</p>
    </>
  );
}

/** Marco de recorte sobre la foto entera: mover por dentro, cambiar el tamaño por las esquinas. */
function CropBox({ dev, w, h, imgW, imgH, onInput, onCommit }: {
  dev: pro.Dev; w: number; h: number; imgW: number; imgH: number; onInput: (c: pro.Dev["crop"]) => void; onCommit: () => void;
}) {
  const drag = useRef<{ mode: string; x: number; y: number; c: pro.Dev["crop"] } | null>(null);
  const rs = pro.rotatedSize(imgW, imgH, dev.rotate);
  const fixed = dev.aspect === "libre" ? null : dev.aspect === "original" ? rs.w / rs.h : pro.ASPECTS.find((a) => a[0] === dev.aspect)?.[2] ?? null;
  const c = dev.crop;
  const start = (mode: string) => (e: PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, c: { ...c } };
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / w, dy = (e.clientY - d.y) / h;
    let { x, y, w: cw, h: ch } = d.c;
    if (d.mode === "move") {
      x = Math.max(0, Math.min(1 - cw, x + dx));
      y = Math.max(0, Math.min(1 - ch, y + dy));
    } else {
      const left = d.mode.includes("l"), top = d.mode.includes("t");
      let nw = Math.max(0.05, cw + (left ? -dx : dx)), nh = Math.max(0.05, ch + (top ? -dy : dy));
      if (fixed) {
        // misma proporción en píxeles: nh = nw · W / (H · ratio)
        const k = rs.w / (rs.h * fixed);
        if (Math.abs(dx) > Math.abs(dy)) nh = nw * k; else nw = nh / k;
      }
      let nx = left ? x + cw - nw : x, ny = top ? y + ch - nh : y;
      if (nx < 0) { nw += nx; nx = 0; if (fixed) nh = nw * (rs.w / (rs.h * fixed)); }
      if (ny < 0) { nh += ny; ny = 0; if (fixed) nw = nh / (rs.w / (rs.h * fixed)); }
      if (nx + nw > 1) { nw = 1 - nx; if (fixed) nh = nw * (rs.w / (rs.h * fixed)); }
      if (ny + nh > 1) { nh = 1 - ny; if (fixed) nw = nh / (rs.w / (rs.h * fixed)); }
      if (left) nx = x + cw - nw;
      if (top) ny = y + ch - nh;
      x = nx; y = ny; cw = nw; ch = nh;
    }
    onInput({ x, y, w: cw, h: ch });
  };
  const end = () => { if (drag.current) { drag.current = null; onCommit(); } };
  return (
    <div class="crop-layer" style={{ width: `${w}px`, height: `${h}px` }} onPointerMove={move} onPointerUp={end}>
      <div class="crop-rect" style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` }}
        onPointerDown={start("move")}>
        <i class="third v1" /><i class="third v2" /><i class="third h1" /><i class="third h2" />
        {["tl", "tr", "bl", "br"].map((k) => <span class={`crop-h ${k}`} onPointerDown={start(k)} />)}
      </div>
    </div>
  );
}
