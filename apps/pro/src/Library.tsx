// Biblioteca de Pro: las fotos importadas (los originales no se tocan), marcar, valorar, seleccionar varias para
// pegar ajustes, aplicar un preset o exportar.
import { useEffect, useMemo, useState } from "preact/hooks";
import { decode, platform, pro } from "@phootflow/core";
import { Icon } from "@phootflow/core/ui";
import { ExportSheet } from "./ExportSheet";
import { PresetSheet } from "./PresetSheet";
import { importPhotos, thumbFrom } from "./work";
import { samplePhotos } from "./samples";

type Filter = "all" | "picked" | "edited" | "stars" | "rejected";
const FILTERS: [Filter, string][] = [["all", "Todas"], ["picked", "Elegidas"], ["edited", "Editadas"], ["stars", "★ 3+"], ["rejected", "Rechazadas"]];

export interface Clip { dev: pro.Dev; groups: string[]; }

export function Library({ onOpen, clip, onShare }: { onOpen: (id: string) => void; clip: Clip | null; onShare: () => void }) {
  const [photos, setPhotos] = useState<pro.CatalogPhoto[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [sel, setSel] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"" | "export" | "preset">("");
  const [loaded, setLoaded] = useState(false);

  const reload = async () => {
    const list = await pro.catalog.listPhotos();
    setPhotos(list);
    setLoaded(true);
    setUrls((old) => {
      const next: Record<string, string> = {};
      for (const p of list) {
        const key = `${p.id}:${p.edited}`;
        next[key] = old[key] ?? (p.thumb ? URL.createObjectURL(p.thumb) : "");
      }
      Object.entries(old).forEach(([k, u]) => { if (!next[k]) URL.revokeObjectURL(u); });
      return next;
    });
  };
  useEffect(() => { void reload(); }, []);

  const shown = useMemo(() => photos.filter((p) =>
    filter === "all" ? p.flag !== -1
      : filter === "picked" ? p.flag === 1
        : filter === "edited" ? p.touched
          : filter === "stars" ? p.rating >= 3
            : p.flag === -1), [photos, filter]);

  const add = async (sample = false) => {
    const picked = sample ? await samplePhotos() : await platform.pickPhotos();
    if (!picked.length) return;
    const r = await importPhotos(picked, (d, t) => setBusy(`Importando ${d} de ${t}…`));
    setBusy(null);
    if (r.errors.length) alert(`No se han podido abrir ${r.errors.length}:\n${r.errors.join("\n")}`);
    await reload();
  };

  const chosen = photos.filter((p) => sel?.includes(p.id));
  const toggle = (id: string) => setSel((s) => (s ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id]));

  const applyAll = async (f: (d: pro.Dev) => pro.Dev, label: string) => {
    for (const [i, p] of chosen.entries()) {
      setBusy(`${label} ${i + 1} de ${chosen.length}…`);
      const dev = f(p.dev);
      await pro.catalog.updatePhoto(p.id, { dev, touched: true, edited: Date.now(), thumb: await thumbOf(p, dev) });
    }
    setBusy(null);
    await reload();
  };

  return (
    <div class="screen lib">
      <div class="topbar">
        <img src="/mark.png" alt="PhootFlow" class="mark sm" />
        <div class="title" style={{ alignItems: "flex-start" }}>Biblioteca<span class="sub-t">{photos.length} {photos.length === 1 ? "foto" : "fotos"} · PRO</span></div>
        <button class="icon-btn" onClick={onShare} aria-label="Compartir la app"><Icon name="share" size={19} /></button>
        {photos.length > 0 && (
          <button class={"icon-btn" + (sel ? " active" : "")} onClick={() => setSel(sel ? null : [])} aria-label="Seleccionar varias">
            <Icon name="check" size={20} />
          </button>
        )}
      </div>

      {photos.length > 0 && (
        <div class="chips" style={{ paddingBottom: "8px" }}>
          {FILTERS.map(([f, n]) => <button class={"chip" + (filter === f ? " on" : "")} onClick={() => setFilter(f)}>{n}</button>)}
        </div>
      )}

      <div class="scroll">
        {loaded && photos.length === 0 && (
          <div class="lib-empty">
            <img src="/mark.png" alt="" class="mark" />
            <h1>Revela como un profesional</h1>
            <p class="muted">Importa tus fotos: los originales no se tocan. Curvas, mezcla de color, gradación, detalle,
              recorte, presets y exportación a tamaño completo, todo en el móvil.</p>
            <button class="btn primary" onClick={() => add()}><Icon name="image" size={20} />Importar fotos</button>
            {import.meta.env.DEV && <button class="btn ghost sm" onClick={() => add(true)}>Fotos de ejemplo (desarrollo)</button>}
          </div>
        )}
        <div class="lib-grid">
          {shown.map((p) => {
            const on = sel?.includes(p.id);
            return (
              <button class={"lib-cell" + (on ? " on" : "")} onClick={() => (sel ? toggle(p.id) : onOpen(p.id))}
                aria-label={p.name}>
                {urls[`${p.id}:${p.edited}`] && <img src={urls[`${p.id}:${p.edited}`]} alt="" loading="lazy" />}
                {p.flag === 1 && <span class="lib-flag"><Icon name="check" size={12} /></span>}
                {p.rating > 0 && <span class="lib-stars">{"★".repeat(p.rating)}</span>}
                {p.touched && <span class="lib-dot" />}
                {sel && <span class={"lib-sel" + (on ? " on" : "")}>{on && <Icon name="check" size={14} />}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {sel ? (
        <div class="lib-actions glass">
          <button class="chip" onClick={() => setSel(sel.length === shown.length ? [] : shown.map((p) => p.id))}>
            {sel.length === shown.length ? "Ninguna" : "Todas"}
          </button>
          <span class="grow small muted">{sel.length} elegidas</span>
          <button class="icon-btn" disabled={!sel.length || !clip} aria-label="Pegar ajustes"
            onClick={() => clip && applyAll((d) => pro.pasteDev(d, clip.dev, clip.groups), "Pegando")}><Icon name="layers" size={20} /></button>
          <button class="icon-btn" disabled={!sel.length} aria-label="Aplicar preset" onClick={() => setSheet("preset")}><Icon name="styles" size={20} /></button>
          <button class="icon-btn" disabled={!sel.length} aria-label="Exportar" onClick={() => setSheet("export")}><Icon name="share" size={20} /></button>
          <button class="icon-btn" disabled={!sel.length} aria-label="Quitar de la biblioteca" onClick={async () => {
            if (!confirm(`¿Quitar ${sel.length} ${sel.length === 1 ? "foto" : "fotos"} de PhootFlow? Las del carrete del móvil no se tocan.`)) return;
            for (const id of sel) await pro.catalog.removePhoto(id);
            setSel(null);
            await reload();
          }}><Icon name="trash" size={20} /></button>
        </div>
      ) : (
        photos.length > 0 && (
          <div class="bottombar">
            <button class="btn primary block" onClick={() => add()}><Icon name="plus" size={20} />Importar fotos</button>
          </div>
        )
      )}

      {busy && <div class="overlay"><div><div class="spinner" /><p class="muted small">{busy}</p></div></div>}
      {sheet === "export" && <ExportSheet photos={chosen} devOf={(p) => p.dev} onClose={() => setSheet("")} />}
      {sheet === "preset" && (
        <PresetSheet onClose={() => setSheet("")} onPick={(ps) => { setSheet(""); void applyAll((d) => pro.applyPreset(d, ps), "Aplicando"); }} />
      )}
    </div>
  );
}

/** Miniatura revelada a partir del original (para cambios hechos desde la biblioteca). */
async function thumbOf(p: pro.CatalogPhoto, dev: pro.Dev) {
  const blob = await pro.catalog.original(p.id);
  if (!blob) return p.thumb;
  return thumbFrom(await decode(blob, 1024), dev);
}
