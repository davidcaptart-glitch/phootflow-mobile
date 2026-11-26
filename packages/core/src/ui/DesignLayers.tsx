// Capas de un diseño: ver, ocultar y bloquear cada elemento, elegir varios para agrupar, alinear, distribuir,
// duplicar o borrar. La de arriba de la lista es la que está delante.
import { useState } from "preact/hooks";
import {
  SHAPES, alignItems, deleteItems, distributeItems, duplicateItems, groupItems, setHidden, setLocked, ungroupItems,
  type Board, type Item,
} from "../index";
import { Icon } from "./Icon";

const label = (it: Item) =>
  it.kind === "text" ? `Texto · ${it.text.split("\n")[0].slice(0, 22) || "vacío"}`
    : it.kind === "photo" ? (it.cutout ? "Persona recortada" : it.photo.startsWith("marca#") ? "Logo" : "Foto")
      : it.kind === "sticker" ? `Sticker ${it.emoji}` : `Forma · ${SHAPES.find((x) => x.id === it.shape)?.name ?? it.shape}`;

const ALIGN: [Parameters<typeof alignItems>[2], string][] = [
  ["left", "Izquierda"], ["hcenter", "Centro"], ["right", "Derecha"], ["top", "Arriba"], ["vcenter", "Medio"], ["bottom", "Abajo"],
];

export function DesignLayers({ board, setBoard, sel, setSel, onClose }: {
  board: Board; setBoard: (b: Board) => void; sel: string | null; setSel: (id: string | null) => void; onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(sel ? [sel] : []);
  const items = [...board.items].reverse();
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const grouped = picked.some((id) => board.items.find((i) => i.id === id)?.group);
  const one = (id: string) => [id];

  return (
    <div class="props" style={{ padding: "4px 0" }}>
      <div class="row" style={{ padding: "0 16px" }}>
        <h2 class="grow" style={{ margin: 0 }}>Capas</h2>
        <span class="muted small">{picked.length ? `${picked.length} elegidas` : "Toca para elegir varias"}</span>
      </div>
      <div class="layer-list">
        {items.map((it) => {
          const on = picked.includes(it.id);
          return (
            <div class={"layer-row" + (on ? " on" : "") + (it.hidden ? " off" : "")}>
              <button class="layer-ico" aria-label={it.hidden ? "Mostrar" : "Ocultar"} onClick={() => setBoard(setHidden(board, one(it.id), !it.hidden))}>
                <Icon name={it.hidden ? "eyeOff" : "eye"} size={17} />
              </button>
              <button class="layer-name" onClick={() => toggle(it.id)} onDblClick={() => { setSel(it.id); onClose(); }}>
                <span class={"layer-check" + (on ? " on" : "")}>{on && <Icon name="check" size={12} />}</span>
                {label(it)}{it.group ? <span class="badge">grupo</span> : null}
              </button>
              <button class={"layer-ico" + (it.locked ? " active" : "")} aria-label={it.locked ? "Desbloquear" : "Bloquear"}
                onClick={() => setBoard(setLocked(board, one(it.id), !it.locked))}>
                <Icon name={it.locked ? "lock" : "unlock"} size={17} />
              </button>
            </div>
          );
        })}
      </div>
      {picked.length > 0 && (
        <>
          <div class="chips">
            {picked.length === 1 && <button class="chip" onClick={() => { setSel(picked[0]); onClose(); }}>Editar</button>}
            {picked.length >= 2 && <button class="chip" onClick={() => setBoard(groupItems(board, picked).board)}><Icon name="layers" size={15} />Agrupar</button>}
            {grouped && <button class="chip" onClick={() => setBoard(ungroupItems(board, picked))}>Desagrupar</button>}
            <button class="chip" onClick={() => { const r = duplicateItems(board, picked); setBoard(r.board); setPicked(r.ids); }}><Icon name="duplicate" size={15} />Duplicar</button>
            <button class="chip danger" onClick={() => { setBoard(deleteItems(board, picked)); setPicked([]); setSel(null); }}><Icon name="trash" size={15} />Borrar</button>
          </div>
          <div class="sub">{picked.length >= 2 ? "Alinear entre ellos" : "Alinear en su página"}</div>
          <div class="chips">
            {ALIGN.map(([e, n]) => <button class="chip" onClick={() => setBoard(alignItems(board, picked, e, picked.length >= 2 ? "selection" : "page"))}>{n}</button>)}
          </div>
          {picked.length >= 3 && (
            <div class="chips" style={{ paddingTop: "6px" }}>
              <button class="chip" onClick={() => setBoard(distributeItems(board, picked, "h"))}>Repartir en horizontal</button>
              <button class="chip" onClick={() => setBoard(distributeItems(board, picked, "v"))}>Repartir en vertical</button>
            </div>
          )}
        </>
      )}
      <p class="hint">Doble toque en una capa para editarla. Los elementos bloqueados no se mueven ni se borran.</p>
    </div>
  );
}
