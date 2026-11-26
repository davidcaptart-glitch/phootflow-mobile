// PhootFlow Pro: todo en uno para profesionales. Revelar (tipo Lightroom, lo principal: biblioteca y revelado no
// destructivo) + Retocar (lo útil de Photoshop) + Diseñar (Canva completo). Misma base que Lite (@phootflow/core).
// Estado: Revelar, Retocar y Diseñar (el de Lite, tipo SCRL); el Diseñar tipo Canva completo, en curso.
import { useEffect, useState } from "preact/hooks";
import { setUnsavedWork } from "@phootflow/core";
import { Design, Icon, ShareApp, type Asset } from "@phootflow/core/ui";
import { libraryAssets, proSources } from "./designSources";
import { Develop } from "./Develop";
import { Library, type Clip } from "./Library";
import { Retouch } from "./retouch/Retouch";
import { RetouchPicker } from "./retouch/Picker";

type Mode = "develop" | "retouch" | "design";

export function App() {
  const [mode, setMode] = useState<Mode>("develop");
  const [open, setOpen] = useState<string | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [sharing, setSharing] = useState(false);
  const [libKey, setLibKey] = useState(0);
  const [retouching, setRetouching] = useState<string | null>(null);
  /** Diseñar: las fotos elegidas en la biblioteca (o las últimas reveladas) ya como fuentes del Diseño común. */
  const [designAssets, setDesignAssets] = useState<{ initial: Asset[]; own: Asset[] } | null>(null);
  const [designKey, setDesignKey] = useState(0);
  const design = async (ids?: string[]) => {
    const all = await libraryAssets();
    const chosen = ids ? ids.map((id) => all.find((a) => a.id === `cat:${id}`)).filter((a): a is Asset => !!a) : [];
    setDesignAssets({ initial: chosen, own: ids ? [] : all.slice(0, 12) });
    setDesignKey((k) => k + 1);
    setMode("design");
  };
  useEffect(() => { if (mode === "design" && !designAssets) void design(); }, [mode]);
  // con una foto abierta en Revelar o en Retocar, la versión nueva espera a que vuelva a la biblioteca
  useEffect(() => setUnsavedWork(open != null || retouching != null || (mode === "design" && !!designAssets)), [open, retouching, mode, designAssets]);

  if (open && mode === "develop")
    return <Develop id={open} clip={clip} setClip={setClip} onBack={() => { setOpen(null); setLibKey((k) => k + 1); }} />;
  if (retouching && mode === "retouch") return <Retouch id={retouching} onBack={() => setRetouching(null)} />;
  if (mode === "design" && designAssets)
    return <Design key={designKey} sources={proSources(designAssets.initial, designAssets.own)} onBack={() => { setMode("develop"); setDesignAssets(null); }} />;

  return (
    <>
      {mode === "develop" ? (
        <Library key={libKey} onOpen={setOpen} clip={clip} onShare={() => setSharing(true)} onDesign={(ids) => void design(ids)} />
      ) : mode === "retouch" ? (
        <RetouchPicker onOpen={setRetouching} />
      ) : (
        <div class="screen">
          <div class="stage-msg"><div class="spinner" /></div>
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
