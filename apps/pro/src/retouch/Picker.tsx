// Retocar: elegir una foto del catálogo de Pro (revelada con sus ajustes). Las ya retocadas llevan una marca.
import { useEffect, useState } from "preact/hooks";
import { platform, pro } from "@phootflow/core";
import { Icon } from "@phootflow/core/ui";
import { importPhotos } from "../work";
import { samplePhotos } from "../samples";

interface Item { photo: pro.CatalogPhoto; url: string; layers: number; }

export function RetouchPicker({ onOpen }: { onOpen: (id: string) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = async () => {
    const [photos, rts] = await Promise.all([pro.catalog.listPhotos(), pro.catalog.listRetouch()]);
    const byId = new Map(rts.map((r) => [r.id, r]));
    setItems((old) => {
      old.forEach((i) => URL.revokeObjectURL(i.url));
      return photos.filter((p) => p.flag !== -1).map((p) => {
        const r = byId.get(p.id);
        const thumb = r?.thumb && r.layers.length ? r.thumb : p.thumb;
        return { photo: p, url: thumb ? URL.createObjectURL(thumb) : "", layers: r?.layers.length ?? 0 };
      });
    });
    setLoaded(true);
  };
  useEffect(() => { void reload(); }, []);

  const add = async (sample = false) => {
    const picked = sample ? await samplePhotos() : await platform.pickPhotos();
    if (!picked.length) return;
    const r = await importPhotos(picked, (d, t) => setBusy(`Importando ${d} de ${t}…`));
    setBusy(null);
    if (r.errors.length) alert(`No se han podido abrir ${r.errors.length}:\n${r.errors.join("\n")}`);
    await reload();
  };

  const retouched = items.filter((i) => i.layers > 0).length;

  return (
    <div class="screen lib rt-pick">
      <div class="topbar">
        <img src="/mark.png" alt="PhootFlow" class="mark sm" />
        <div class="title" style={{ alignItems: "flex-start" }}>
          Retocar<span class="sub-t">{items.length ? `Elige una foto · ${retouched} retocada${retouched === 1 ? "" : "s"}` : "Capas, corrector, IA"}</span>
        </div>
        <button class="icon-btn" onClick={() => add()} aria-label="Importar fotos"><Icon name="plus" size={20} /></button>
      </div>

      <div class="scroll">
        {loaded && items.length === 0 && (
          <div class="lib-empty">
            <img src="/mark.png" alt="" class="mark" />
            <h1>Retoca como en el ordenador</h1>
            <p class="muted">Quita objetos y personas, corrige manchas con el corrector y el tampón, retoca retratos,
              cambia el fondo y pon tu texto o tu logo. Por capas: todo se puede deshacer.</p>
            <button class="btn primary" onClick={() => add()}><Icon name="image" size={20} />Importar fotos</button>
            {import.meta.env.DEV && <button class="btn ghost sm" onClick={() => add(true)}>Fotos de ejemplo (desarrollo)</button>}
          </div>
        )}
        <div class="lib-grid">
          {items.map((i) => (
            <button class="lib-cell" onClick={() => onOpen(i.photo.id)} aria-label={`Retocar ${i.photo.name}`}>
              {i.url && <img src={i.url} alt="" loading="lazy" />}
              {i.layers > 0 && <span class="rt-badge"><Icon name="layers" size={12} />{i.layers}</span>}
            </button>
          ))}
        </div>
        {items.length > 0 && <p class="hint" style={{ textAlign: "center" }}>Se retoca la foto revelada: los ajustes de Revelar se mantienen.</p>}
      </div>

      {busy && <div class="overlay"><div><div class="spinner" /><p class="muted small">{busy}</p></div></div>}
    </div>
  );
}
