// Inicio «inmersivo»: la última foto editada a pantalla completa (o el logo sobre negro si aún no hay ninguna),
// el titular encima, la acción principal con el degradado de la marca y las sesiones para seguir editando.
import { useEffect, useState } from "preact/hooks";
import { library, type SavedSession } from "@phootflow/core";
import { Icon } from "@phootflow/core/ui";

export function Start({ onPick, onSample, onLibrary, onDesign, onContinue }: {
  onPick: () => void; onSample: () => void; onLibrary: () => void; onDesign: () => void; onContinue: (id: string) => void;
}) {
  const [sessions, setSessions] = useState<(SavedSession & { url: string | null })[]>([]);
  useEffect(() => {
    let urls: string[] = [];
    library.listSessions().then((list) => {
      const withUrls = list.slice(0, 8).map((s) => ({ ...s, url: s.cover ? URL.createObjectURL(s.cover) : null }));
      urls = withUrls.flatMap((s) => (s.url ? [s.url] : []));
      setSessions(withUrls);
    }).catch(() => {});
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  const hero = sessions.find((s) => s.url)?.url ?? null;

  return (
    <div class="screen start">
      <div class={"hero-bg" + (hero ? "" : " empty")} style={hero ? { backgroundImage: `url(${hero})` } : undefined}>
        {!hero && <img src="/mark.png" alt="" class="hero-mark" />}
      </div>
      <div class="hero-scrim" />

      <div class="topbar start-top">
        <img src="/mark.png" alt="PhootFlow" class="mark sm" />
        <span class="badge">LITE</span>
        <span class="grow" />
        {sessions.length > 0 && (
          <button class="icon-btn" onClick={onLibrary} aria-label="Mis ediciones"><Icon name="library" size={20} /></button>
        )}
      </div>

      <div class="scroll start-body">
        <div class="start-main">
          <h1 class="start-title">Tu estilo,<br />en todas tus fotos.</h1>
          <p class="start-lead">Edita una y PhootFlow deja igual el resto, ajustando la luz y el color de cada una.</p>
          <button class="btn primary block" onClick={onPick}><Icon name="image" size={20} />Elegir fotos</button>
          <div class="start-two">
            <button class="btn" onClick={onDesign}><Icon name="carousel" size={18} />Diseñar</button>
            <button class="btn" onClick={onLibrary} disabled={!sessions.length}><Icon name="library" size={18} />Mis ediciones</button>
          </div>
          {import.meta.env.DEV && <button class="btn ghost sm" onClick={onSample}>Fotos de ejemplo (desarrollo)</button>}
        </div>

        {sessions.length > 0 && (
          <section class="resume">
            <h2>Seguir editando</h2>
            <div class="resume-strip">
              {sessions.map((s) => (
                <button class="resume-card" onClick={() => onContinue(s.id)}>
                  <span class="resume-img" style={s.url ? { backgroundImage: `url(${s.url})` } : undefined} />
                  <span class="resume-name">{s.title}</span>
                  <span class="resume-sub">{s.photoIds.length} {s.photoIds.length === 1 ? "foto" : "fotos"}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        <p class="start-foot">Las fotos no salen de tu móvil.</p>
      </div>
    </div>
  );
}
