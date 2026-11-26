// PhootFlow Pro: todo en uno para profesionales. Revelar (tipo Lightroom, lo principal: biblioteca y revelado no
// destructivo) + Retocar (lo útil de Photoshop) + Diseñar (Canva completo). Misma base que Lite (@phootflow/core).
// Estado: Revelar hecho; Retocar y Diseñar, próximas fases (ver ROADMAP.md).
import { useState } from "preact/hooks";
import { Icon, ShareApp } from "@phootflow/core/ui";
import { Develop } from "./Develop";
import { Library, type Clip } from "./Library";

type Mode = "develop" | "retouch" | "design";

export function App() {
  const [mode, setMode] = useState<Mode>("develop");
  const [open, setOpen] = useState<string | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [sharing, setSharing] = useState(false);
  const [libKey, setLibKey] = useState(0);

  if (open && mode === "develop")
    return <Develop id={open} clip={clip} setClip={setClip} onBack={() => { setOpen(null); setLibKey((k) => k + 1); }} />;

  return (
    <>
      {mode === "develop" ? (
        <Library key={libKey} onOpen={setOpen} clip={clip} onShare={() => setSharing(true)} />
      ) : (
        <div class="screen">
          <div class="topbar">
            <img src="/mark.png" alt="PhootFlow" class="mark sm" />
            <div class="title" style={{ alignItems: "flex-start" }}>{mode === "retouch" ? "Retocar" : "Diseñar"}<span class="sub-t">Próximamente</span></div>
          </div>
          <div class="pad soon">
            <Icon name={mode === "retouch" ? "brush" : "carousel"} size={40} />
            <h1>{mode === "retouch" ? "Retoque tipo Photoshop" : "Diseño tipo Canva"}</h1>
            <p class="muted">
              {mode === "retouch"
                ? "Capas, corrector y tampón, quitar objetos y fondos, licuar, retoque de retrato y texto. Llega en la próxima fase."
                : "Diseño completo para redes con tus fotos reveladas: capas, plantillas, kit de marca, texto y vídeo. Llega después del retoque."}
            </p>
          </div>
        </div>
      )}
      <nav class="mode-nav" aria-label="Secciones">
        {([["develop", "image", "Revelar"], ["retouch", "brush", "Retocar"], ["design", "carousel", "Diseñar"]] as [Mode, string, string][]).map(([m, ico, name]) => (
          <button class={"tab" + (mode === m ? " on" : "")} onClick={() => setMode(m)}><Icon name={ico} size={20} />{name}</button>
        ))}
      </nav>
      {sharing && <ShareApp appName="PhootFlow Pro" audience="edición profesional en el móvil" onClose={() => setSharing(false)} />}
    </>
  );
}
