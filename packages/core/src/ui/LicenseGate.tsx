// Pantalla de activación común a Lite y Pro. En las apps nativas añadirá «Comprar» y «Restaurar compras»
// (platform.purchase / restorePurchases); en la PWA se activa con la clave que manda David.
import { useEffect, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import * as L from "../license/license";
import { platform } from "../platform";

interface Props {
  product: L.Product;
  appName: string;
  version: string;
  wordmark: string;
  /** Logo solo (símbolo), se muestra grande. */
  mark?: string;
  children: ComponentChildren;
}

export function LicenseGate({ product, appName, version, wordmark, mark = "/mark.png", children }: Props) {
  const [st, setSt] = useState<L.Status | null>(null);
  const [clave, setClave] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [devSkip, setDevSkip] = useState(false);

  useEffect(() => {
    let alive = true;
    // comprobar en línea sin bloquear si ya vale; cada 6 h mientras la app esté abierta
    const check = () => L.refresh(product, version).then((n) => alive && setSt(n));
    const t = setInterval(check, 6 * 3600 * 1000);
    L.evaluate(product).then((s) => {
      if (!alive) return;
      setSt(s);
      if (s.ok || s.clave) void check();
    });
    return () => { alive = false; clearInterval(t); };
  }, [product, version]);

  if (devSkip || st?.ok) return <>{children}</>;
  if (!st) return <div class="screen"><div class="overlay"><div class="spinner" /></div></div>;

  const go = async () => {
    setBusy(true);
    setErr("");
    try {
      const s = await L.activate(product, clave, version);
      setSt(s);
      if (!s.ok) setErr(s.message);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="screen">
      <div class="scroll pad" style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: "18px" }}>
        <div class="mark-wrap"><img src={mark} alt="" class="mark" /></div>
        <img src={wordmark} alt="PhootFlow" class="wordmark" style={{ height: "24px", alignSelf: "center" }} />
        <div>
          <h1>Activa {appName}</h1>
          <p class="muted" style={{ margin: 0 }}>
            {st.code === "sin_licencia" ? "Escribe la clave de activación que te han enviado." : st.message}
          </p>
        </div>
        <input
          class="field" placeholder="PF-XXXXX-XXXXX-XXXXX-XXXXX" value={clave} autocapitalize="characters"
          autocomplete="off" spellcheck={false} onInput={(e) => setClave((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
        />
        {err && <div class="error">{err}</div>}
        <button class="btn primary block" disabled={busy || !clave.trim()} onClick={go}>
          {busy ? "Comprobando…" : "Activar"}
        </button>
        {platform.purchase && (
          <button class="btn ghost block" onClick={() => platform.purchase!(product)}>Comprar {appName}</button>
        )}
        <p class="muted small" style={{ margin: 0 }}>
          La clave queda vinculada a este móvil y funciona hasta 7 días sin conexión.
        </p>
        {import.meta.env.DEV && (
          <button class="btn ghost sm" onClick={() => setDevSkip(true)}>Seguir sin licencia (solo en desarrollo)</button>
        )}
      </div>
    </div>
  );
}
