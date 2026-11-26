// Diseño para redes con lienzo continuo: las páginas del carrusel van seguidas y las fotos, textos y formas pueden
// cruzar de una a otra. Se mueven, escalan y giran con el dedo (o con el tirador), tienen capas y se publican como
// carrusel en orden. También posts de una imagen.
import { useEffect, useRef, useState } from "preact/hooks";
import {
  CAROUSELS, FONTS, GRADIENTS, MAX_PAGES, PALETTE, SINGLES, STICKERS, TEMPLATES, blankBoard, cutKey, exportBoard,
  hitTest, itemBox, moveLayer, newId, pageSize, paintBoard, platform, segment, shrink,
  type Board, type FontId, type Frame, type Item, type Look, type PhotoItem, type Pixels, type Session, type Template, type TextItem,
} from "@phootflow/core";
import { Slider } from "./Editor";
import { saveDesign, saveStandaloneDesign } from "../saving";
import { editedAssets, pickPhoneAssets, sessionAssets, type Asset } from "../assets";

/** Ancho interno de una página mientras se edita (al publicar se pinta a su tamaño real). */
const PW = 540;
const FORMATS_DESIGN: [string, string][] = [["4:5", "4:5"], ["1:1", "1:1"], ["3:4", "3:4"], ["9:16", "Historia"]];

type Sheet = "" | "photo" | "sticker" | "bg" | "publish" | "pages" | "swap" | "edited";

const SOURCE_TAG = { sesion: "", editada: "✓", telefono: "📱" } as const;

