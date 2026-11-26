// Piezas de la interfaz de Pro: regulador con valor por defecto (doble toque = restablecer), histograma y hoja.
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { Icon } from "@phootflow/core/ui";

export function PSlider({ label, value, min = -100, max = 100, step = 1, def = 0, track, fmt, onInput, onCommit }: {
  label: string; value: number; min?: number; max?: number; step?: number; def?: number; track?: string;
  fmt?: (v: number) => string; onInput: (v: number) => void; onCommit: (label: string) => void;
}) {
  const changed = Math.abs(value - def) > 1e-9;
  const zero = ((def - min) / (max - min)) * 100;
  const pos = ((value - min) / (max - min)) * 100;
  const fill = track ? undefined : `linear-gradient(90deg, transparent ${Math.min(zero, pos)}%, var(--accent) ${Math.min(zero, pos)}%, var(--accent) ${Math.max(zero, pos)}%, transparent ${Math.max(zero, pos)}%)`;
  return (
    <div class={"pslider" + (changed ? " changed" : "")}>
      <div class="ps-head">
        <button class="ps-label" onClick={() => { onInput(def); onCommit(label); }} title="Toca para restablecer">{label}</button>
        <output>{fmt ? fmt(value) : (value > 0 && min < 0 ? "+" : "") + (step < 1 ? value.toFixed(2) : Math.round(value))}</output>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label}
        style={{ "--track": track ?? "rgba(255,255,255,0.16)", "--fill": fill ?? "none" } as never}
        onInput={(e) => onInput(Number((e.target as HTMLInputElement).value))}
        onChange={() => onCommit(label)}
        onDblClick={() => { onInput(def); onCommit(label); }} />
    </div>
  );
}

export function Group({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section class="pgroup">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/** Histograma: canales R, G y B superpuestos sobre la luminancia. */
export function Histogram({ data }: { data: Float32Array[] | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !data) return;
    const ctx = c.getContext("2d")!;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    const max = Math.max(...data.slice(0, 3).flatMap((a) => Array.from(a).slice(1, -1))) || 1;
    const draw = (a: Float32Array, color: string) => {
      ctx.beginPath();
      ctx.moveTo(0, H);
      a.forEach((v, i) => ctx.lineTo((i / (a.length - 1)) * W, H - Math.min(1, v / max) * H));
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };
    ctx.globalCompositeOperation = "lighter";
    draw(data[0], "rgba(230,60,60,0.55)");
    draw(data[1], "rgba(60,200,90,0.55)");
    draw(data[2], "rgba(70,110,240,0.6)");
    // aviso de recortes: punta en los extremos
    ctx.globalCompositeOperation = "source-over";
    const clipLo = data[3][0] / (data[3].reduce((a, b) => a + b, 0) || 1), clipHi = data[3][data[3].length - 1] / (data[3].reduce((a, b) => a + b, 0) || 1);
    if (clipLo > 0.01) { ctx.fillStyle = "#4da3ff"; ctx.fillRect(0, 0, 4, 4); }
    if (clipHi > 0.01) { ctx.fillStyle = "#ff5c6c"; ctx.fillRect(W - 4, 0, 4, 4); }
  }, [data]);
  return <canvas ref={ref} class="histogram" width={160} height={64} aria-label="Histograma" role="img" />;
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  return (
    <div class="sheet-bg" onClick={onClose}>
      <div class="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div class="row" style={{ padding: "0 16px 8px" }}>
          <h2 class="grow" style={{ margin: 0 }}>{title}</h2>
          <button class="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Pistas de color para los reguladores. */
export const TRACKS = {
  temp: "linear-gradient(90deg, #3b6fd8, #9a9a9a, #e0b232)",
  tint: "linear-gradient(90deg, #3fa64a, #9a9a9a, #c43cc4)",
  sat: "linear-gradient(90deg, #8a8a8a, #e0433c)",
  vib: "linear-gradient(90deg, #8a8a8a, #e07a3c)",
  exposure: "linear-gradient(90deg, #101010, #e8e8e8)",
  hue: "linear-gradient(90deg, #ff0000, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000)",
};
