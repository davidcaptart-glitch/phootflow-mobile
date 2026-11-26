import { render } from "preact";
import "@phootflow/core/ui/theme.css";
import "./pro.css";
import { LicenseGate } from "@phootflow/core/ui";
import { App } from "./App";

export const VERSION = "0.1.0";

render(
  <LicenseGate product="pro" appName="PhootFlow Pro" version={VERSION} wordmark="/wordmark.png">
    <App />
  </LicenseGate>,
  document.getElementById("app")!,
);
