// «Mis ediciones»: las sesiones guardadas en la app, con sus fotos y todas las versiones hechas
// (cada destino, color y B/N, y los diseños). Desde aquí se vuelven a compartir o se sigue editando.
import { useEffect, useMemo, useState } from "preact/hooks";
import { Icon } from "@phootflow/core/ui";
import { formatById, library, platform, styles, type SavedPhoto, type SavedSession, type Version } from "@phootflow/core";
import { versionAsset, type Asset } from "../assets";

const url = new Map<Blob, string>();
const u = (b: Blob | null) => {
  if (!b) return "";
  let s = url.get(b);
  if (!s) { s = URL.createObjectURL(b); url.set(b, s); }
  return s;
};
const label = (v: Version) =>
  (v.kind === "design" ? `Diseño · pág. ${(v.page ?? 0) + 1}` : v.format ? formatById(v.format).use : "Original") + (v.bw ? " · B/N" : "");
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n > 100 * 1024 * 1024 ? 0 : 1)} MB`;

export function Library({ onBack, onContinue, onDesign }: {
  onBack: () => void; onContinue: (id: string) => void; onDesign: (assets: Asset[]) => void;
}) {
  const [sessions, setSessions] = useState<SavedSession[] | null>(null);
  const [open, setOpen] = useState<SavedSession | null>(null);
  const [space, setSpace] = useState<{ used: number; quota: number } | null>(null);

  const reload = async () => {
    setSessions(await library.listSessions());
    setSpace(await library.usage());
  };
  useEffect(() => { void reload(); }, []);

  if (open) return <SessionView s={open} onBack={() => { setOpen(null); void reload(); }} onContinue={() => onContinue(open.id)} onDesign={onDesign} />;

  return (
    <div class="screen">
      <div class="topbar">
        <button class="icon-btn" onClick={onBack} aria-label="Atrás"><Icon name="back" /></button>
        <div class="title">Mis ediciones</div>
        <img src="/mark.png" alt="PhootFlow" class="mark sm" style={{ width: "44px" }} />
      </div>
      <div class="scroll pad" style={{ display: "grid", gap: "10px", alignContent: "start", gridAutoRows: "max-content" }}>
        {sessions === null && <div class="spinner" />}
        {sessions?.length === 0 && <p class="muted">Aún no hay nada guardado. Las sesiones se guardan solas al aplicar la edición, y cada versión al exportarla.</p>}
        {sessions?.map((s) => (
          <button class="sess" onClick={() => setOpen(s)}>
            <img src={u(s.cover)} />
            <div class="grow">
              <div class="d-name">{s.title}</div>
              <div class="d-size">{s.photoIds.length} fotos · editada el {new Date(s.updated).toLocaleDateString("es-ES")}</div>
            </div>
            <span class="muted">›</span>
          </button>
        ))}
        {space && space.quota > 0 && <p class="muted small">Ocupa {mb(space.used)} de {mb(space.quota)} disponibles en este móvil.</p>}
      </div>
    </div>
  );
}

function SessionView({ s, onBack, onContinue, onDesign }: {
  s: SavedSession; onBack: () => void; onContinue: () => void; onDesign: (assets: Asset[]) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<Version[]>([]);
  const toggle = (v: Version) => setChosen((c) => (c.some((x) => x.id === v.id) ? c.filter((x) => x.id !== v.id) : [...c, v]));
  const tap = (v: Version) => (picking ? toggle(v) : setView(v));
  const [photos, setPhotos] = useState<SavedPhoto[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [view, setView] = useState<Version | null>(null);
  const [toast, setToast] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2200); };

  const reload = async () => {
    const order = new Map(s.photoIds.map((id, i) => [id, i]));
    setPhotos((await library.sessionPhotos(s.id)).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)));
    setVersions(await library.sessionVersions(s.id));
  };
  useEffect(() => { void reload(); }, [s.id]);

  const designs = versions.filter((v) => v.kind === "design");
  const byPhoto = useMemo(() => photos.map((p) => ({ p, vs: versions.filter((v) => v.photoId === p.id) })), [photos, versions]);

  const share = async (vs: Version[]) => {
    const files = vs.map((v) => new File([v.blob], v.name, { type: "image/jpeg" }));
    const r = await platform.share(files);
    if (r === "saved") flash(`${files.length} descargada(s)`);
  };

  if (view) {
    return (
      <div class="screen">
        <div class="topbar">
          <button class="icon-btn" onClick={() => setView(null)} aria-label="Atrás"><Icon name="back" /></button>
          <div class="title">{label(view)}</div>
          <div style={{ width: "44px" }} />
        </div>
        <div class="viewer">
          <img src={u(view.blob)} style={{ borderRadius: view.format && formatById(view.format).circle ? "50%" : "4px" }} />
          <p class="muted small">{view.name} · {view.width} × {view.height} px</p>
        </div>
        <div class="bottombar" style={{ display: "grid", gap: "10px" }}>
          <button class="btn primary block" onClick={() => share([view])}>Compartir</button>
          <button class="btn ghost block" onClick={async () => {
            if (!confirm("¿Borrar esta versión de la app? La foto original no se toca.")) return;
            await library.deleteVersion(view.id); setView(null); await reload();
          }}>Borrar esta versión</button>
        </div>
        {toast && <div class="toast">{toast}</div>}
      </div>
    );
  }

  return (
    <div class="screen">
      <div class="topbar">
        <button class="icon-btn" onClick={onBack} aria-label="Atrás"><Icon name="back" /></button>
        <div class="title">{s.title}</div>
        <div style={{ width: "44px" }} />
      </div>
      <div class="scroll">
        <div class="row pad" style={{ paddingBottom: 4 }}>
          <p class="muted small grow" style={{ margin: 0 }}>
            {picking ? "Toca las fotos que quieres llevar a Diseño." : `${versions.length} versiones guardadas. Toca una para verla o compartirla.`}
          </p>
          {versions.some((v) => v.kind === "photo") && (
            <button class={"chip" + (picking ? " on" : "")} onClick={() => { setPicking(!picking); setChosen([]); }}>
              {picking ? "Cancelar" : "Elegir para diseñar"}
            </button>
          )}
        </div>
        {designs.length > 0 && (
          <div class="vrow">
            <div class="vhead"><span class="d-name">Diseños y carruseles</span>
              <button class="chip" onClick={() => share(designs.slice().sort((a, b) => (a.created - b.created)))}>Compartir</button></div>
            <div class="vstrip">{designs.slice().reverse().map((v) => <button class="ver" onClick={() => !picking && setView(v)}><img src={u(v.blob)} /><span>{label(v)}</span></button>)}</div>
          </div>
        )}
        {byPhoto.map(({ p, vs }) => (
          <div class="vrow">
            <div class="vhead">
              <img class="vorig" src={u(p.thumb)} />
              <span class="d-name grow">{p.name}</span>
              {vs.length > 0 && <button class="chip" onClick={() => share(vs)}>Compartir {vs.length}</button>}
            </div>
            <div class="vstrip">
              {vs.length === 0 && <span class="muted small">Sin versiones exportadas todavía.</span>}
              {vs.map((v) => (
                <button class={"ver" + (chosen.some((x) => x.id === v.id) ? " chosen" : "")} onClick={() => tap(v)}>
                  <img src={u(v.blob)} style={{ borderRadius: v.format && formatById(v.format).circle ? "50%" : "4px" }} />
                  {chosen.some((x) => x.id === v.id) && <span class="num">{chosen.findIndex((x) => x.id === v.id) + 1}</span>}
                  <span>{label(v)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div class="bottombar" style={{ display: "grid", gap: "10px" }}>
        {picking ? (
          <button class="btn primary block" disabled={!chosen.length} onClick={() => onDesign(chosen.map(versionAsset))}>
            Diseñar con {chosen.length || ""} {chosen.length === 1 ? "foto" : "fotos"} →
          </button>
        ) : (
          s.photoIds.length > 0 && <button class="btn primary block" onClick={onContinue}>Seguir editando</button>
        )}
        <button class="btn block sm" onClick={async () => {
          const name = prompt("Nombre del estilo (para usarlo con otras fotos):", "");
          if (!name?.trim()) return;
          const st = await styles.saveStyle(name, s.look);
          flash(`Estilo «${st.name}» guardado`);
        }}>Guardar su edición como estilo</button>
        <button class="btn ghost block sm" onClick={async () => {
          if (!confirm("¿Borrar esta sesión y todas sus versiones de la app? Las fotos de tu galería no se tocan.")) return;
          await library.deleteSession(s.id); onBack();
        }}>Borrar la sesión de la app</button>
      </div>
      {toast && <div class="toast">{toast}</div>}
    </div>
  );
}
