// Editor de curva táctil: tocar añade un punto, arrastrar lo mueve, sacarlo por un lado lo borra.
import { useMemo, useRef, useState } from "preact/hooks";
import { pro } from "@phootflow/core";

type Ch = "master" | "r" | "g" | "b";
const CH: [Ch, string, string][] = [["master", "General", "#ffffff"], ["r", "Rojo", "#ff5a5a"], ["g", "Verde", "#4ad06a"], ["b", "Azul", "#5a8cff"]];

export function CurveEditor({ curves, onInput, onCommit }: {
  curves: pro.Curves; onInput: (c: pro.Curves) => void; onCommit: (label: string) => void;
}) {
  const [ch, setCh] = useState<Ch>("master");
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const pts = curves[ch];
  const color = CH.find((c) => c[0] === ch)![2];
  const S = 280;
  const path = useMemo(() => {
    const c = pro.sampleCurve(pts, 96);
    return Array.from(c).map((y, i) => `${i ? "L" : "M"}${(i / 95) * S} ${S - y * S}`).join("");
  }, [pts]);

  const at = (e: PointerEvent): [number, number] => {
    const r = ref.current!.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height))];
  };
  const set = (p: pro.CurvePoint[]) => onInput({ ...curves, [ch]: p });

  const down = (e: PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const [x, y] = at(e);
    let i = pts.findIndex((p) => Math.abs(p[0] - x) < 0.06 && Math.abs(p[1] - y) < 0.1);
    if (i < 0) {
      const np = [...pts, [x, y] as pro.CurvePoint].sort((a, b) => a[0] - b[0]);
      i = np.findIndex((p) => p[0] === x && p[1] === y);
      set(np);
    }
    drag.current = i;
  };
  const move = (e: PointerEvent) => {
    const i = drag.current;
    if (i === null) return;
    const [x0, y] = at(e);
    const np = pts.map((p) => [...p] as pro.CurvePoint);
    const lo = i > 0 ? np[i - 1][0] + 0.01 : 0, hi = i < np.length - 1 ? np[i + 1][0] - 0.01 : 1;
    const x = i === 0 ? Math.min(x0, hi) : i === np.length - 1 ? Math.max(x0, lo) : Math.max(lo, Math.min(hi, x0));
    np[i] = [x, y];
    set(np);
  };
  const up = (e: PointerEvent) => {
    const i = drag.current;
    drag.current = null;
    if (i === null) return;
    const r = ref.current!.getBoundingClientRect();
    const out = e.clientX < r.left - 24 || e.clientX > r.right + 24 || e.clientY < r.top - 24 || e.clientY > r.bottom + 24;
    if (out && i > 0 && i < pts.length - 1) set(pts.filter((_, k) => k !== i));
    onCommit("Curva");
  };

  return (
    <div class="curve-ed">
      <div class="chips" style={{ padding: "0 0 10px" }}>
        {CH.map(([id, name, c]) => (
          <button class={"chip" + (ch === id ? " on" : "")} onClick={() => setCh(id)}>
            <span class="dot-c" style={{ background: c }} />{name}
          </button>
        ))}
        <button class="chip" onClick={() => { onInput({ ...curves, [ch]: [[0, 0], [1, 1]] }); onCommit("Curva"); }}>Restablecer</button>
      </div>
      <svg ref={ref} viewBox={`0 0 ${S} ${S}`} class="curve-svg" onPointerDown={down} onPointerMove={move} onPointerUp={up}
        role="img" aria-label="Curva de tonos">
        {[1, 2, 3].map((k) => <line x1={(k * S) / 4} y1={0} x2={(k * S) / 4} y2={S} class="cg" />)}
        {[1, 2, 3].map((k) => <line y1={(k * S) / 4} x1={0} y2={(k * S) / 4} x2={S} class="cg" />)}
        <line x1={0} y1={S} x2={S} y2={0} class="cg diag" />
        <path d={path} fill="none" stroke={color} stroke-width={2.5} />
        {pts.map((p) => <circle cx={p[0] * S} cy={S - p[1] * S} r={8} fill="#05070f" stroke={color} stroke-width={2.5} />)}
      </svg>
      <p class="hint">Toca para añadir un punto y arrástralo. Para quitarlo, sácalo fuera del cuadro.</p>
    </div>
  );
}
