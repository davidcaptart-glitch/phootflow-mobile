// PhootFlow Lite: eliges fotos → dices qué quieres editar → editas una (en vivo) → todas quedan igual →
// las compartes o las pones en una plantilla / carrusel para redes.
import { useEffect, useState } from "preact/hooks";
import { DEFAULT_LOOK, Session, platform, setUnsavedWork, styles, type Look } from "@phootflow/core";
import { Start } from "./screens/Start";
import { Choose, type Tools } from "./screens/Choose";
import { Editor } from "./screens/Editor";
import { Results } from "./screens/Results";
import { Design } from "@phootflow/core/ui";
import { liteSources } from "./assets";
import { samplePhotos } from "./samples";
import { Library } from "./screens/Library";
import { openSession } from "./saving";
import type { Asset } from "./assets";

type Screen = "start" | "choose" | "editor" | "results" | "design" | "library" | "studio";

export function App() {
  const [session, setSession] = useState(() => new Session());
  const [screen, setScreen] = useState<Screen>("start");
  const [tools, setTools] = useState<Tools>({ filters: true, bokeh: false, beauty: false, crop: true, bw: false, splash: false });
  const [look, setLook] = useState<Look>({ ...DEFAULT_LOOK, formats: ["ig-feed"] });
  /** Diseño sin sesión (desde el inicio o con fotos de «Mis ediciones»). */
  const [studio, setStudio] = useState<{ assets: Asset[]; back: Screen } | null>(null);
  // fuera del inicio y de «Mis ediciones» hay una edición en curso: la versión nueva espera a que acabe
  useEffect(() => setUnsavedWork(screen !== "start" && screen !== "library"), [screen]);

  const begin = async (sample = false) => {
    const picked = sample ? await samplePhotos() : await platform.pickPhotos();
    if (!picked.length) return;
    const s = new Session();
    s.add(picked);
    setSession(s);
    setScreen("choose");
  };

  const restart = () => {
    setLook({ ...DEFAULT_LOOK, formats: ["ig-feed"] });
    setScreen("start");
  };

  const resume = async (id: string) => {
    const r = await openSession(id);
    if (!r) return;
    // una entrada sin fotos (un diseño hecho desde el inicio) se ve en «Mis ediciones», no en el editor
    if (!r.session.photos.length) { setScreen("library"); return; }
    setSession(r.session);
    setLook(r.look);
    setTools(r.tools);
    setScreen("editor");
  };

  if (screen === "start")
    return <Start onPick={() => begin()} onSample={() => begin(true)} onLibrary={() => setScreen("library")}
      onDesign={() => { setStudio({ assets: [], back: "start" }); setScreen("studio"); }} onContinue={resume} />;
  if (screen === "library")
    return <Library onBack={() => setScreen("start")} onContinue={resume}
      onDesign={(assets) => { setStudio({ assets, back: "library" }); setScreen("studio"); }} />;
  if (screen === "studio" && studio)
    return <Design sources={liteSources({ initial: studio.assets })} onBack={() => setScreen(studio.back)} />;
  if (screen === "choose")
    return (
      <Choose
        session={session} tools={tools} onBack={restart}
        onStyle={(st) => {
          const l = styles.styleLook(st.look);
          const t = { ...tools, ...(st.tools as Partial<Tools>) } as Tools;
          setTools(t);
          session.needSegmentation = !!(t.bokeh || t.beauty || t.splash);
          session.needObjects = !!t.splash;
          session.needPortrait = !!t.beauty;
          setLook(l);
          setScreen("editor");
        }}
        onNext={(t) => {
          setTools(t);
          session.needSegmentation = t.bokeh || t.beauty || t.splash;
          session.needObjects = t.splash;
          session.needPortrait = t.beauty;
          setLook((l) => ({
            ...l,
            bokeh: t.bokeh ? l.bokeh || 45 : 0,
            beauty: t.beauty ? l.beauty || 50 : 0,
            beautyEyes: t.beauty ? l.beautyEyes || 35 : 0,
            beautyTeeth: t.beauty ? l.beautyTeeth || 30 : 0,
            beautyUnder: t.beauty ? l.beautyUnder || 35 : 0,
            alsoBW: t.bw,
            splash: { ...l.splash, on: t.splash },
            formats: t.crop ? (l.formats.length ? l.formats : ["ig-feed"]) : [],
          }));
          setScreen("editor");
        }}
      />
    );
  if (screen === "editor")
    return <Editor session={session} tools={tools} look={look} setLook={setLook} setTools={setTools}
      onBack={() => setScreen("choose")} onDone={() => setScreen("results")} />;
  if (screen === "results")
    return <Results session={session} look={look} tools={tools} onBack={() => setScreen("editor")}
      onDesign={() => setScreen("design")} onRestart={restart} />;
  return <Design sources={liteSources({ session, look })} onBack={() => setScreen("results")} />;
}
