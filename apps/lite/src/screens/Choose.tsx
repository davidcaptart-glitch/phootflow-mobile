import { useEffect, useState } from "preact/hooks";
import { lutById, styles, type Review, type Session, type Style } from "@phootflow/core";
import { Icon } from "@phootflow/core/ui";

export interface Tools { filters: boolean; bokeh: boolean; beauty: boolean; crop: boolean; bw: boolean; splash: boolean; }

const OPTIONS: { key: keyof Tools; ico: string; title: string; text: string }[] = [
  { key: "filters", ico: "filters", title: "Filtros", text: "Pasa de uno en uno por más de 50 looks de película." },
  { key: "bokeh", ico: "bokeh", title: "Desenfocar el fondo", text: "Fondo suave como con un objetivo luminoso. Solo en fotos con una persona clara." },
  { key: "beauty", ico: "beauty", title: "Filtro de belleza", text: "Piel suavizada y tono igualado, natural." },
  { key: "crop", ico: "crop", title: "Recortar para redes", text: "Post, historia, cuadrado… El recorte sigue a las personas en cada foto." },
  { key: "splash", ico: "color", title: "Color selectivo", text: "Deja en color solo lo que elijas (un color, la ropa, el coche, las flores…) y el resto en blanco y negro." },
  { key: "bw", ico: "bw", title: "También en blanco y negro", text: "Una copia en B/N de cada foto, además de la de color." },
];

export function Choose({ session, tools, onNext, onBack, onStyle }: {
  session: Session; tools: Tools; onNext: (t: Tools) => void; onBack: () => void; onStyle: (s: Style) => void;
}) {
  const [t, setT] = useState<Tools>(tools);
  const [list, setList] = useState<Style[]>([]);
  useEffect(() => { styles.allStyles().then(setList); }, []);
  // revisión rápida: repetidas y movidas; las que se marcan se quitan al empezar a editar
  const [review, setReview] = useState<Review | null>(null);
  const [out, setOut] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState(false);
  useEffect(() => { session.review().then(setReview).catch(() => {}); }, []);
  const count = session.photos.length - out.size;
  const go = <A,>(f: (a: A) => void) => (a: A) => { if (out.size) session.remove([...out]); f(a); };
  const toggle = (id: string) => {
    const n = new Set(out);
    if (n.has(id)) n.delete(id); else if (n.size < session.photos.length - 1) n.add(id);
    setOut(n);
  };
  const dupOf = (id: string) => review?.duplicates.some((g) => g.slice(1).includes(id));
  // las repetidas que además están movidas cuentan solo como movidas
  const dups = review ? review.duplicates.flatMap((g) => g.slice(1)).filter((id) => !review.blurry.includes(id)).length : 0;
  const issues = review ? review.blurry.length + dups : 0;
  const summary = review && [
    dups ? `${dups} repetida${dups === 1 ? "" : "s"}` : "",
    review.blurry.length ? `${review.blurry.length} movida${review.blurry.length === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" y ");
  return (
    <div class="screen">
      <div class="topbar">
        <button class="icon-btn" onClick={onBack} aria-label="Atrás"><Icon name="back" /></button>
        <div class="title">{count} {count === 1 ? "foto" : "fotos"}<span class="sub-t">{out.size ? `${out.size} fuera` : "elegidas"}</span></div>
        <img src="/mark.png" alt="PhootFlow" class="mark sm" style={{ width: "44px" }} />
      </div>
      <div class="scroll pad" style={{ display: "grid", gap: "10px", alignContent: "start", gridAutoRows: "max-content" }}>
        {review && issues > 0 && (
          <div class="notice">
            <Icon name="alert" size={20} style={{ color: "var(--warn)", flex: "none" }} />
            <div class="grow">
              <div style={{ fontWeight: 700, color: "var(--strong)" }}>Hay {summary}</div>
              <div class="muted small">{out.size ? `Quitarás ${out.size} ${out.size === 1 ? "foto" : "fotos"} de esta edición.` : "Puedes quitarlas antes de editar."}</div>
            </div>
            <button class="btn sm" onClick={() => setSheet(true)}>Revisar</button>
          </div>
        )}
        {review && issues === 0 && session.photos.length > 1 && (
          <button class="link-row" onClick={() => setSheet(true)}><Icon name="library" size={18} />Ver y quitar fotos{out.size ? ` (${out.size} fuera)` : ""}</button>
        )}
        {list.length > 0 && (
          <>
            <h2>Empezar con un estilo</h2>
            <div class="style-strip">
              {list.map((s) => (
                <button class="style-card" onClick={() => go(onStyle)(s)}>
                  <div class="d-name">{s.name}{!s.builtin && <span class="badge" style={{ marginLeft: "6px" }}>Tuyo</span>}</div>
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
            <div class="ico-box"><Icon name={o.ico} /></div>
            <div class="grow">
              <div style={{ fontWeight: 700, color: "var(--strong)" }}>{o.title}</div>
              <div class="muted small">{o.text}</div>
            </div>
            <div class="check">{t[o.key] && <Icon name="check" size={15} />}</div>
          </button>
        ))}
        <p class="muted small">La luz y el color se ajustan solos en cada foto para que todas encajen.</p>
      </div>
      <div class="bottombar">
        <button class="btn primary block" onClick={() => go(onNext)(t)}>Empezar a editar</button>
      </div>
      {sheet && (
        <div class="sheet-bg" onClick={() => setSheet(false)}>
          <div class="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Tus fotos</h2>
            <p class="muted small">Toca una foto para quitarla de esta edición o volver a ponerla. Las originales no se borran.</p>
            {review && review.suggest.length > 0 && (
              <div class="row" style={{ padding: "8px 16px 0" }}>
                <button class="chip" onClick={() => setOut(new Set(review.suggest))}><Icon name="check" size={15} />Quitar las sugeridas ({review.suggest.length})</button>
                {out.size > 0 && <button class="chip" onClick={() => setOut(new Set())}>Ponerlas todas</button>}
              </div>
            )}
            <div class="review-grid">
              {session.photos.map((p) => {
                const blur = review?.blurry.includes(p.id), dup = dupOf(p.id), off = out.has(p.id);
                return (
                  <button class={"rv" + (off ? " off" : "")} onClick={() => toggle(p.id)} aria-pressed={off} aria-label={`${p.name}${off ? ", fuera" : ""}`}>
                    {p.check ? <img src={p.check.url} /> : <div class="spinner sm" />}
                    {(blur || dup) && <span class="rv-tag">{blur ? "Movida" : "Repetida"}</span>}
                    <span class="rv-mark">{off ? <Icon name="close" size={14} /> : <Icon name="check" size={14} />}</span>
                  </button>
                );
              })}
            </div>
            <button class="btn primary" onClick={() => setSheet(false)}>Hecho · {count} {count === 1 ? "foto" : "fotos"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
