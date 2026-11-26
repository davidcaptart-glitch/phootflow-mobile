// PhootFlow Pro: todo en uno. Revelar (tipo Lightroom, lo principal) + Retocar (lo útil de Photoshop) +
// Diseñar (Canva completo) + Publicar. Misma base que Lite (@phootflow/core).
// Estado: primera versión con Revelar funcionando sobre una foto; Retocar y Diseñar completo, por hacer
// (ver ROADMAP.md).
import { useEffect, useRef, useState } from "preact/hooks";
import {
  COLOR_LUTS, DEFAULT_LOOK, LUT_SIZE, Renderer, Session, WORK_SIDE, ZERO_LIGHT, decode, loadLut, platform,
  type Light, type Look, type Pixels,
} from "@phootflow/core";
import { Icon, ShareApp } from "@phootflow/core/ui";

type Mode = "develop" | "retouch" | "design";

const MODES: { key: Mode; ico: string; name: string }[] = [
  { key: "develop", ico: "◐", name: "Revelar" },
  { key: "retouch", ico: "🖌️", name: "Retocar" },
  { key: "design", ico: "▦", name: "Diseñar" },
];

const LIGHT: [keyof Light, string, number, number, number][] = [
  ["exposure", "Exposición", -400, 400, 100],
  ["contrast", "Contraste", -100, 100, 1],
  ["highlights", "Luces", -100, 100, 1],
  ["shadows", "Sombras", -100, 100, 1],
  ["warmth", "Temperatura", -100, 100, 1],
  ["tint", "Tinte", -100, 100, 1],
  ["saturation", "Saturación", -100, 100, 1],
];

export function App() {
  const [mode, setMode] = useState<Mode>("develop");
  const [session] = useState(() => new Session());
  const [ready, setReady] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [look, setLook] = useState<Look>({ ...DEFAULT_LOOK });
  const r = useRef<Renderer | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const work = useRef<Pixels | null>(null);

  const open = async () => {
    const picked = await platform.pickPhotos();
    if (!picked.length) return;
    session.photos = [];
    session.guideId = null;
    session.needSegmentation = false;
    const [p] = session.add(picked.slice(0, 1));
    await session.analyze(p);
    r.current ??= new Renderer();
    if (!host.current!.contains(r.current.canvas as HTMLCanvasElement)) host.current!.appendChild(r.current.canvas as HTMLCanvasElement);
    work.current = await decode(p.blob, Math.min(WORK_SIDE, r.current.maxSize));
    await session.prepare(r.current, p, work.current, look);
    setReady(true);
  };

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    (async () => {
      const t = look.lut ? await loadLut(look.lut) : null;
      if (!alive || !r.current) return;
      r.current.setLut(look.lut, t, LUT_SIZE);
      const img = work.current!, el = host.current!;
      const ar = img.width / img.height;
      let w = el.clientWidth - 20, h = w / ar;
      if (h > el.clientHeight - 20) { h = el.clientHeight - 20; w = h * ar; }
      const c = r.current.canvas as HTMLCanvasElement;
      c.style.width = `${w}px`; c.style.height = `${h}px`;
      const W = Math.round(Math.min(img.width, w * Math.min(2, devicePixelRatio)));
      session.draw(r.current, session.guide!, look, { width: W, height: Math.round(W / ar) });
    })();
    return () => { alive = false; };
  }, [look, ready]);

  const setL = (k: keyof Light, v: number) => setLook((l) => ({ ...l, light: { ...l.light, [k]: v } }));

  return (
    <div class="screen pro">
      <div class="topbar">
        <img src="/mark.png" class="mark sm" alt="" />
        <img src="/wordmark.png" class="wordmark" alt="PhootFlow" />
        <span class="badge">Pro</span>
        <div class="grow" />
        <button class="icon-btn" onClick={() => setSharing(true)} aria-label="Compartir la app"><Icon name="share" size={19} /></button>
        <button class="btn sm" onClick={open}>Abrir foto</button>
      </div>
      <div class="stage" ref={host}>
        {!ready && (
          <div class="empty">
            <img src="/mark.png" alt="PhootFlow" class="mark" />
            <h2>Edición profesional en el móvil</h2>
            <p class="muted small">Revelado tipo Lightroom, retoque tipo Photoshop y diseño completo para redes, en una sola app.</p>
            <button class="btn primary" onClick={open}>Abrir una foto</button>
          </div>
        )}
      </div>
      <div class="panel">
        {mode === "develop" && ready && (
          <>
            {LIGHT.map(([k, name, min, max, sc]) => (
              <div class="slider">
                <label>{name}</label>
                <input type="range" min={min} max={max} value={Math.round(look.light[k] * sc)}
                  onInput={(e) => setL(k, Number((e.target as HTMLInputElement).value) / sc)} onDblClick={() => setL(k, 0)} />
                <output>{sc === 1 ? look.light[k] : look.light[k].toFixed(2)}</output>
              </div>
            ))}
            <div class="chips" style={{ paddingTop: "8px" }}>
              <button class={"chip" + (!look.lut ? " on" : "")} onClick={() => setLook({ ...look, lut: null })}>Sin perfil</button>
              {COLOR_LUTS.slice(0, 30).map((l) => (
                <button class={"chip" + (look.lut === l.id ? " on" : "")} onClick={() => setLook({ ...look, lut: l.id })}>{l.name}</button>
              ))}
            </div>
            <div class="row" style={{ padding: "8px 16px" }}>
              <button class="btn ghost sm" onClick={() => setLook({ ...look, light: { ...ZERO_LIGHT }, lut: null })}>Restablecer</button>
            </div>
          </>
        )}
        {mode !== "develop" && (
          <div class="pad">
            <h2>{mode === "retouch" ? "Retocar" : "Diseñar"}</h2>
            <p class="muted small">
              {mode === "retouch"
                ? "Capas, corrector y tampón, quitar fondo, licuar, retoque de retrato y texto. En construcción sobre la misma base."
                : "El diseño completo (capas, formas, texto enriquecido, kit de marca, vídeo) se construye sobre el tablero de Lite. En construcción."}
            </p>
          </div>
        )}
      </div>
      <div class="tabs">
        {MODES.map((m) => (
          <button class={"tab" + (m.key === mode ? " on" : "")} onClick={() => setMode(m.key)}>
            <span class="t-ico">{m.ico}</span>{m.name}
          </button>
        ))}
      </div>
      {sharing && <ShareApp appName="PhootFlow Pro" audience="edición profesional en el móvil" onClose={() => setSharing(false)} />}
    </div>
  );
}
