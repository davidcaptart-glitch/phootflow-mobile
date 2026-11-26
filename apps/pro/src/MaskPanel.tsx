// Máscaras de Revelar, con todo lo de Studio de escritorio: tipos manuales (radial, lineal, pincel, rango de luz,
// rango de color, punto de control), IA (persona, piel, pelo, ropa, fondo, partes de la cara, barba) y cielo;
// zonas que suman, restan o intersecan; invertir cada zona o la máscara entera; cantidad; activar, duplicar,
// renombrar y borrar; ver en magenta; y todos los ajustes locales (luz, color, presencia, curva por zonas,
// color por colores y por tonos). Las guías se arrastran sobre la foto (MaskGizmo).
import { useRef, useState } from "preact/hooks";
import { pro } from "@phootflow/core";
import { Icon } from "@phootflow/core/ui";
import { Group, PSlider, Sheet, TRACKS } from "./ui";

type M = pro.LocalMask;
type Z = pro.MaskZone;
const MK = pro.masks;

export interface MaskUi {
  sel: string | null;
  comp: number;           // 0 = la zona principal; 1.. = sus zonas
  show: boolean;          // ver en magenta
  erase: boolean;         // pincel: borrar
  dropper: boolean;       // rango de color: tocar la foto
}
export const NO_UI: MaskUi = { sel: null, comp: 0, show: false, erase: false, dropper: false };

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export function MaskPanel({ dev, ui, setUi, set, commit, note }: {
  dev: pro.Dev; ui: MaskUi; setUi: (u: Partial<MaskUi>) => void;
  set: (p: Partial<pro.Dev>) => void; commit: (label: string, d?: pro.Dev) => void; note: string;
}) {
  const [adding, setAdding] = useState<null | { mode: "new" | pro.ZoneMode }>(null);
  const [renaming, setRenaming] = useState(false);
  const [band, setBand] = useState(0);
  const masks = dev.masks;
  const m = masks.find((x) => x.id === ui.sel) ?? null;
  const zone: Z | null = m ? (ui.comp > 0 ? m.parts[ui.comp - 1] ?? m : m) : null;

  const withMasks = (f: (ms: M[]) => M[]) => ({ ...dev, masks: f(clone(masks)) });
  const editMask = (f: (x: M) => void) => withMasks((ms) => ms.map((x) => (x.id === ui.sel ? (f(x), x) : x)));
  const editZone = (f: (z: Z) => void) => editMask((x) => { const z = ui.comp > 0 ? x.parts[ui.comp - 1] : x; if (z) f(z); });
  const live = (d: pro.Dev) => set({ masks: d.masks });

  const add = (type: string) => {
    if (!adding) return;
    if (adding.mode === "new") {
      const nm = MK.newMask(type);
      commit(`Máscara: ${nm.name}`, { ...dev, masks: [...clone(masks), nm] });
      setUi({ sel: nm.id, comp: 0, show: true, erase: false, dropper: false });
    } else if (m) {
      const p = MK.newPart(type, adding.mode);
      commit(`${MK.COMBINE[adding.mode]}: ${p.name}`, editMask((x) => x.parts.push(p)));
      setUi({ comp: m.parts.length + 1, show: true });
    }
    setAdding(null);
  };

  const adj = (k: string) => m?.adj[k] ?? MK.NEUTRAL_ADJ[k] ?? 0;
  const adjSlider = ([k, label, min, max, step, neutral]: pro.masks.AdjDef, track?: string) => (
    <PSlider label={label} value={adj(k)} min={min} max={max} step={step} def={neutral} track={track}
      fmt={k === "exposure" ? (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)} EV` : k.endsWith("_hue") ? (v) => `${Math.round(v)}°` : undefined}
      onInput={(v) => { if (ui.show) setUi({ show: false }); live(editMask((x) => { x.adj[k] = v; })); }}
      onCommit={() => commit(`${m?.name}: ${label.toLowerCase()}`)} />
  );
  const param = ([k, label, min, max, step, neutral]: pro.masks.AdjDef) => (
    <PSlider label={label} value={Number(zone?.params[k] ?? neutral)} min={min} max={max} step={step} def={neutral}
      track={k === "hue" ? TRACKS.hue : undefined} fmt={k === "hue" ? (v) => `${Math.round(v)}°` : undefined}
      onInput={(v) => live(editZone((z) => { z.params[k] = v; }))} onCommit={() => commit(`${zone?.name}: ${label.toLowerCase()}`)} />
  );

  return (
    <>
      <div class="mask-strip">
        {masks.map((x, i) => (
          <button class={"mask-chip" + (x.id === ui.sel ? " on" : "") + (x.enabled === false ? " off" : "")}
            onClick={() => setUi({ sel: x.id, comp: 0, erase: false, dropper: false })}>
            <span class="mask-n">{i + 1}</span>{x.name}
          </button>
        ))}
        <button class="mask-chip add" onClick={() => setAdding({ mode: "new" })}><Icon name="plus" size={16} />Máscara</button>
      </div>

      {!m && (
        <p class="hint">Añade una máscara para ajustar solo una zona: la persona, la cara, el cielo, un degradado, lo que pintes…
          Cada una tiene su luz, su color y su detalle.</p>
      )}

      {m && zone && (
        <>
          <div class="mask-tools">
            <button class={"icon-btn" + (m.enabled !== false ? " active" : "")} aria-label="Activar o desactivar la máscara"
              onClick={() => commit(m.enabled === false ? "Activar máscara" : "Desactivar máscara", editMask((x) => { x.enabled = x.enabled === false; }))}>
              <Icon name="power" size={18} /></button>
            <button class={"icon-btn" + (ui.show ? " active" : "")} aria-label="Ver la máscara en magenta" onClick={() => setUi({ show: !ui.show })}>
              <Icon name="eye" size={18} /></button>
            <button class={"icon-btn" + (m.invert_all ? " active" : "")} aria-label="Invertir la máscara entera"
              onClick={() => commit("Invertir máscara", editMask((x) => { x.invert_all = !x.invert_all; }))}><Icon name="invert" size={18} /></button>
            <button class="icon-btn" aria-label="Duplicar la máscara" onClick={() => {
              const c = { ...clone(m), id: MK.newMask(m.type).id, name: `${m.name} (copia)` };
              const i = masks.findIndex((x) => x.id === m.id);
              commit("Duplicar máscara", { ...dev, masks: [...clone(masks).slice(0, i + 1), c, ...clone(masks).slice(i + 1)] });
              setUi({ sel: c.id, comp: 0 });
            }}><Icon name="duplicate" size={18} /></button>
            <button class="icon-btn" aria-label="Cambiar el nombre" onClick={() => setRenaming(true)}><Icon name="pencil" size={18} /></button>
            <button class="icon-btn" aria-label="Borrar la máscara" onClick={() => {
              commit("Borrar máscara", { ...dev, masks: clone(masks).filter((x) => x.id !== m.id) });
              setUi({ ...NO_UI });
            }}><Icon name="trash" size={18} /></button>
          </div>

          <div class="sub">Zonas de la máscara</div>
          <div class="chips">
            <button class={"chip" + (ui.comp === 0 ? " on" : "")} onClick={() => setUi({ comp: 0, erase: false, dropper: false })}>
              {m.invert ? "Invertida · " : ""}{MK.typeName(m.type)}</button>
            {m.parts.map((p, i) => (
              <button class={"chip" + (ui.comp === i + 1 ? " on" : "") + (p.enabled === false ? " absent" : "")}
                onClick={() => setUi({ comp: i + 1, erase: false, dropper: false })}>
                {p.mode === "sub" ? "−" : p.mode === "inter" ? "∩" : "+"} {p.invert ? "Invertida · " : ""}{p.name}
              </button>
            ))}
            <button class="chip" onClick={() => setAdding({ mode: "add" })}><Icon name="plus" size={15} />Sumar</button>
            <button class="chip" onClick={() => setAdding({ mode: "sub" })}><Icon name="minus" size={15} />Restar</button>
          </div>

          <div class="chips" style={{ paddingTop: "8px" }}>
            {ui.comp > 0 && (["add", "sub", "inter"] as pro.ZoneMode[]).map((md) => (
              <button class={"chip" + ((zone.mode ?? "add") === md ? " on" : "")}
                onClick={() => commit(`Zona: ${MK.COMBINE[md].toLowerCase()}`, editZone((z) => { z.mode = md; }))}>{MK.COMBINE[md]}</button>
            ))}
            <button class={"chip" + (zone.invert ? " on" : "")} onClick={() => commit("Invertir zona", editZone((z) => { z.invert = !z.invert; }))}>
              <Icon name="invert" size={15} />Invertir zona</button>
            {ui.comp > 0 && (
              <>
                <button class={"chip" + (zone.enabled !== false ? " on" : "")}
                  onClick={() => commit("Activar zona", editZone((z) => { z.enabled = z.enabled === false; }))}>Activa</button>
                <button class="chip" aria-label="Duplicar la zona" onClick={() => {
                  commit("Duplicar zona", editMask((x) => { x.parts.splice(ui.comp, 0, clone(x.parts[ui.comp - 1])); }));
                  setUi({ comp: ui.comp + 1 });
                }}><Icon name="duplicate" size={15} /></button>
                <button class="chip" aria-label="Quitar la zona" onClick={() => {
                  commit("Quitar zona", editMask((x) => { x.parts.splice(ui.comp - 1, 1); }));
                  setUi({ comp: 0 });
                }}><Icon name="trash" size={15} /></button>
              </>
            )}
          </div>

          <p class="hint">{MK.HINTS[zone.type] ?? "Zona detectada automáticamente con IA. Súmale o réstale otras para afinarla."}
            {note && (MK.needsAI(zone.type) || MK.needsFaces(zone.type)) ? ` ${note}` : ""}</p>

          {zone.type === "brush" && (
            <div class="chips" style={{ paddingBottom: "4px" }}>
              <button class={"chip" + (!ui.erase ? " on" : "")} onClick={() => setUi({ erase: false })}><Icon name="brush" size={15} />Pintar</button>
              <button class={"chip" + (ui.erase ? " on" : "")} onClick={() => setUi({ erase: true })}><Icon name="eraser" size={15} />Borrar</button>
              <button class="chip" onClick={() => commit("Vaciar pincel", editZone((z) => { z.params.strokes = []; }))}>Vaciar</button>
            </div>
          )}
          {zone.type === "color" && (
            <div class="chips" style={{ paddingBottom: "4px" }}>
              <button class={"chip" + (ui.dropper ? " on" : "")} onClick={() => setUi({ dropper: !ui.dropper })}><Icon name="dropper" size={15} />Tocar el color en la foto</button>
            </div>
          )}
          {(MK.ZONE_PARAMS[zone.type] ?? []).map(param)}
          <PSlider label="Cantidad de la máscara" value={m.amount} min={0} max={100} def={100}
            onInput={(v) => live(editMask((x) => { x.amount = v; }))} onCommit={() => commit("Cantidad de la máscara")} />

          <Group title="Luz y color">
            {MK.ADJ.map((a) => adjSlider(a, a[0] === "temp" ? TRACKS.temp : a[0] === "tint" ? TRACKS.tint : a[0] === "exposure" ? TRACKS.exposure : undefined))}
          </Group>
          <Group title="Presencia">{MK.PRESENCE.map((a) => adjSlider(a))}</Group>
          <Group title="Curva tonal">{MK.CURVE.map((a) => adjSlider(a))}</Group>
          <Group title="Color por colores">
            <div class="bands">
              {MK.HSL_BANDS.map(([b, n], i) => (
                <button class={"band" + (band === i ? " on" : "") + (["h", "s", "l"].some((q) => adj(`hsl_${b}_${q}`)) ? " used" : "")}
                  style={{ background: pro.BAND_CSS[i] }} aria-label={n} onClick={() => setBand(i)} />
              ))}
            </div>
            <p class="band-name">{MK.HSL_BANDS[band][1]}</p>
            {(["h", "s", "l"] as const).map((q) => adjSlider([`hsl_${MK.HSL_BANDS[band][0]}_${q}`, q === "h" ? "Tono" : q === "s" ? "Saturación" : "Luminancia", -100, 100, 1, 0]))}
          </Group>
          <Group title="Color por tonos">
            {MK.GRADE.map((a) => adjSlider(a, a[0].endsWith("_hue") ? TRACKS.hue : undefined))}
          </Group>
          <div class="chips" style={{ padding: "8px 16px 4px" }}>
            <button class="chip" onClick={() => commit("Restablecer ajustes de la máscara", editMask((x) => { x.adj = {}; }))}>Restablecer los ajustes de la máscara</button>
          </div>
        </>
      )}

      {adding && (
        <Sheet title={adding.mode === "new" ? "Nueva máscara" : adding.mode === "sub" ? "Restar una zona" : "Sumar una zona"} onClose={() => setAdding(null)}>
          {MK.TYPE_GROUPS.map(([title, items]) => (
            <>
              <div class="sub">{title}</div>
              <div class="type-grid">
                {Object.entries(items).map(([k, label]) => (
                  <button class="type-btn" onClick={() => add(k)}><Icon name={TYPE_ICON[k] ?? "mask"} size={20} /><span>{label}</span></button>
                ))}
              </div>
            </>
          ))}
          <p class="hint">Las de IA se calculan en el móvil; la primera vez se descarga el modelo.</p>
        </Sheet>
      )}
      {renaming && m && <RenameSheet name={m.name} onClose={() => setRenaming(false)} onSave={(n) => { commit("Renombrar máscara", editMask((x) => { x.name = n; })); setRenaming(false); }} />}
    </>
  );
}

const TYPE_ICON: Record<string, string> = {
  radial: "mask", linear: "carousel", brush: "brush", luma: "light", color: "color", point: "dropper",
  person: "people", face: "beauty", skin: "beauty", hair: "people", clothes: "people", background: "bokeh",
  eyes: "eye", iris: "eye", brows: "eye", lips: "beauty", teeth: "beauty", beard: "people", sky: "light",
};

function RenameSheet({ name, onSave, onClose }: { name: string; onSave: (n: string) => void; onClose: () => void }) {
  const [v, setV] = useState(name);
  return (
    <Sheet title="Nombre de la máscara" onClose={onClose}>
      <div style={{ padding: "0 16px 10px" }}>
        <input class="field" value={v} maxLength={40} onInput={(e) => setV((e.target as HTMLInputElement).value)} />
      </div>
      <button class="btn primary" disabled={!v.trim()} onClick={() => onSave(v.trim())}>Guardar</button>
    </Sheet>
  );
}

// ------------------------------------------------------------------ guías sobre la foto
/** Guías de la zona elegida, como en Studio: elipse de la radial, líneas de la lineal, punto de control; y el
 * pincel y el cuentagotas con el dedo. Todo en coordenadas de la foto original. */
export function MaskGizmo({ dev, ui, setUi, w, h, srcW, srcH, rgbAt, onLive, onCommit }: {
  dev: pro.Dev; ui: MaskUi; setUi: (u: Partial<MaskUi>) => void; w: number; h: number; srcW: number; srcH: number;
  rgbAt: (sx: number, sy: number) => [number, number, number] | null;
  onLive: (d: pro.Dev) => void; onCommit: (label: string) => void;
}) {
  const m = dev.masks.find((x) => x.id === ui.sel);
  const zone: Z | undefined = m ? (ui.comp > 0 ? m.parts[ui.comp - 1] : m) : undefined;
  const drag = useRef<{ what: string; start: Record<string, number> } | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const last = useRef<[number, number] | null>(null);
  if (!m || !zone) return null;
  const p = zone.params as Record<string, number>;
  const V = (sx: number, sy: number) => { const [u, v] = pro.fromSource(dev, sx, sy, srcW, srcH); return [u * w, v * h] as const; };
  const S = (e: PointerEvent) => {
    const r = layer.current!.getBoundingClientRect();
    return pro.toSource(dev, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, srcW, srcH);
  };
  const edit = (f: (z: Z) => void) => {
    const ms = clone(dev.masks).map((x) => {
      if (x.id !== m.id) return x;
      const z = ui.comp > 0 ? x.parts[ui.comp - 1] : x;
      if (z) f(z);
      return x;
    });
    onLive({ ...dev, masks: ms });
  };
  const long = Math.max(srcW, srcH);
  const brushR = ((p.size ?? 6) / 200);   // radio relativo al lado largo
  // px de la vista por unidad de la foto (para dibujar el pincel y el alcance)
  const scale = (() => { const [ax, ay] = V(0.5, 0.5), [bx, by] = V(0.5 + 0.1 * long / srcW, 0.5); return Math.hypot(bx - ax, by - ay) / (0.1 * long); })();

  const down = (what: string) => (e: PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const [sx, sy] = S(e);
    drag.current = { what, start: { sx, sy, ...p } };
    if (what === "paint") paint(e, true);
    if (what === "tap") tap(sx, sy);
  };
  const paint = (e: PointerEvent, first = false) => {
    const [sx, sy] = S(e);
    const r = layer.current!.getBoundingClientRect();
    setCursor([e.clientX - r.left, e.clientY - r.top]);
    // trazo continuo: puntos intermedios cada medio radio (en px de la foto)
    const pts: [number, number][] = [];
    const prev = first ? null : last.current;
    if (prev) {
      const d = Math.hypot((sx - prev[0]) * srcW, (sy - prev[1]) * srcH), stepPx = Math.max(1, brushR * long * 0.5);
      const n = Math.min(200, Math.floor(d / stepPx));
      for (let i = 1; i <= n; i++) pts.push([prev[0] + ((sx - prev[0]) * i) / (n + 1), prev[1] + ((sy - prev[1]) * i) / (n + 1)]);
    }
    pts.push([sx, sy]);
    last.current = [sx, sy];
    edit((z) => { for (const [x, y] of pts) (z.params.strokes as number[][]).push([+x.toFixed(4), +y.toFixed(4), +brushR.toFixed(4), ui.erase ? -1 : 1]); });
  };
  const tap = (sx: number, sy: number) => {
    if (zone.type === "point") edit((z) => { z.params.cx = sx; z.params.cy = sy; });
    if (zone.type === "color" && ui.dropper) {
      const c = rgbAt(sx, sy);
      if (c) {
        const [r, g, b] = c, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        let hue = 0;
        if (d > 1e-6) hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        edit((z) => { z.params.hue = Math.round((hue * 60 + 360) % 360); });
        setUi({ dropper: false });
      }
    }
  };
  const move = (e: PointerEvent) => {
    const dg = drag.current;
    if (!dg) {
      if (zone.type === "brush") { const r = layer.current!.getBoundingClientRect(); setCursor([e.clientX - r.left, e.clientY - r.top]); }
      return;
    }
    if (dg.what === "paint") { paint(e); return; }
    const [sx, sy] = S(e), st = dg.start, dx = sx - st.sx, dy = sy - st.sy;
    edit((z) => {
      const q = z.params as Record<string, number>;
      if (dg.what === "center") { q.cx = st.cx + dx; q.cy = st.cy + dy; }
      else if (dg.what === "rx") q.rx = Math.max(0.01, Math.abs(sx - st.cx));
      else if (dg.what === "ry") q.ry = Math.max(0.01, Math.abs(sy - st.cy));
      else if (dg.what === "p0") { q.x0 = st.x0 + dx; q.y0 = st.y0 + dy; }
      else if (dg.what === "p1") { q.x1 = st.x1 + dx; q.y1 = st.y1 + dy; }
      else if (dg.what === "line") { q.x0 = st.x0 + dx; q.y0 = st.y0 + dy; q.x1 = st.x1 + dx; q.y1 = st.y1 + dy; }
    });
  };
  const up = () => {
    const dg = drag.current;
    drag.current = null;
    if (!dg) return;
    onCommit(dg.what === "paint" ? (ui.erase ? "Borrar pincel" : "Pincel") : dg.what === "tap" ? zone.name : `Mover ${zone.name.toLowerCase()}`);
  };

  const t = zone.type;
  const handle = (x: number, y: number, what: string, big = false) => (
    <circle cx={x} cy={y} r={big ? 11 : 9} class={"gz-h" + (big ? " big" : "")} onPointerDown={down(what) as never} />
  );
  let svg: preact.JSX.Element | null = null;
  if (t === "radial") {
    const pts = Array.from({ length: 49 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2;
      return V(p.cx + Math.cos(a) * p.rx, p.cy + Math.sin(a) * p.ry).join(",");
    }).join(" ");
    const inner = Array.from({ length: 49 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2, f = 1 - Math.max(0.02, (p.feather ?? 50) / 100);
      return V(p.cx + Math.cos(a) * p.rx * f, p.cy + Math.sin(a) * p.ry * f).join(",");
    }).join(" ");
    const [cx, cy] = V(p.cx, p.cy), [hx, hy] = V(p.cx + p.rx, p.cy), [vx, vy] = V(p.cx, p.cy - p.ry);
    svg = <g><polyline points={pts} class="gz-line" /><polyline points={inner} class="gz-line soft" />
      {handle(cx, cy, "center", true)}{handle(hx, hy, "rx")}{handle(vx, vy, "ry")}</g>;
  } else if (t === "linear") {
    const [ax, ay] = V(p.x0, p.y0), [bx, by] = V(p.x1, p.y1);
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L * 2000, ny = dx / L * 2000;
    svg = <g>
      <line x1={ax - nx} y1={ay - ny} x2={ax + nx} y2={ay + ny} class="gz-line" />
      <line x1={bx - nx} y1={by - ny} x2={bx + nx} y2={by + ny} class="gz-line soft" />
      <line x1={ax} y1={ay} x2={bx} y2={by} class="gz-line dash" onPointerDown={down("line") as never} />
      {handle(ax, ay, "p0", true)}{handle(bx, by, "p1")}
    </g>;
  } else if (t === "point") {
    const [cx, cy] = V(p.cx, p.cy);
    const rr = ((p.size ?? 25) / 100) * long * 0.5 * scale;
    svg = <g><circle cx={cx} cy={cy} r={Math.max(12, rr)} class="gz-line soft" />{handle(cx, cy, "center", true)}</g>;
  }
  const paintable = t === "brush";
  const tappable = t === "point" || (t === "color" && ui.dropper);
  return (
    <div ref={layer} class={"gizmo-layer" + (paintable ? " paint" : "") + (tappable ? " tap" : "")} style={{ width: `${w}px`, height: `${h}px` }}
      onPointerDown={paintable ? (down("paint") as never) : tappable ? (down("tap") as never) : undefined}
      onPointerMove={move as never} onPointerUp={up} onPointerLeave={() => setCursor(null)}>
      <svg width={w} height={h} class="gizmo-svg">
        {svg}
        {paintable && cursor && <circle cx={cursor[0]} cy={cursor[1]} r={brushR * long * scale} class={"gz-brush" + (ui.erase ? " erase" : "")} />}
      </svg>
    </div>
  );
}
