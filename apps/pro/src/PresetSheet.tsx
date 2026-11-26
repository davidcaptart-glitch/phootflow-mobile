// Presets: los incluidos y los tuyos, con la vista previa sobre la foto que estás revelando (si la hay).
import { useEffect, useState } from "preact/hooks";
import { pro, type Pixels } from "@phootflow/core";
import { Icon } from "@phootflow/core/ui";
import { Sheet } from "./ui";
import { previews } from "./work";

export function PresetSheet({ work, base, onPick, onClose, onSaveCurrent }: {
  work?: Pixels | null; base?: pro.Dev; onPick: (p: pro.ProPreset) => void; onClose: () => void;
  onSaveCurrent?: (name: string) => Promise<void>;
}) {
  const [own, setOwn] = useState<pro.ProPreset[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const all = [...own, ...pro.BUILTIN_PRESETS];
  const groups = [...new Set(all.map((p) => (p.builtin ? p.group : "Tuyos")))];

  const load = () => pro.catalog.listPresets().then((l) => setOwn(l.map((p) => ({ ...p, group: "Tuyos" }))));
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!work || !base) return;
    let alive = true;
    const list = all;
    previews(work, list.map((p) => pro.applyPreset(base, p)), 150).then((u) => {
      if (!alive) { u.forEach((x) => URL.revokeObjectURL(x)); return; }
      setThumbs(Object.fromEntries(list.map((p, i) => [p.id, u[i]])));
    });
    return () => { alive = false; };
  }, [work, own.length]);

  return (
    <Sheet title="Presets" onClose={onClose}>
      {onSaveCurrent && (
        <div class="row" style={{ padding: "0 16px 10px" }}>
          <input class="field grow" style={{ height: "44px", fontSize: "15px" }} placeholder="Guardar lo actual como…" value={name} maxLength={40}
            onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          <button class="btn sm" disabled={!name.trim()} onClick={async () => { await onSaveCurrent(name.trim()); setName(""); await load(); }}>
            <Icon name="plus" size={16} />Guardar
          </button>
        </div>
      )}
      {groups.map((g) => (
        <>
          <div class="sub">{g}</div>
          <div class="preset-strip">
            {all.filter((p) => (p.builtin ? p.group : "Tuyos") === g).map((p) => (
              <div class="preset">
                <button class="preset-img" onClick={() => onPick(p)} aria-label={`Aplicar ${p.name}`}>
                  {thumbs[p.id] ? <img src={thumbs[p.id]} alt="" /> : <Icon name="styles" size={22} />}
                </button>
                <span>{p.name}</span>
                {!p.builtin && (
                  <button class="preset-del" aria-label={`Borrar ${p.name}`} onClick={async () => {
                    if (!confirm(`¿Borrar el preset «${p.name}»?`)) return;
                    await pro.catalog.deletePreset(p.id);
                    await load();
                  }}><Icon name="close" size={12} /></button>
                )}
              </div>
            ))}
          </div>
        </>
      ))}
      <p class="hint">Un preset cambia el color y el tono; la exposición y el recorte de cada foto se mantienen.</p>
    </Sheet>
  );
}
