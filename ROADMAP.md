# Hoja de ruta

## Lite
- [ ] Probar en iPhone y Android con fotos reales (HEIC del iPhone, 48 MP, memoria con 100+ fotos).
- [ ] Retocar el recorte de una foto concreta en Resultados (arrastrar el encuadre; `Photo.cropOverride` ya existe).
- [ ] Excluir fotos y avisar de repetidas o movidas (`dhash` y nitidez ya se pueden medir).
- [ ] Guardar la sesión (IndexedDB) para seguir después.
- [ ] Más plantillas y fuentes incluidas (ahora usa las del sistema).
- [ ] Detector de caras de largo alcance para fotos de grupo (el de MediaPipe es de corto alcance; YuNet de
      escritorio por onnxruntime-web).

## Pro (todo en uno)
- [ ] **Revelar** (lo principal, tipo Lightroom): biblioteca, histograma, curvas, HSL por colores, gradación de
      color, detalle, máscaras (pincel, lineal, radial, persona/cielo con IA), recorte y enderezado, presets
      (`.xmp` de Lightroom como en Studio de escritorio), historial y copiar/pegar ajustes entre fotos.
- [ ] **Retocar** (lo útil de Photoshop): capas y máscaras, corrector/tampón/parche, quitar objetos, quitar fondo,
      licuar, retoque de retrato (piel, ojos, dientes, ojeras), texto y logo, modos de fusión.
- [ ] **Diseñar** (Canva completo): ampliar el tablero de Lite con formas, grupos, texto enriquecido, efectos de
      texto, kit de marca, cientos de plantillas, redimensionar a otros formatos, vídeo/GIF animado.
- [ ] RAW en el móvil (DNG/ProRAW; LibRaw en WASM para ARW/NEF).

## Común
- [ ] Desplegar licencias por producto (migración 002 + función) y dominio de las PWA.
- [ ] Apps nativas con Capacitor (`platform/capacitor.ts`) y compras en Google Play / App Store.
- [ ] Publicación directa en Instagram / TikTok (requiere revisión de Meta y TikTok).
