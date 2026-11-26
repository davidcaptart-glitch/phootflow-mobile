// Novedades de PhootFlow Lite (la hoja «Novedades de la versión X»). Una entrada por versión publicada, la más
// nueva arriba, con la misma versión que package.json. Frases cortas para quien usa la app, sin tecnicismos.
// Lo usan también las apps nativas (Capacitor) sobre este mismo código.
import type { ChangelogEntry } from "@phootflow/core";

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.2.0",
    date: "2026-11-26",
    title: "Nuevo diseño «Inmersiva»",
    items: [
      "La foto ocupa toda la pantalla y los controles flotan encima, como cristal.",
      "Al abrir la app ves la portada de tu última sesión y puedes seguir editando donde lo dejaste.",
      "Filtros en círculo y una regla para ajustar la intensidad con el dedo.",
      "Antes de editar te avisa de las fotos repetidas o movidas y puedes quitarlas.",
      "Ajusta a mano el encuadre de cualquier foto en los resultados.",
      "Los nombres de las personas se guardan con la sesión.",
      "Belleza más natural: suaviza la piel sin desdibujar los ojos, las cejas ni la boca.",
      "Diseñar: capas, grupos, imán al mover, más formas y efectos de texto, y otros formatos de redes.",
      "Exporta tus diseños como vídeo para Reels, Historias y TikTok (con tu música) o como GIF.",
      "Comparte la app con un código QR para que otra persona la instale en un momento.",
      "La app se pone al día sola y te cuenta aquí lo nuevo de cada versión.",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-11-26",
    title: "Primera versión",
    items: [
      "Edita una foto y todas las de la sesión quedan igual.",
      "Filtros, blanco y negro, color selectivo, desenfoque de fondo y retoque de belleza.",
      "Recorte para cada red: Instagram, TikTok, WhatsApp, Facebook y más, con su tamaño exacto.",
      "Plantillas y carruseles para redes con tus fotos.",
      "Todo se hace en el móvil: tus fotos no salen del teléfono.",
    ],
  },
];
