import { useEffect, useState } from "preact/hooks";
import { library } from "@phootflow/core";

export function Start({ onPick, onSample, onLibrary, onDesign }: { onPick: () => void; onSample: () => void; onLibrary: () => void; onDesign: () => void }) {
  const [saved, setSaved] = useState(0);
  useEffect(() => { library.listSessions().then((s) => setSaved(s.length)).catch(() => {}); }, []);
  return (
    <div class="screen start">
      <div class="scroll pad start-body">
        <div class="mark-wrap"><img src="/mark.png" alt="PhootFlow" class="mark" /></div>
        <div class="row" style={{ justifyContent: "center" }}>
          <img src="/wordmark.png" alt="PhootFlow" class="wordmark" />
          <span class="badge">Lite</span>
        </div>
        <div class="hero">
          <h1>Edita una.<br /><span class="grad-text">Todas quedan igual.</span></h1>
          <p class="muted">
            Elige tus fotos, edita una a tu gusto y PhootFlow aplica el mismo estilo al resto, ajustando la luz y el
            color de cada una. Después, súbelas a tus redes o haz un carrusel.
          </p>
        </div>
        <ul class="steps">
          <li><span>1</span> Elige las fotos</li>
          <li><span>2</span> Dinos qué quieres editar</li>
          <li><span>3</span> Edita una foto en vivo</li>
          <li><span>4</span> Comparte o diseña para redes</li>
        </ul>
      </div>
      <div class="bottombar" style={{ display: "grid", gap: "10px" }}>
        <button class="btn primary block" onClick={onPick}>Elegir fotos</button>
        <div class="row">
          <button class="btn grow" onClick={onDesign}>🖼️ Diseñar para redes</button>
          {saved > 0 && <button class="btn grow" onClick={onLibrary}>Mis ediciones ({saved})</button>}
        </div>
        {import.meta.env.DEV && <button class="btn ghost block sm" onClick={onSample}>Fotos de ejemplo (desarrollo)</button>}
        <p class="muted small" style={{ textAlign: "center", margin: 0 }}>Las fotos no salen de tu móvil.</p>
      </div>
    </div>
  );
}