export function Design({ session, look, initial = [], onBack }: {
  session?: Session; look?: Look; initial?: Asset[]; onBack: () => void;
}) {
  const [assets, setAssets] = useState<Asset[]>(() => {
    const own = session && look ? sessionAssets(session, look) : [];
    return [...initial, ...own.filter((a) => !initial.some((b) => b.id === a.id))];
  });
  const usable = assets;
  const [order, setOrder] = useState<string[]>(() => (initial.length ? initial : assets).map((p) => p.id));
  const [libList, setLibList] = useState<Asset[] | null>(null);
  const [libSel, setLibSel] = useState<string[]>([]);
  const [thumbs, setThumbs] = useState<Map<string, Pixels>>(new Map());
  const [kind, setKind] = useState<"carousel" | "single">("carousel");
  const [tpl, setTpl] = useState<Template | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [pix, setPix] = useState<Map<string, Pixels>>(new Map());
  const [busy, setBusy] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>("");
  const [caption, setCaption] = useState("");
  const [toast, setToast] = useState("");
  const [preview, setPreview] = useState<string[] | null>(null);
  const [reframe, setReframe] = useState(false);
  // miniaturas como imágenes, para pintar las plantillas con tus fotos
  useEffect(() => {
    let alive = true;
    for (const a of assets) {
      if (thumbs.has(a.id)) continue;
      const im = new Image();
      im.onload = () => alive && setThumbs((m) => new Map(m).set(a.id, im as unknown as Pixels));
      im.src = a.thumbUrl;
    }
    return () => { alive = false; };
  }, [assets.length]);

  const addAssets = (list: Asset[], select = true) => {
    setAssets((prev) => [...list.filter((a) => !prev.some((b) => b.id === a.id)), ...prev]);
    if (select) setOrder((o) => [...o, ...list.map((a) => a.id).filter((id) => !o.includes(id))]);
  };
  const fromPhone = async () => { const l = await pickPhoneAssets(); if (l.length) addAssets(l); return l; };
  const openEdited = async () => { setLibSel([]); setSheet("edited"); setLibList(await editedAssets()); };
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2400); };
  const center = useRef(0.5); // página a la vista (para añadir cosas ahí)

  /** Las fotos a buen tamaño para el diseño (se preparan una vez). */
  const ensure = async (ids: string[], m = new Map(pix), list = assets) => {
    const missing = ids.filter((id) => id && !m.has(id));
    if (!missing.length) return m;
    setBusy("Preparando las fotos…");
    try {
      for (const id of missing) {
        const a = list.find((x) => x.id === id);
        if (a) m.set(id, await a.load());
      }
    } finally {
      setBusy("");
    }
    setPix(m);
    return m;
  };

  const start = async (t: Template | null) => {
    const b = t ? t.build(order.length ? order : usable.map((p) => p.id)) : blankBoard(3);
    await ensure(b.items.filter((i): i is PhotoItem => i.kind === "photo").map((i) => i.photo));
    setTpl(t);
    setBoard(b);
    setSel(null);
  };

  // ---------------------------------------------------------------- elegir plantilla
  if (!board) {
    const list = kind === "carousel" ? CAROUSELS : [...SINGLES, ...TEMPLATES.filter((t) => !t.carousel)];
    return (
      <div class="screen">
        <div class="topbar">
          <button class="icon-btn" onClick={onBack} aria-label="Atrás">‹</button>
          <div class="title">Diseñar para redes</div>
          <div class="icon-btn"><img src="/mark.png" alt="" class="mark sm" /></div>
        </div>
        <div class="scroll">
          <div class="chips" style={{ padding: "4px 16px 2px" }}>
            <button class={"chip" + (kind === "carousel" ? " on" : "")} onClick={() => setKind("carousel")}>Carrusel continuo</button>
            <button class={"chip" + (kind === "single" ? " on" : "")} onClick={() => setKind("single")}>Una imagen</button>
          </div>
          <p class="muted small pad" style={{ paddingBottom: 0, paddingTop: 8 }}>
            {usable.length ? "Toca las fotos para elegir el orden." : "Elige las fotos: ya editadas en la app o del teléfono."}
          </p>
          <div class="pick-strip">
            <button class="pick add" onClick={openEdited}><span>✓</span>Mis ediciones</button>
            <button class="pick add" onClick={fromPhone}><span>📱</span>Teléfono</button>
            {usable.map((p) => {
              const i = order.indexOf(p.id);
              return (
                <button class={"pick" + (i >= 0 ? " on" : "")} onClick={() => setOrder(i >= 0 ? order.filter((x) => x !== p.id) : [...order, p.id])}>
                  <img src={p.thumbUrl} />
                  {i >= 0 && <span class="num">{i + 1}</span>}
                  {SOURCE_TAG[p.source] && <span class="src">{SOURCE_TAG[p.source]}</span>}
                </button>
              );
            })}
          </div>
          <div class="tpl-grid">
            {kind === "carousel" && (
              <button class="tpl" onClick={() => start(null)}>
                <div class="tpl-blank">＋</div>
                <div class="tpl-name">En blanco</div>
                <div class="muted small">Lienzo libre de 3 páginas</div>
              </button>
            )}
            {list.map((t) => (
              <button class={"tpl" + (t.carousel ? " wide" : "")} onClick={() => start(t)}>
                <TemplatePreview t={t} ids={order} thumbs={thumbs} />
                <div class="tpl-name">{t.name}</div>
                <div class="muted small">{t.carousel ? `${t.build(order).pages} páginas seguidas` : t.format}</div>
              </button>
            ))}
          </div>
        </div>
        {sheet === "edited" && (
          <div class="sheet-bg" onClick={() => setSheet("")}>
            <div class="sheet" onClick={(e) => e.stopPropagation()}>
              <h2>Mis ediciones</h2>
              <p class="muted small" style={{ margin: "0 0 8px" }}>Fotos ya editadas y guardadas en la app. Elige una o varias.</p>
              {libList === null && <div class="spinner" />}
              {libList?.length === 0 && <p class="muted small" style={{ padding: "0 16px" }}>Todavía no hay fotos exportadas en «Mis ediciones».</p>}
              <div class="pick-strip wrap">
                {libList?.map((a) => {
                  const i = libSel.indexOf(a.id);
                  return (
                    <button class={"pick" + (i >= 0 ? " on" : "")} onClick={() => setLibSel(i >= 0 ? libSel.filter((x) => x !== a.id) : [...libSel, a.id])}>
                      <img src={a.thumbUrl} />
                      {i >= 0 && <span class="num">{i + 1}</span>}
                    </button>
                  );
                })}
              </div>
              <button class="btn primary" disabled={!libSel.length} onClick={() => {
                addAssets(libSel.map((id) => libList!.find((a) => a.id === id)!));
                setSheet("");
              }}>Usar {libSel.length || ""} {libSel.length === 1 ? "foto" : "fotos"}</button>
            </div>
          </div>
        )}
        {busy && <div class="overlay"><div><div class="spinner" /><p>{busy}</p></div></div>}
      </div>
    );
  }

  // ---------------------------------------------------------------- editar
  const item = board.items.find((i) => i.id === sel) ?? null;
  const update = (patch: Partial<Item>) => setBoard((b) => b && ({ ...b, items: b.items.map((i) => (i.id === sel ? ({ ...i, ...patch } as Item) : i)) }));
  const add = (it: Item) => { setBoard((b) => b && ({ ...b, items: [...b.items, it] })); setSel(it.id); };
  const remove = () => { setBoard((b) => b && ({ ...b, items: b.items.filter((i) => i.id !== sel) })); setSel(null); };
  const duplicate = () => {
    if (!item) return;
    const copy = { ...item, id: newId(), x: item.x + 0.06, y: item.y + 0.04 } as Item;
    add(copy);
  };
  const addPhoto = async (id: string, list = assets) => {
    await ensure([id], new Map(pix), list);
    const img = (pix.get(id) ?? thumbs.get(id))!;
    const ar = img.width / img.height, { w: pw, h: ph } = pageSize(board, 1);
    const h = 0.5, w = (h * ph * ar) / pw;
    add({ kind: "photo", id: newId(), photo: id, x: center.current - w / 2, y: 0.25, w, h, zoom: 1, ox: 0, oy: 0, radius: 0, shadow: true });
    setSheet("");
  };

  const cutout = async (it: PhotoItem) => {
    setBusy("Recortando a la persona…");
    try {
      const img = pix.get(it.photo) ?? (await ensure([it.photo])).get(it.photo)!;
      const sg = await segment(shrink(img, 640), false);
      if (!sg || !sg.box) { flash("No encuentro a ninguna persona en esta foto."); return; }
      // alfa = máscara de la persona, recortada a su caja
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const g = c.getContext("2d")!;
      const mc = document.createElement("canvas");
      mc.width = sg.person.width; mc.height = sg.person.height;
      const md = mc.getContext("2d")!.createImageData(mc.width, mc.height);
      // umbral suave: el fondo con algo de confianza no deja un velo alrededor; el borde sigue suave
      for (let i = 0; i < sg.person.data.length; i++) {
        const v = sg.person.data[i] / 255, t = Math.max(0, Math.min(1, (v - 0.35) / 0.3));
        md.data[i * 4 + 3] = Math.round(t * t * (3 - 2 * t) * 255);
      }
      mc.getContext("2d")!.putImageData(md, 0, 0);
      g.drawImage(mc, 0, 0, c.width, c.height);
      g.globalCompositeOperation = "source-in";
      g.drawImage(img as CanvasImageSource, 0, 0);
      const b = sg.box, pad = 0.01;
      const bx = Math.max(0, (b.x - pad) * c.width), by = Math.max(0, (b.y - pad) * c.height);
      const bw = Math.min(c.width - bx, (b.w + pad * 2) * c.width), bh = Math.min(c.height - by, (b.h + pad * 2) * c.height);
      const out = document.createElement("canvas");
      out.width = Math.round(bw); out.height = Math.round(bh);
      out.getContext("2d")!.drawImage(c, bx, by, bw, bh, 0, 0, bw, bh);
      setPix(new Map(pix).set(cutKey(it.photo), out));
      const { w: pw, h: ph } = pageSize(board, 1);
      const h = Math.min(0.8, it.h * 1.1), w = (h * ph * (bw / bh)) / pw;
      add({ kind: "photo", id: newId(), photo: it.photo, cutout: true, shadow: true, x: it.x + it.w / 2 - w / 2 + 0.05, y: Math.max(0, 1 - h - 0.02), w, h, zoom: 1, ox: 0, oy: 0, radius: 0 });
      flash("Persona recortada: muévela, gírala o ponla delante de otras fotos.");
    } finally {
      setBusy("");
    }
  };

  const publish = async () => {
    setBusy("Preparando las imágenes…");
    try {
      const files = await exportBoard(board, pix, `phootflow_${tpl?.id ?? "diseno"}`);
      if (session) await saveDesign(session, files, board.format, pageSize(board));
      else await saveStandaloneDesign(files, board.format, pageSize(board));
      setBusy("");
      if (caption.trim()) {
        try { await navigator.clipboard.writeText(caption); flash("Texto copiado: pégalo en la publicación"); } catch { /* sin permiso */ }
      }
      const res = await platform.share(files, caption || undefined);
      if (res === "saved") flash(`${files.length} ${files.length === 1 ? "imagen descargada" : "imágenes descargadas"}`);
      setSheet("");
    } catch (e) {
      setBusy("");
      flash((e as Error).message);
    }
  };

  const openPreview = async () => {
    setBusy("Preparando la vista previa…");
    const files = await exportBoard(board, pix, "vista");
    setPreview(files.map((f) => URL.createObjectURL(f)));
    setBusy("");
  };

  const pages = (d: number) => {
    const n = Math.max(1, Math.min(MAX_PAGES, board.pages + d));
    setBoard({ ...board, pages: n });
  };

  return (
    <div class="screen design">
      <div class="topbar">
        <button class="icon-btn" onClick={() => { setBoard(null); setTpl(null); }} aria-label="Plantillas">‹</button>
        <div class="title">{board.pages > 1 ? `Carrusel · ${board.pages} págs.` : "Diseño"}</div>
        <button class="icon-btn" onClick={openPreview} aria-label="Vista previa">▶</button>
        <button class="btn primary sm" onClick={() => setSheet("publish")}>Publicar</button>
      </div>

      <Strip board={board} pix={pix} sel={sel} setSel={setSel} setBoard={setBoard} reframe={reframe} onCenter={(c) => (center.current = c)} />

      <div class="panel">
        {!item && (
          <div class="tools">
            <button class="tool" onClick={() => setSheet("photo")}><span>＋</span>Foto</button>
            <button class="tool" onClick={() => add({
              kind: "text", id: newId(), text: "Tu texto", x: center.current, y: 0.5, size: 0.06, font: "moderna", color: "#ffffff",
              weight: 700, align: "center", box: null, shadow: true, spacing: 0, upper: false,
            })}><span>Aa</span>Texto</button>
            <button class="tool" onClick={() => add({ kind: "shape", id: newId(), shape: "rect", x: center.current - 0.3, y: 0.4, w: 0.6, h: 0.2, fill: "#ffffff", radius: 0.1 })}><span>◼</span>Forma</button>
            <button class="tool" onClick={() => setSheet("sticker")}><span>✨</span>Sticker</button>
            <button class="tool" onClick={() => setSheet("bg")}><span>🎨</span>Fondo</button>
            <button class="tool" onClick={() => setSheet("pages")}><span>▭</span>Páginas</button>
          </div>
        )}
        {item && (
          <div class="props">
            <div class="chips">
              <button class="chip" onClick={() => setBoard(moveLayer(board, item.id, Infinity))}>⤒ Al frente</button>
              <button class="chip" onClick={() => setBoard(moveLayer(board, item.id, 1))}>↑ Subir</button>
              <button class="chip" onClick={() => setBoard(moveLayer(board, item.id, -1))}>↓ Bajar</button>
              <button class="chip" onClick={duplicate}>⧉ Duplicar</button>
              <button class="chip danger" onClick={remove}>Borrar</button>
            </div>
            <Slider label="Giro" min={-180} max={180} value={Math.round(item.rot ?? 0)} onInput={(v) => update({ rot: v })} />
            {item.kind === "photo" && !item.cutout && (
              <>
                <div class="chips">
                  {(["rect", "circle", "arch"] as Frame[]).map((f) => (
                    <button class={"chip" + ((item.frame ?? "rect") === f ? " on" : "")} onClick={() => update({ frame: f })}>
                      {f === "rect" ? "▭ Marco" : f === "circle" ? "◯ Círculo" : "⌒ Arco"}
                    </button>
                  ))}
                  <button class={"chip" + (reframe ? " on" : "")} onClick={() => setReframe(!reframe)}>✋ Encuadrar foto</button>
                  <button class="chip" onClick={() => setSheet("swap")}>Cambiar foto</button>
                  <button class="chip" onClick={() => cutout(item)}>✂️ Recortar persona</button>
                </div>
                <Slider label="Zoom" min={100} max={300} value={Math.round(item.zoom * 100)} onInput={(v) => update({ zoom: v / 100 })} />
                {(item.frame ?? "rect") === "rect" && <Slider label="Esquinas" min={0} max={50} value={Math.round(item.radius * 100)} onInput={(v) => update({ radius: v / 100 })} />}
                <Slider label="Borde" min={0} max={10} value={Math.round((item.border ?? 0) * 100)} onInput={(v) => update({ border: v / 100 })} />
                <div class="chips">
                  {["#ffffff", "#111111", "#f5efe6", "#d9c3a5", "#e94f86"].map((c) => (
                    <button class={"chip" + ((item.borderColor ?? "#ffffff") === c ? " on" : "")} onClick={() => update({ borderColor: c, border: item.border || 0.03 })}>
                      <span class="dot-c" style={{ background: c }} />
                    </button>
                  ))}
                  <button class={"chip" + (item.shadow ? " on" : "")} onClick={() => update({ shadow: !item.shadow })}>Sombra</button>
                </div>
                {reframe && <p class="hint">Arrastra para mover la foto dentro de su marco.</p>}
              </>
            )}
            {item.kind === "photo" && item.cutout && (
              <div class="chips"><button class={"chip" + (item.shadow !== false ? " on" : "")} onClick={() => update({ shadow: item.shadow === false })}>Sombra</button></div>
            )}
            {item.kind === "text" && (
              <>
                <textarea class="field" rows={2} value={item.text} onInput={(e) => update({ text: (e.target as HTMLTextAreaElement).value })} />
                <div class="chips">
                  {(Object.keys(FONTS) as FontId[]).map((f) => (
                    <button class={"chip" + (item.font === f ? " on" : "")} style={{ fontFamily: FONTS[f].css }} onClick={() => update({ font: f })}>{FONTS[f].name}</button>
                  ))}
                </div>
                <Swatches value={item.color} onPick={(c) => update({ color: c })} />
                <Slider label="Tamaño" min={15} max={250} value={Math.round(item.size * 1000)} onInput={(v) => update({ size: v / 1000 })} />
                <div class="chips">
                  <button class={"chip" + (item.weight >= 700 ? " on" : "")} onClick={() => update({ weight: item.weight >= 700 ? 400 : 700 })}>Negrita</button>
                  <button class={"chip" + (item.upper ? " on" : "")} onClick={() => update({ upper: !item.upper, spacing: !item.upper ? 0.1 : 0 })}>MAYÚS</button>
                  <button class={"chip" + (item.shadow ? " on" : "")} onClick={() => update({ shadow: !item.shadow })}>Sombra</button>
                  <button class={"chip" + (item.box ? " on" : "")} onClick={() => update({ box: item.box ? null : "rgba(0,0,0,.5)" })}>Fondo</button>
                </div>
              </>
            )}
            {item.kind === "sticker" && (
              <Slider label="Tamaño" min={30} max={500} value={Math.round(item.size * 1000)} onInput={(v) => update({ size: v / 1000 })} />
            )}
            {item.kind === "shape" && (
              <>
                <div class="chips">
                  {(["rect", "circle"] as const).map((s) => (
                    <button class={"chip" + (item.shape === s ? " on" : "")} onClick={() => update({ shape: s })}>{s === "rect" ? "▭ Rectángulo" : "◯ Círculo"}</button>
                  ))}
                </div>
                <Swatches value={item.fill} onPick={(c) => update({ fill: c })} />
                <Slider label="Opacidad" min={10} max={100} value={Math.round((item.opacity ?? 1) * 100)} onInput={(v) => update({ opacity: v / 100 })} />
                {item.shape === "rect" && <Slider label="Esquinas" min={0} max={50} value={Math.round((item.radius ?? 0) * 100)} onInput={(v) => update({ radius: v / 100 })} />}
              </>
            )}
          </div>
        )}
      </div>

      {sheet && (
        <div class="sheet-bg" onClick={() => setSheet("")}>
          <div class="sheet" onClick={(e) => e.stopPropagation()}>
            {(sheet === "photo" || sheet === "swap") && (
              <>
                <h2>{sheet === "photo" ? "Añadir foto" : "Cambiar foto"}</h2>
                <div class="pick-strip wrap">
                  <button class="pick add" onClick={openEdited}><span>✓</span>Mis ediciones</button>
                  <button class="pick add" onClick={async () => {
                    const l = await fromPhone();
                    if (!l.length) return;
                    if (sheet === "photo") { for (const a of l) await addPhoto(a.id, [...l, ...assets]); }
                    else { await ensure([l[0].id], new Map(pix), [...l, ...assets]); update({ photo: l[0].id, ox: 0, oy: 0, zoom: 1 }); setSheet(""); }
                  }}><span>📱</span>Teléfono</button>
                  {usable.map((p) => (
                    <button class="pick on" onClick={async () => {
                      if (sheet === "photo") return addPhoto(p.id);
                      await ensure([p.id]);
                      update({ photo: p.id, ox: 0, oy: 0, zoom: 1 });
                      setSheet("");
                    }}><img src={p.thumbUrl} /></button>
                  ))}
                </div>
              </>
            )}
            {sheet === "edited" && (
              <>
                <h2>Mis ediciones</h2>
                <p class="muted small" style={{ margin: "0 0 8px" }}>Fotos ya editadas y guardadas en la app. Elige una o varias.</p>
                {libList === null && <div class="spinner" />}
                {libList?.length === 0 && <p class="muted small" style={{ padding: "0 16px" }}>Todavía no hay fotos exportadas en «Mis ediciones».</p>}
                <div class="pick-strip wrap">
                  {libList?.map((a) => {
                    const i = libSel.indexOf(a.id);
                    return (
                      <button class={"pick" + (i >= 0 ? " on" : "")} onClick={() => setLibSel(i >= 0 ? libSel.filter((x) => x !== a.id) : [...libSel, a.id])}>
                        <img src={a.thumbUrl} />
                        {i >= 0 && <span class="num">{i + 1}</span>}
                      </button>
                    );
                  })}
                </div>
                <button class="btn primary" disabled={!libSel.length} onClick={async () => {
                  const chosen = libSel.map((id) => libList!.find((a) => a.id === id)!);
                  addAssets(chosen);
                  setSheet("");
                  if (board) for (const a of chosen) await addPhoto(a.id, [...chosen, ...assets]);
                }}>Usar {libSel.length || ""} {libSel.length === 1 ? "foto" : "fotos"}</button>
              </>
            )}
            {sheet === "sticker" && (
              <div class="stickers">
                {STICKERS.map((s) => (
                  <button onClick={() => { add({ kind: "sticker", id: newId(), emoji: s, x: center.current, y: 0.4, size: 0.12 }); setSheet(""); }}>{s}</button>
                ))}
              </div>
            )}
            {sheet === "bg" && (
              <>
                <h2>Fondo</h2>
                <Swatches value={board.bg} onPick={(c) => setBoard({ ...board, bg: c, grad: null })} />
                <div class="sub">Degradados</div>
                <div class="swatches">
                  {GRADIENTS.map(([a, b]) => (
                    <button class="sw" style={{ background: `linear-gradient(90deg, ${a}, ${b})` }} onClick={() => setBoard({ ...board, bg: a, grad: { to: b, angle: 0 } })} />
                  ))}
                </div>
              </>
            )}
            {sheet === "pages" && (
              <div class="props">
                <h2>Páginas y formato</h2>
                <div class="row" style={{ padding: "0 16px" }}>
                  <button class="btn sm" disabled={board.pages <= 1} onClick={() => pages(-1)}>− Quitar</button>
                  <div class="grow" style={{ textAlign: "center", fontWeight: 700, color: "var(--strong)" }}>{board.pages} / {MAX_PAGES}</div>
                  <button class="btn sm" disabled={board.pages >= MAX_PAGES} onClick={() => pages(1)}>＋ Añadir</button>
                </div>
                <div class="chips">
                  {FORMATS_DESIGN.map(([f, n]) => <button class={"chip" + (board.format === f ? " on" : "")} onClick={() => setBoard({ ...board, format: f })}>{n}</button>)}
                </div>
                <p class="hint">Instagram admite hasta 10 imágenes por carrusel. Lo que cruza de una página a otra se verá continuo al deslizar.</p>
              </div>
            )}
            {sheet === "publish" && (
              <div class="props" style={{ padding: "4px 0" }}>
                <h2>Publicar</h2>
                <p class="muted small" style={{ margin: 0 }}>
                  {board.pages > 1 ? `${board.pages} imágenes en orden para un carrusel.` : "Una imagen."} Se abrirá el menú
                  Compartir: elige Instagram, TikTok, WhatsApp… y se guarda en Mis ediciones.
                </p>
                <textarea class="field" rows={3} placeholder="Texto de la publicación (se copia para pegarlo)" value={caption}
                  onInput={(e) => setCaption((e.target as HTMLTextAreaElement).value)} />
                <button class="btn primary block" onClick={publish}>Compartir</button>
              </div>
            )}
          </div>
        </div>
      )}
      {preview && <Preview pages={preview} onClose={() => { preview.forEach((u) => URL.revokeObjectURL(u)); setPreview(null); }} />}
      {busy && <div class="overlay"><div><div class="spinner" /><p>{busy}</p></div></div>}
      {toast && <div class="toast">{toast}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ tira continua
function Strip({ board, pix, sel, setSel, setBoard, reframe, onCenter }: {
  board: Board; pix: Map<string, Pixels>; sel: string | null; setSel: (s: string | null) => void;
  setBoard: (f: (b: Board | null) => Board | null) => void; reframe: boolean; onCenter: (x: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState<number | null>(null); // escala; null = una página a la altura
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<null | {
    kind: "move" | "pan" | "handle" | "pinch" | "reframe"; id: string | null; x: number; y: number;
    start?: { rot: number; w: number; h: number; size: number; x: number; y: number; d: number; a: number };
  }>(null);
  const { h: PH } = pageSize(board, PW);
  const W = PW * board.pages;

  useEffect(() => {
    const el = host.current!;
    const fit = () => setView({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  }, []);

  const pageScale = view.h ? (view.h - 36) / PH : 0.4;
  const allScale = view.w ? (view.w - 24) / W : 0.2;
  const s = zoom ?? pageScale;

  useEffect(() => {
    const c = ref.current!;
    c.width = W; c.height = PH;
    paintBoard(c.getContext("2d")!, board, pix, PW, PH);
  }, [board, pix, W, PH]);

  const ctx = () => ref.current!.getContext("2d")!;
  const item = board.items.find((i) => i.id === sel) ?? null;
  const box = item ? itemBox(ctx(), item, PW, PH) : null;

  const toBoard = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * PH };
  };

  const setItem = (id: string, f: (i: Item) => Item) => setBoard((b) => b && ({ ...b, items: b.items.map((i) => (i.id === id ? f(i) : i)) }));

  /** Escala y giro de un elemento alrededor de su centro. */
  const scaleRotate = (id: string, st: NonNullable<NonNullable<typeof gesture.current>["start"]>, k: number, da: number) => {
    setItem(id, (i) => {
      const rot = Math.round((st.rot + da) * 10) / 10;
      if (i.kind === "photo" || i.kind === "shape") {
        const w = Math.max(0.05, st.w * k), h = Math.max(0.03, st.h * k);
        return { ...i, rot, w, h, x: st.x - w / 2, y: st.y - h / 2 };
      }
      return { ...i, rot, size: Math.max(0.01, st.size * k) } as Item;
    });
  };

  const startOf = (it: Item, cx: number, cy: number, px: number, py: number) => ({
    rot: it.rot ?? 0, w: "w" in it ? it.w : 0, h: "h" in it ? it.h : 0, size: "size" in it ? it.size : 0,
    x: cx / PW, y: cy / PH, d: Math.hypot(px - cx, py - cy) || 1, a: Math.atan2(py - cy, px - cx),
  });

  const down = (e: PointerEvent, onHandle = false) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = toBoard(e);
    if (pointers.current.size === 2) {
      // dos dedos: sobre el elemento elegido escala y gira; si no, zoom de la tira
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (item && box) {
        gesture.current = { kind: "pinch", id: item.id, x: 0, y: 0, start: { ...startOf(item, box.x + box.w / 2, box.y + box.h / 2, 0, 0), d, a: ang } };
      } else gesture.current = { kind: "pinch", id: null, x: s, y: 0, start: { rot: 0, w: 0, h: 0, size: 0, x: 0, y: 0, d, a: ang } };
      return;
    }
    if (onHandle && item && box) {
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      gesture.current = { kind: "handle", id: item.id, x: p.x, y: p.y, start: startOf(item, cx, cy, p.x, p.y) };
      return;
    }
    const hit = hitTest(ctx(), board, p.x, p.y, PW, PH);
    if (hit) {
      setSel(hit.id);
      gesture.current = { kind: reframe && hit.id === sel && hit.kind === "photo" ? "reframe" : "move", id: hit.id, x: p.x, y: p.y };
    } else {
      setSel(null);
      gesture.current = { kind: "pan", id: null, x: e.clientX, y: e.clientY };
    }
  };

  const move = (e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch" && pointers.current.size >= 2 && g.start) {
      const [a, b] = [...pointers.current.values()];
      const k = Math.hypot(a.x - b.x, a.y - b.y) / g.start.d;
      const da = ((Math.atan2(b.y - a.y, b.x - a.x) - g.start.a) * 180) / Math.PI;
      if (g.id) scaleRotate(g.id, g.start, k, da);
      else setZoom(Math.max(allScale * 0.9, Math.min(pageScale * 2.5, g.x * k)));
      return;
    }
    const p = toBoard(e);
    if (g.kind === "handle" && g.start && g.id) {
      const cx = g.start.x * PW, cy = g.start.y * PH;
      const k = Math.hypot(p.x - cx, p.y - cy) / g.start.d;
      const da = ((Math.atan2(p.y - cy, p.x - cx) - g.start.a) * 180) / Math.PI;
      scaleRotate(g.id, g.start, k, da);
    } else if (g.kind === "move" && g.id) {
      const dx = (p.x - g.x) / PW, dy = (p.y - g.y) / PH;
      g.x = p.x; g.y = p.y;
      setItem(g.id, (i) => ({ ...i, x: i.x + dx, y: i.y + dy }));
    } else if (g.kind === "reframe" && g.id) {
      const dx = p.x - g.x, dy = p.y - g.y;
      g.x = p.x; g.y = p.y;
      setItem(g.id, (i) => {
        if (i.kind !== "photo") return i;
        const img = pix.get(i.photo);
        if (!img) return i;
        const w = i.w * PW, h = i.h * PH, sc = Math.max(w / img.width, h / img.height) * i.zoom;
        const ex = (img.width * sc - w) / 2, ey = (img.height * sc - h) / 2;
        const cl = (v: number) => Math.max(-1, Math.min(1, v));
        return { ...i, ox: ex > 0.5 ? cl(i.ox + dx / ex) : 0, oy: ey > 0.5 ? cl(i.oy + dy / ey) : 0 };
      });
    } else if (g.kind === "pan") {
      scroller.current!.scrollLeft -= e.clientX - g.x;
      g.x = e.clientX;
    }
  };

  const up = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
  };

  // qué página está a la vista (para añadir cosas ahí)
  const onScroll = () => {
    const el = scroller.current!;
    onCenter((el.scrollLeft + el.clientWidth / 2 - 12) / (PW * s));
  };
  useEffect(onScroll, [s, view.w]);

  return (
    <div class="strip-host" ref={host}>
      <div class="strip-scroll" ref={scroller} onScroll={onScroll}>
        <div class="strip" style={{ width: `${W * s}px`, height: `${PH * s}px` }}>
          <canvas ref={ref} class="board" style={{ width: `${W * s}px`, height: `${PH * s}px` }}
            onPointerDown={(e) => down(e)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
          {Array.from({ length: board.pages }, (_, i) => (
            <>
              {i > 0 && <div class="seam" style={{ left: `${i * PW * s}px` }} />}
              <div class="page-num" style={{ left: `${(i + 0.5) * PW * s}px` }}>{i + 1}</div>
            </>
          ))}
          {item && box && (
            <div class="sel-box" style={{
              left: `${box.x * s}px`, top: `${box.y * s}px`, width: `${box.w * s}px`, height: `${box.h * s}px`,
              transform: `rotate(${item.rot ?? 0}deg)`,
            }}>
              <div class="sel-handle" onPointerDown={(e) => { e.stopPropagation(); down(e, true); }} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>⟲</div>
            </div>
          )}
        </div>
      </div>
      <div class="zoom-btns">
        <button class={zoom !== null && zoom <= allScale * 1.01 ? "on" : ""} onClick={() => setZoom(allScale)}>Ver todo</button>
        <button class={zoom === null ? "on" : ""} onClick={() => setZoom(null)}>Una página</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ vista previa como en Instagram
function Preview({ pages, onClose }: { pages: string[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div class="preview">
      <div class="topbar">
        <button class="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        <div class="title">Vista previa</div>
        <div style={{ width: "44px" }} />
      </div>
      <div class="ig-post">
        <div class="ig-head"><img src="/mark.png" class="ig-av" /><span>tu_cuenta</span></div>
        <div class="ig-slides" ref={ref} onScroll={() => { const el = ref.current!; setI(Math.round(el.scrollLeft / el.clientWidth)); }}>
          {pages.map((u) => <img src={u} />)}
        </div>
        {pages.length > 1 && (
          <div class="dots">{pages.map((_, k) => <span class={"dot" + (k === i ? " on" : "")} />)}</div>
        )}
        <p class="muted small" style={{ textAlign: "center" }}>{pages.length > 1 ? "Desliza como en Instagram" : ""}</p>
      </div>
    </div>
  );
}

function Swatches({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  return (
    <div class="swatches">
      {PALETTE.map((c) => <button class={"sw" + (c === value ? " on" : "")} style={{ background: c }} onClick={() => onPick(c)} />)}
      <label class="sw custom"><input type="color" value={value.startsWith("#") ? value : "#ffffff"} onInput={(e) => onPick((e.target as HTMLInputElement).value)} />+</label>
    </div>
  );
}

function TemplatePreview({ t, ids, thumbs }: { t: Template; ids: string[]; thumbs: Map<string, Pixels> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const b = t.build(ids.slice(0, Math.max(t.photos, 1)));
    const c = ref.current!;
    const pw = t.carousel ? 110 : 160, { h } = pageSize(b, pw);
    c.width = pw * b.pages; c.height = h;
    paintBoard(c.getContext("2d")!, b, thumbs, pw, h);
    const g = c.getContext("2d")!;
    g.strokeStyle = "rgba(255,255,255,.5)"; g.setLineDash([3, 3]);
    for (let i = 1; i < b.pages; i++) { g.beginPath(); g.moveTo(i * pw, 0); g.lineTo(i * pw, h); g.stroke(); }
  }, [t, ids.join(), thumbs.size]);
  return <canvas ref={ref} class="tpl-canvas" />;
}

export type { TextItem };
