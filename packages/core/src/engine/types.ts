// Tipos comunes a Lite y Pro. Sin DOM: se usan igual en la PWA y en las apps nativas (Capacitor).

/** Lo que el usuario decide en la foto guía y se aplica a todas. */
export interface Look {
  /** id del LUT del catálogo (o null: sin filtro). */
  lut: string | null;
  /** 0..1: intensidad del filtro. */
  lutAmount: number;
  /** Desenfoque de fondo 0..100 (0 = apagado). */
  bokeh: number;
  /** Filtro de belleza 0..100 (piel suavizada y tono igualado; 0 = apagado). */
  beauty: number;
  /** Retrato completo, dentro de Belleza (0..100 cada uno): ojos más vivos, dientes, ojeras. */
  beautyEyes: number;
  beautyTeeth: number;
  beautyUnder: number;
  /** Exportar también una versión en blanco y negro. */
  alsoBW: boolean;
  /** LUT de B/N para esa versión (null: B/N neutro propio). */
  bwLut: string | null;
  /** Formatos de redes sociales a exportar (vacío = proporción original). */
  formats: FormatId[];
  /** Ajustes finos del usuario sobre lo automático (todos 0 = como lo propone la app). */
  light: Light;
  grain: number; // 0..100
  vignette: number; // 0..100
  /** Color selectivo: lo elegido se queda en color y el resto pasa a B/N. */
  splash: Splash;
  /** Enderezar el horizonte de cada foto automáticamente. */
  straighten: boolean;
  /** Si la foto se queda corta para un destino, ampliarla con IA hasta su tamaño exacto (si no, sale más pequeña). */
  aiResize: boolean;
  /** Efecto velocidad 0..100 (fondo barrido, persona nítida) y su dirección en grados (0 = horizontal). */
  speed: number;
  speedAngle: number;
}

/** Elemento que reconoce la IA (ids de ELEMENTS en ai/vision.ts: ropa, pelo, cara, coche, perro…). */
export type SplashPart = string;

export interface Splash {
  on: boolean;
  /** Tonos que se conservan (grados 0..360). Vacío = cualquier color. */
  hues: number[];
  /** Margen del tono en grados (10..60). */
  tolerance: number;
  /** Elementos que se conservan. Vacío = toda la foto. Con tonos y elementos, han de cumplirse los dos. */
  parts: SplashPart[];
}

export const NO_SPLASH: Splash = { on: false, hues: [], tolerance: 28, parts: [] };

/** Ajustes de luz y color. En el Look son desplazamientos sobre lo automático de cada foto. */
export interface Light {
  exposure: number; // EV, -3..3
  contrast: number; // -100..100
  warmth: number; // -100..100 (temperatura)
  tint: number; // -100..100 (verde ↔ magenta)
  saturation: number; // -100..100
  highlights: number; // -100..100
  shadows: number; // -100..100
}

export const ZERO_LIGHT: Light = {
  exposure: 0, contrast: 0, warmth: 0, tint: 0, saturation: 0, highlights: 0, shadows: 0,
};

export const DEFAULT_LOOK: Look = {
  lut: null, lutAmount: 1, bokeh: 0, beauty: 0, beautyEyes: 0, beautyTeeth: 0, beautyUnder: 0, alsoBW: false, bwLut: null, formats: [],
  light: { ...ZERO_LIGHT }, grain: 0, vignette: 0, splash: NO_SPLASH, straighten: false, aiResize: true, speed: 0, speedAngle: 0,
};

/** Destino de la foto (id de FORMATS en engine/formats.ts: "ig-story", "ig-profile"…). */
export type FormatId = string;

/** Caja normalizada 0..1 respecto a la imagen. */
export interface Box { x: number; y: number; w: number; h: number; }

/** Lo que se mide de cada foto (a baja resolución) para editarlas todas con coherencia. */
export interface PhotoStats {
  width: number;
  height: number;
  /** Luminancia media (log2, lineal) ponderada: centro y caras pesan más. */
  logMid: number;
  /** Percentiles 2 y 98 de luminancia lineal. */
  p2: number;
  p98: number;
  /** Desviación de color media (gris mundial), en log2 de R/G y B/G sobre zonas casi neutras. */
  castRG: number;
  castBG: number;
  /** Caras detectadas (normalizadas). */
  faces: Box[];
  /** Caja que contiene a las personas (de la máscara de segmentación), si hay. */
  people: Box | null;
  /** Inclinación medida (grados, positiva = el horizonte sube a la derecha). */
  tilt?: number;
}

/** Ajuste final por foto que entra en el revelado (lo automático + el Look). */
export interface Develop extends Light {
  /** Ganancias de balance de blancos sobre RGB lineal. */
  wbR: number;
  wbB: number;
}
