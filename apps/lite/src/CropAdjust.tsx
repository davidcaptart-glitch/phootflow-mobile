// Retocar a mano el recorte de una foto para un destino: se arrastra el encuadre y se acerca o aleja.
// El encuadre es una caja normalizada sobre la foto revelada entera (igual que Photo.cropOverride).
import { useRef, useState } from "preact/hooks";
import { cropZoom, formatById, frameCrop, type Box, type FormatId } from "@phootflow/core";
import { Icon } from "@phootflow/core/ui";

export function CropAdjust({ src, imgRatio, formats, initial, auto, onSave, onClose }: {
  /** La foto revelada entera (sin recortar). */
  src: string;
  imgRatio: number;
  formats: FormatId[];
  initial: Record<FormatId, Box>;
  /** El recorte automático de cada destino. */
  auto: (f: FormatId) => Box;
  onSave: (crops: Record<FormatId, Box | null>) => void;
  onClose: () => void;
}) {
  const [fmt, setFmt] = useState(formats[0]);
  // null = automático
  const [crops, setCrops] = useState<Record<FormatId, Box | null>>(() => Object.fromEntries(formats.map((f) => [f, initial[f] ?? null])));
  const box = crops[fmt] ?? auto(fmt);
  const ratio = formatById(fmt).ratio;
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; box: Box; id: number } | null>(null);
  const set = (b: Box) => setCrops((c) => ({ ...c, [fmt]: b }));

  const onDown = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, box, id: e.pointerId };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current, el = wrap.current;
    if (!d || d.id !== e.pointerId || !el) return;
    const r = el.getBoundingClientRect();
    const cx = d.box.x + d.box.w / 2 + (e.clientX - d.x) / r.width, cy = d.box.y + d.box.h / 2 + (e.clientY - d.y) / r.height;
    set(frameCrop(imgRatio, ratio, cx, cy, cropZoom(d.box, imgRatio, ratio)));
  };
  const onUp = () => { drag.current = null; };
  const zoom = cropZoom(box, imgRatio, ratio);
  const setZoom = (z: number) => set(frameCrop(imgRatio, ratio, box.x + box.w / 2, box.y + box.h / 2, z));

  return (
    <div class="crop-edit">
      <div class="topbar">
        <button class="icon-btn" onClick={onClose} aria-label="Cancelar"><Icon name="close" /></button>
        <div class="title">Encuadre<span class="sub-t">{formatById(fmt).use}</span></div>
        <button class="icon-btn" onClick={() => onSave(crops)} aria-label="Guardar el encuadre"><Icon name="check" /></button>
      </div>
      <div class="stage">
        <div class="crop-wrap" ref={wrap} onWheel={(e) => { e.preventDefault(); setZoom(zoom * (e.deltaY > 0 ? 1.06 : 1 / 1.06)); }}
          style={{ aspectRatio: String(imgRatio), width: `min(100%, calc((100dvh - 290px) * ${imgRatio}))` }}>
          <img src={src} alt="" style={{ width: "100%" }} />
          <div class="crop-frame" role="slider" aria-label="Arrastra para mover el encuadre"
            aria-valuetext={`${Math.round(box.x * 100)} %, ${Math.round(box.y * 100)} %`}
            style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
        </div>
      </div>
      <div class="crop-tools">
        {formats.length > 1 && (
          <div class="chips">
            {formats.map((f) => (
              <button class={"chip" + (f === fmt ? " on" : "")} onClick={() => setFmt(f)}>{formatById(f).use}{crops[f] ? " ·" : ""}</button>
            ))}
          </div>
        )}
        <div class="row">
          <Icon name="zoom" size={18} />
          <input type="range" min={15} max={100} value={Math.round(zoom * 100)} aria-label="Tamaño del encuadre"
            onInput={(e) => setZoom(Number((e.target as HTMLInputElement).value) / 100)} />
        </div>
        <div class="row">
          <Icon name="move" size={18} />
          <span class="muted small grow">Arrastra el encuadre para elegir qué entra en la foto.</span>
          <button class="chip" disabled={!crops[fmt]} onClick={() => setCrops((c) => ({ ...c, [fmt]: null }))}>Automático</button>
        </div>
        <div class="row"><button class="btn primary block" onClick={() => onSave(crops)}>Guardar encuadre</button></div>
      </div>
    </div>
  );
}
