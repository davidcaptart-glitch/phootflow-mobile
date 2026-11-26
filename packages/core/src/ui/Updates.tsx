// Común a Lite y Pro: actualización automática (aviso discreto si hay trabajo sin guardar) y la hoja «Novedades»
// de la versión, que sale una vez al abrir una versión nueva y luego desde «Novedades» (openWhatsNew()).
import { useEffect, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { platform } from "../platform";
import { compareVersions, formatChangeDate, whatsNewFor, type ChangelogEntry } from "../updates/changelog";
import { applyUpdate, onUpdate, startAutoUpdate } from "../updates/pwa";
import { Icon } from "./Icon";

const SEEN = "novedades_vistas";
const OPEN_EVENT = "phootflow:novedades";
let current = "";

/** Versión de la app en marcha (la que lleva <AppUpdates>). */
export function appVersion() {
  return current;
}

/** Abre la hoja «Novedades» con todo el registro (desde un botón de la app). */
export function openWhatsNew() {
  dispatchEvent(new Event(OPEN_EVENT));
}

interface Props {
  appName: string;
  version: string;
  changelog: ChangelogEntry[];
  children: ComponentChildren;
}

export function AppUpdates({ appName, version, changelog, children }: Props) {
  current = version;
  const [sheet, setSheet] = useState<{ entries: ChangelogEntry[]; fresh: boolean } | null>(null);
  const [upd, setUpd] = useState({ ready: false, unsaved: false });
  const [hidden, setHidden] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (platform.kind === "web") startAutoUpdate();
    let wasUnsaved = false;
    const off = onUpdate(({ state, unsaved }) => {
      // al terminar la edición en curso, el aviso vuelve a salir
      if (wasUnsaved && !unsaved) { setHidden(false); setConfirm(false); }
      wasUnsaved = unsaved;
      setUpd({ ready: state === "ready", unsaved });
    });
    const open = () => setSheet({ entries: [...changelog].sort((a, b) => compareVersions(b.version, a.version)), fresh: false });
    addEventListener(OPEN_EVENT, open);
    return () => { off(); removeEventListener(OPEN_EVENT, open); };
  }, [changelog]);

  // novedades de esta versión, una sola vez
  useEffect(() => {
    let alive = true;
    (async () => {
      const seen = await platform.kvGet<string>(SEEN);
      const lic = seen == null ? await platform.kvGet<{ clave?: string; token?: string | null }>("licencia") : null;
      const entries = whatsNewFor(changelog, version, seen, !!(lic?.clave || lic?.token));
      if (seen !== version) await platform.kvSet(SEEN, version);
      if (alive && entries.length) setSheet({ entries, fresh: true });
    })().catch(() => {});
    return () => { alive = false; };
  }, [changelog, version]);

  const update = () => {
    if (upd.unsaved && !confirm) { setConfirm(true); return; }
    applyUpdate();
  };

  return (
    <>
      {children}
      {upd.ready && !hidden && (
        <div class="update-pill glass" role="status">
          <Icon name="update" size={18} />
          <span class="grow">{confirm ? "Se perderá la edición en curso" : "Hay una versión nueva"}</span>
          {confirm ? (
            <>
              <button class="pill-btn" onClick={() => { setHidden(true); setConfirm(false); }}>Después</button>
              <button class="pill-btn on" onClick={update}>Actualizar ya</button>
            </>
          ) : (
            <>
              <button class="pill-btn on" onClick={update}>Actualizar</button>
              <button class="pill-x" onClick={() => setHidden(true)} aria-label="Ahora no"><Icon name="close" size={16} /></button>
            </>
          )}
        </div>
      )}
      {sheet && (
        <div class="sheet-bg" onClick={() => setSheet(null)}>
          <div class="sheet whats-new" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Novedades">
            <div class="wn-head">
              <span class="wn-ico"><Icon name="news" size={22} /></span>
              <div class="grow">
                <h2>{sheet.fresh ? `Novedades de la versión ${version}` : "Novedades"}</h2>
                <p class="wn-sub">{appName} · versión {version}</p>
              </div>
              <button class="icon-btn" onClick={() => setSheet(null)} aria-label="Cerrar"><Icon name="close" /></button>
            </div>
            {sheet.entries.map((e) => (
              <section class="wn-entry" key={e.version}>
                <div class="wn-ver"><b>{e.title ?? `Versión ${e.version}`}</b><span>{e.title ? `${e.version} · ` : ""}{formatChangeDate(e.date)}</span></div>
                <ul>{e.items.map((t) => <li>{t}</li>)}</ul>
              </section>
            ))}
            <button class="btn primary wn-ok" onClick={() => setSheet(null)}>{sheet.fresh ? "Entendido" : "Cerrar"}</button>
          </div>
        </div>
      )}
    </>
  );
}
