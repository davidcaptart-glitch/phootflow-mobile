// Kit de marca: tus colores, tus fuentes y tu logo guardados, para que todos los diseños salgan con tu estilo.
import { useEffect, useState } from "preact/hooks";
import {
  FONT_LIST, addBrandLogo, applyBrand, brandLogoKey, deleteBrand, getActiveBrand, listBrands, newBrand, saveBrand, setActiveBrand,
  type Board, type Brand, type Corner, type Pixels,
} from "../index";
import { Icon } from "./Icon";

const CORNERS: [Corner, string][] = [["arriba-izquierda", "Arriba izq."], ["arriba-derecha", "Arriba der."], ["abajo-izquierda", "Abajo izq."], ["abajo-derecha", "Abajo der."], ["centro", "Centro"]];

/** Carga el logo de la marca como imagen (para pintarlo en el tablero). */
export function loadLogo(b: Brand): Promise<Pixels | null> {
  return new Promise((res) => {
    if (!b.logo) return res(null);
    const im = new Image();
    im.onload = () => res(im as unknown as Pixels);
    im.onerror = () => res(null);
    im.src = b.logo;
  });
}

export function DesignBrand({ board, setBoard, addImage, flash }: {
  board: Board; setBoard: (b: Board) => void; addImage: (key: string, img: Pixels) => void; flash: (m: string) => void;
}) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [b, setB] = useState<Brand | null>(null);
  const [corner, setCorner] = useState<Corner>("abajo-derecha");
  useEffect(() => {
    void (async () => {
      const l = await listBrands();
      setBrands(l);
      setB((await getActiveBrand()) ?? l[0] ?? newBrand());
    })();
  }, []);
  if (!b) return <div class="spinner" />;

  const put = (patch: Partial<Brand>) => setB({ ...b, ...patch });
  const save = async () => { setBrands(await saveBrand(b)); await setActiveBrand(b.id); flash(`Marca «${b.name}» guardada`); };

  return (
    <div class="props" style={{ padding: "4px 0" }}>
      <h2>Kit de marca</h2>
      <div class="chips">
        {brands.map((x) => <button class={"chip" + (x.id === b.id ? " on" : "")} onClick={() => { setB(x); void setActiveBrand(x.id); }}>{x.name}</button>)}
        <button class="chip" onClick={() => setB(newBrand(`Marca ${brands.length + 1}`))}><Icon name="plus" size={15} />Nueva</button>
      </div>
      <input class="field" value={b.name} maxLength={40} onInput={(e) => put({ name: (e.target as HTMLInputElement).value })} />
      <div class="sub">Colores</div>
      <div class="swatches">
        {b.colors.map((c, i) => (
          <label class="sw custom" style={{ background: c }}>
            <input type="color" value={c} onInput={(e) => put({ colors: b.colors.map((x, k) => (k === i ? (e.target as HTMLInputElement).value : x)) })} />
          </label>
        ))}
        {b.colors.length < 8 && <button class="sw custom" aria-label="Añadir color" onClick={() => put({ colors: [...b.colors, "#f50d8a"] })}>+</button>}
        {b.colors.length > 1 && <button class="sw custom" aria-label="Quitar el último color" onClick={() => put({ colors: b.colors.slice(0, -1) })}>−</button>}
      </div>
      <div class="sub">Fuente de los títulos</div>
      <div class="chips">
        {FONT_LIST.map((f) => <button class={"chip" + (b.titleFont === f.id ? " on" : "")} style={{ fontFamily: f.css }} onClick={() => put({ titleFont: f.id })}>{f.name}</button>)}
      </div>
      <div class="sub">Fuente del texto</div>
      <div class="chips">
        {FONT_LIST.map((f) => <button class={"chip" + (b.bodyFont === f.id ? " on" : "")} style={{ fontFamily: f.css }} onClick={() => put({ bodyFont: f.id })}>{f.name}</button>)}
      </div>
      <div class="sub">Logo</div>
      <div class="row" style={{ padding: "0 16px" }}>
        {b.logo && <img src={b.logo} alt="Logo" class="brand-logo" />}
        <label class="btn sm grow" style={{ position: "relative", overflow: "hidden" }}>
          <Icon name="image" size={16} />{b.logo ? "Cambiar el logo" : "Elegir el logo (PNG transparente)"}
          <input type="file" accept="image/*" style={{ position: "absolute", inset: 0, opacity: 0 }} onChange={(e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = () => put({ logo: String(r.result) });
            r.readAsDataURL(f);
          }} />
        </label>
      </div>
      <div style={{ display: "grid", gap: "8px", padding: "12px 16px 0" }}>
        <button class="btn sm" onClick={save}>Guardar la marca</button>
        <button class="btn primary sm" onClick={() => { setBoard(applyBrand(board, b)); flash("Colores y fuentes de tu marca aplicados"); }}>Aplicar colores y fuentes</button>
      </div>
      {b.logo && (
        <>
          <div class="chips" style={{ paddingTop: "10px" }}>
            {CORNERS.map(([c, n]) => <button class={"chip" + (corner === c ? " on" : "")} onClick={() => setCorner(c)}>{n}</button>)}
          </div>
          <div style={{ padding: "8px 16px 0" }}>
            <button class="btn sm block" onClick={async () => {
              const img = await loadLogo(b);
              if (!img) { flash("No se ha podido abrir el logo."); return; }
              addImage(brandLogoKey(b), img);
              const pages = Array.from({ length: board.pages }, (_, i) => i);
              let nb = board;
              for (const page of pages) nb = addBrandLogo(nb, b, { page, corner, aspect: img.width / img.height });
              setBoard(nb);
              flash(board.pages > 1 ? `Logo puesto en las ${board.pages} páginas` : "Logo puesto");
            }}><Icon name="plus" size={16} />Poner el logo{board.pages > 1 ? " en todas las páginas" : ""}</button>
          </div>
        </>
      )}
      {brands.some((x) => x.id === b.id) && (
        <div style={{ padding: "10px 16px 0" }}>
          <button class="btn ghost sm block" onClick={async () => {
            if (!confirm(`¿Borrar la marca «${b.name}»?`)) return;
            const l = await deleteBrand(b.id);
            setBrands(l);
            setB(l[0] ?? newBrand());
          }}><Icon name="trash" size={16} />Borrar la marca</button>
        </div>
      )}
    </div>
  );
}
