import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json";

export default defineConfig({
  // una sola versión: la del package.json (aviso de actualización, «Novedades» y licencia)
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 5173, fs: { allow: ["../.."] } },
  preview: { port: 5173 },
  plugins: [
    preact(),
    VitePWA({
      // «prompt»: la versión nueva se descarga y espera; la app decide cuándo pasar a ella sin perder trabajo
      // (@phootflow/core updates/pwa.ts registra /sw.js, por eso no se inyecta el registro)
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["apple-touch-icon.png", "wordmark.png", "mark.png"],
      manifest: {
        name: "PhootFlow Lite",
        short_name: "PhootFlow Lite",
        description: "Edita una foto y todas quedan igual. Plantillas y carruseles para redes.",
        lang: "es",
        theme_color: "#05070f",
        background_color: "#05070f",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,json}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          // filtros (LUT): se guardan al usarlos
          { urlPattern: /\.bin$/, handler: "CacheFirst", options: { cacheName: "luts", expiration: { maxEntries: 120 } } },
          // modelos de IA servidos por la app (Mejorar con IA, Personas…): se guardan al usarlos
          { urlPattern: /\/modelos\//, handler: "CacheFirst", options: { cacheName: "modelos" } },
          { urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/onnxruntime-web@/, handler: "CacheFirst", options: { cacheName: "ia-motor-onnx" } },
          // IA local (MediaPipe): el motor y los modelos se guardan la primera vez
          { urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\//, handler: "CacheFirst", options: { cacheName: "ia-motor" } },
          { urlPattern: /^https:\/\/storage\.googleapis\.com\/mediapipe-models\//, handler: "CacheFirst", options: { cacheName: "ia-modelos" } },
        ],
      },
    }),
  ],
});
