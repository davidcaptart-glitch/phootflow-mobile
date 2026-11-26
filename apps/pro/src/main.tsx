import { render } from "preact";
import "@phootflow/core/ui/theme.css";
import "./pro.css";
import { AppUpdates, LicenseGate } from "@phootflow/core/ui";
import { App } from "./App";
import { CHANGELOG } from "./changelog";

/** La de package.json (Vite la pone en `__APP_VERSION__`). */
export const VERSION = __APP_VERSION__;

render(
  // fuera de la licencia: la app se pone al día aunque esté en la pantalla de activación
  <AppUpdates appName="PhootFlow Pro" version={VERSION} changelog={CHANGELOG}>
    <LicenseGate product="pro" appName="PhootFlow Pro" version={VERSION} wordmark="/wordmark.png">
      <App />
    </LicenseGate>
  </AppUpdates>,
  document.getElementById("app")!,
);
