import { useEffect, useState } from "preact/hooks";
import { lutById, styles, type Style } from "@phootflow/core";

export interface Tools { filters: boolean; bokeh: boolean; beauty: boolean; crop: boolean; bw: boolean; splash: boolean; }

const OPTIONS: { key: keyof Tools; ico: string; title: string; text: string }[] = [
  { key: "filters", ico: "🎞️", title: "Filtros", text: "Pasa de uno en uno por más de 50 looks de película." },
  { key: "bokeh", ico: "🌫️", title: "Desenfocar el fondo", text: "Fondo suave como con un objetivo luminoso. Solo en fotos con una persona clara." },
  { key: "beauty", ico: "✨", title: "Filtro de belleza", text: "Piel suavizada y tono igualado, natural." },
  { key: "crop", ico: "📐", title: "Recortar para redes", text: "Post, historia, cuadrado… El recorte sigue a las personas en cada foto." },
  { key: "splash", ico: "🎨", title: "Color selectivo", text: "Deja en color solo lo que elijas (un color, la ropa, el coche, las flores…) y el resto en blanco y negro." },
  { key: "bw", ico: "◐", title: "También en blanco y negro", text: "Una copia en B/N de cada foto, además de la de color." },
];

export function Choose({ count, tools, onNext, onBack, onStyle }: {
  count: number; tools: Tools; onNext: (t: Tools) => void; onBack: () => void; onStyle: (s: Style) => void;
}) {
  const [t, setT] = useState<Tools>(tools);
  const [list, setList] = useState<Style[]>([]);
  useEffect(() => { styles.allStyles().then(setList); }, []);
  return (
    <div class="screen">
      <div class="topbar">
        <button class="icon-btn" onClick={onBack} aria-label="Atrás">‹</button>
        <div class="title">{count} {count === 1 ? "foto" : "fotos"}</div>
        <div class="icon-btn"><img src="/mark.png" alt="" class="mark sm" /></div>
      </div>
      <div class="scroll pad" style={{ display: "grid", gap: "10px", alignContent: "start", gridAutoRows: "max-content" }}>
        {list.length > 0 && (
          <>
            <h2>Empezar con un estilo</h2>
            <div class="style-strip">
              {list.map((s) => (
                <button class="style-card" onClick={() => onStyle(s)}>
                  <div class="d-name">{s.builtin ? "" : "⭐ "}{s.name}</div>
                  <div class="d-size">{styles.describeStyle(s.look, (id) => lutById(id)?.name)}</div>
                </button>
              ))}
            </div>
            <p class="muted small" style={{ margin: "0 0 8px" }}>O elige tú qué editar:</p>
          </>
        )}
        <h1>¿Qué quieres editar?</h1>
        <p class="muted" style={{ margin: "0 0 6px" }}>Lo verás en vivo en una foto. Siempre puedes cambiarlo.</p>
        {OPTIONS.map((o) => (
          <button class={"choice" + (t[o.key] ? " on" : "")} onClick={() => setT({ ...t, [o.key]: !t[o.key] })}>
            <div class="ico">{o.ico}</div>
            <div class="grow">
              <div style={{ fontWeight: 650, color: "var(--strong)" }}>{o.title}</div>
              <div class="muted small">{o.text}</div>
            </div>
            <div class="check">{t[o.key] ? "✓" : ""}</div>
          </button>
        ))}
        <p class="muted small">La luz y el color se ajustan solos en cada foto para que todas encajen.</p>
      </div>
      <div class="bottombar">
        <button class="btn primary block" onClick={() => onNext(t)}>Empezar a editar</button>
      </div>
    </div>
  );
}
