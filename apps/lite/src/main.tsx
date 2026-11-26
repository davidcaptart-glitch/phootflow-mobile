import { render } from "preact";
import "@phootflow/core/ui/theme.css";
import "./lite.css";
import { LicenseGate } from "@phootflow/core/ui";
import { App } from "./App";

export const VERSION = "0.1.0";

render(
  <LicenseGate product="lite" appName="PhootFlow Lite" version={VERSION} wordmark="/wordmark.png">
    <App />
  </LicenseGate>,
  document.getElementById("app")!,
);
