// App nativa de PhootFlow Lite (Android / iOS) con Capacitor. Ver «Apps nativas» en el README.
// La web que se empaqueta es dist/ compilada con `npm run build:native` (sin service worker).
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.phootflow.lite",
  appName: "PhootFlow Lite",
  webDir: "dist",
  backgroundColor: "#05070f",
  android: {
    // la web se sirve desde https://localhost dentro de la app (cámara, WebGL2, crypto.subtle…)
    allowMixedContent: false,
  },
  ios: {
    contentInset: "never",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: "#05070f",
      showSpinner: false,
      androidScaleType: "CENTER_INSIDE",
    },
  },
};

export default config;
