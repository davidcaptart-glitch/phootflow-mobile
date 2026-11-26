// Actualización automática de la PWA. El service worker (vite-plugin-pwa en modo «prompt») descarga la versión
// nueva en segundo plano y la deja esperando; aquí se decide cuándo pasar a ella sin perder nada:
// - al abrir la app (antes de que el usuario toque nada) o cuando pasa a segundo plano, si no hay trabajo sin guardar;
// - si lo hay, se avisa con discreción («Hay una versión nueva · Actualizar») y el usuario elige.
// Mientras está abierta se comprueba cada 30 min, al volver a primer plano y al recuperar la conexión.
// En las apps nativas (Capacitor) no se usa: las actualiza la tienda.

export type UpdateState = "idle" | "ready";
type Listener = (s: { state: UpdateState; unsaved: boolean }) => void;

const EVERY_MS = 30 * 60 * 1000;
/** Tras abrir la app, durante este tiempo una versión lista se aplica sola si aún no se ha tocado nada. */
const LAUNCH_MS = 15 * 1000;
/** Si vuelve a primer plano tras más de esto en segundo plano, se pasa a la versión nueva (si no hay nada sin guardar). */
const BACK_MS = 30 * 1000;

let reg: ServiceWorkerRegistration | null = null;
let state: UpdateState = "idle";
let unsaved = false;
let started = false;
let reloading = false;
let touched = false;
let launchedAt = 0;
let lastCheck = 0;
const listeners = new Set<Listener>();

const emit = () => listeners.forEach((f) => f({ state, unsaved }));

/** La app avisa de si hay una edición en curso que se perdería al recargar. */
export function setUnsavedWork(v: boolean) {
  if (unsaved === v) return;
  unsaved = v;
  emit();
}

export function hasUnsavedWork() {
  return unsaved;
}

export function onUpdate(fn: Listener): () => void {
  listeners.add(fn);
  fn({ state, unsaved });
  return () => { listeners.delete(fn); };
}

/** Pasa ya a la versión nueva (recarga la app). */
export function applyUpdate() {
  const w = reg?.waiting;
  if (!w || reloading) return;
  reloading = true;
  w.postMessage({ type: "SKIP_WAITING" });
  // por si el navegador no avisa del cambio de controlador
  setTimeout(() => location.reload(), 4000);
}

/** Busca una versión nueva en el servidor (sin conexión no hace nada). */
export function checkForUpdate() {
  if (!reg || (typeof navigator.onLine === "boolean" && !navigator.onLine)) return;
  lastCheck = Date.now();
  reg.update().catch(() => {});
}

function ready() {
  if (state === "ready") return;
  state = "ready";
  emit();
  // recién abierta y sin tocar nada: nada que perder
  if (!unsaved && !touched && Date.now() - launchedAt < LAUNCH_MS) applyUpdate();
}

function track(w: ServiceWorker | null) {
  if (!w) return;
  const chk = () => { if (w.state === "installed" && navigator.serviceWorker.controller) ready(); };
  chk();
  w.addEventListener("statechange", chk);
}

/** Registra el service worker y empieza a vigilar versiones nuevas. Solo en la PWA publicada. */
export function startAutoUpdate(url = "/sw.js") {
  if (started || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (!/^https?:$/.test(location.protocol) || import.meta.env?.DEV) return;
  started = true;
  launchedAt = Date.now();
  addEventListener("pointerdown", () => { touched = true; }, { once: true, capture: true });
  // la versión nueva ya manda (desde aquí o desde otra pestaña): la página vieja podría pedir archivos que ya no
  // existen, así que se recarga, salvo con una edición en curso (entonces solo si lo ha pedido el usuario)
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (reloading || !unsaved) { reloading = true; location.reload(); } });

  navigator.serviceWorker.register(url, { scope: "/" }).then((r) => {
    reg = r;
    if (r.waiting && navigator.serviceWorker.controller) ready();
    track(r.installing);
    r.addEventListener("updatefound", () => track(r.installing));
    setInterval(checkForUpdate, EVERY_MS);
    let hiddenAt = 0;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        // No en el acto: al recargar o cerrar, la página también se oculta, y activar la versión nueva a mitad de
        // esa navegación deja la página siguiente pidiendo archivos que ya no existen. Una página que se cierra no
        // llega a ejecutar este temporizador.
        if (state === "ready" && !unsaved)
          setTimeout(() => { if (document.visibilityState === "hidden" && !unsaved) applyUpdate(); }, 1500);
      } else {
        // vuelve tras un rato fuera: es como abrirla de nuevo
        if (state === "ready" && !unsaved && hiddenAt && Date.now() - hiddenAt > BACK_MS) applyUpdate();
        else if (Date.now() - lastCheck > 60 * 1000) checkForUpdate();
        hiddenAt = 0;
      }
    });
    addEventListener("online", checkForUpdate);
  }).catch(() => {});
}
