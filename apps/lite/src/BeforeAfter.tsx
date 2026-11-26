// Comparar antes y después: cortinilla vertical u horizontal que se arrastra, o botones Antes / Después.
// `before` es la imagen de antes; el después es lo que haya debajo (una <img> o el lienzo del editor).
import { useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";

/** after / before: la foto entera; curtain: cortinilla vertical (antes a la izquierda); curtain-h: horizontal (antes arriba). */
export type CompareMode = "after" | "before" | "curtain" | "curtain-h";

/** Capa que se pone encima del «después» con el mismo tamaño. */
export function CurtainOverlay({ before, mode, width, height }: { before: string; mode: CompareMode; width: number; height: number }) {
  const [pos, setPos] = useState(0.5);
  const ref = useRef<HTMLDivElement>(null);
  if (mode === "after" || !before) return null;
  const vertical = mode === "curtain", horizontal = mode === "curtain-h", curtain = vertical || horizontal;
  const move = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const v = horizontal ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
    setPos(Math.max(0, Math.min(1, v)));
  };
  const clip = !curtain ? "none" : vertical ? `inset(0 ${(1 - pos) * 100}% 0 0)` : `inset(0 0 ${(1 - pos) * 100}% 0)`;
  return (
    <div class={"ba" + (horizontal ? " h" : "")} ref={ref} style={{ width: `${width}px`, height: `${height}px` }}
      onPointerDown={(e) => { if (!curtain) return; (e.currentTarget as Element).setPointerCapture(e.pointerId); move(e); e.stopPropagation(); }}
      onPointerMove={(e) => { if (curtain && e.buttons) move(e); }}
      onPointerUp={(e) => e.stopPropagation()}>
      <img src={before} style={{ clipPath: clip }} draggable={false} />
      {vertical && (
        <>
          <div class="ba-line" style={{ left: `${pos * 100}%` }}><span>⟷</span></div>
          <span class="ba-tag tl">Antes</span>
          <span class="ba-tag tr">Después</span>
        </>
      )}
      {horizontal && (
        <>
          <div class="ba-line h" style={{ top: `${pos * 100}%` }}><span>↕</span></div>
          <span class="ba-tag tl">Antes</span>
          <span class="ba-tag bl">Después</span>
        </>
      )}
      {mode === "before" && <span class="ba-tag tl">Antes</span>}
    </div>
  );
}

/** Selector del modo de comparación. */
export function CompareSwitch({ mode, setMode }: { mode: CompareMode; setMode: (m: CompareMode) => void }) {
  const b = (m: CompareMode, label: string) => (
    <button class={mode === m ? "on" : ""} onClick={() => setMode(mode === m && m !== "after" ? "after" : m)}>{label}</button>
  );
  return (
    <div class="ba-switch">
      {b("before", "Antes")}
      {b("curtain", "⟷")}
      {b("curtain-h", "↕")}
      {b("after", "Después")}
    </div>
  );
}

/** Comparador completo con dos imágenes (visor de resultados). */
export function BeforeAfter({ before, after, children }: { before: string; after: string; children?: ComponentChildren }) {
  const [mode, setMode] = useState<CompareMode>("curtain");
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <div class="ba-wrap">
      <div class="ba-stage">
        <img src={after} draggable={false} onLoad={(e) => {
          const im = e.currentTarget as HTMLImageElement;
          setSize({ w: im.clientWidth, h: im.clientHeight });
        }} />
        {size.w > 0 && <div class="ba-pos"><CurtainOverlay before={before} mode={mode} width={size.w} height={size.h} /></div>}
      </div>
      <CompareSwitch mode={mode} setMode={setMode} />
      {children}
    </div>
  );
}
