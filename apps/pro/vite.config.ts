import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";

// `vite build --mode native` (npm run build:native): para Capacitor, sin service worker ni manifiesto de PWA.
export default defineConfig(({ mode }) => ({
  server: { port: 5174, fs: { allow: ["../.."] } },
  preview: { port: 5174 },
  plugins: [
    preact(),
    VitePWA({
      disable: mode === "native",
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png", "wordmark.png", "mark.png"],
      manifest: {
        name: "PhootFlow Pro",
        short_name: "PhootFlow Pro",
        description: "Revelado tipo Lightroom, retoque tipo Photoshop y diseño completo para redes.",
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
}));
