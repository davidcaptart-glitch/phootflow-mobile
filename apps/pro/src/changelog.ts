// Novedades de PhootFlow Pro (la hoja «Novedades de la versión X»). Una entrada por versión publicada, la más
// nueva arriba, con la misma versión que package.json. Frases cortas para quien usa la app, sin tecnicismos.
// Lo usan también las apps nativas (Capacitor) sobre este mismo código.
import type { ChangelogEntry } from "@phootflow/core";

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.2.0",
    date: "2026-11-26",
    title: "Revelar, como en Lightroom",
    items: [
      "Biblioteca con tus fotos: impórtalas, valóralas con estrellas y fíltralas.",
      "Revelado sin tocar el original: luz, blancos y negros, balance, textura, claridad y neblina.",
      "Curvas, mezcla de color por tonos y gradación de color en sombras, medios y luces.",
      "Recorta, endereza, gira y voltea; con perfiles de color y blanco y negro a tu medida.",
      "Presets incluidos y los tuyos; copia los ajustes y pégalos en varias fotos a la vez.",
      "Exporta a tamaño completo y compártelas directamente.",
      "Comparte la app con un código QR.",
      "La app se pone al día sola y te cuenta aquí lo nuevo de cada versión.",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-11-26",
    title: "Primera versión",
    items: [
      "Activa PhootFlow Pro con tu clave.",
      "Revelar, Retocar y Diseñar en una sola app: Retocar y Diseñar llegan en las próximas versiones.",
    ],
  },
];
