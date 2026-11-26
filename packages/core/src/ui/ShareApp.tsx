// «Compartir la app»: un QR con el enlace de descarga de ESTA app (Lite o Pro) para que otra persona lo escanee,
// y un botón para mandar el enlace. El enlace es la dirección desde la que se ha abierto la app (o el que se pase).
import { useMemo, useState } from "preact/hooks";
import qrcode from "qrcode-generator";
import { Icon } from "./Icon";

/** Dirección pública de la app: la de esta página (en la app nativa futura se pasará `url`). */
export function appUrl(url?: string) {
  if (url) return url;
  const env = (import.meta as { env?: Record<string, string> }).env?.VITE_SHARE_URL;
  return env || (location.protocol.startsWith("http") ? location.origin : "");
}

/** Matriz del QR como un único trazado SVG (nítido a cualquier tamaño). */
function qrPath(text: string) {
  const q = qrcode(0, "H");
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  let d = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
  return { n, d };
}

export function ShareApp({ appName, audience, url, onClose }: {
  appName: string; audience: string; url?: string; onClose: () => void;
}) {
  const link = appUrl(url);
  const { n, d } = useMemo(() => qrPath(link || "https://phootflow.com"), [link]);
  const [msg, setMsg] = useState("");
  const text = `${appName}: ${audience}. Ábrela en el móvil y añádela a la pantalla de inicio.`;

  const send = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: appName, text, url: link }); return; }
    } catch (e) { if ((e as Error).name === "AbortError") return; }
    try { await navigator.clipboard.writeText(link); setMsg("Enlace copiado"); } catch { setMsg(link); }
  };

  return (
    <div class="sheet-bg" onClick={onClose}>
      <div class="sheet share-app" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Compartir ${appName}`}>
        <div class="row" style={{ padding: "0 16px" }}>
          <h2 class="grow" style={{ margin: 0 }}>Compartir {appName}</h2>
          <button class="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        <p class="muted small" style={{ margin: "6px 0 16px" }}>Que la escaneen con la cámara del móvil para descargarla.</p>
        <div class="qr-box">
          <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} role="img" aria-label={`Código QR de ${link}`} shape-rendering="crispEdges">
            <rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" />
            <path d={d} fill="#05070f" />
          </svg>
          <img src="/mark.png" alt="" class="qr-mark" />
        </div>
        <p class="qr-url">{link.replace(/^https?:\/\//, "")}</p>
        <button class="btn primary" onClick={send}><Icon name="share" size={19} />Enviar el enlace</button>
        {msg && <p class="muted small" style={{ textAlign: "center", marginTop: "10px" }}>{msg}</p>}
      </div>
    </div>
  );
}
