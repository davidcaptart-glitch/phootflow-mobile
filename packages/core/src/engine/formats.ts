// Formatos por destino: el usuario dice PARA QUÉ quiere la foto y se recorta a la proporción y el tamaño
// exactos que pide cada red (tamaños recomendados por cada plataforma; revisar si cambian).
import type { FormatId } from "./types";

export interface Format {
  id: FormatId;
  /** Red o uso (para agrupar en la pantalla). */
  net: string;
  /** Para qué es: lo que ve el usuario. */
  name: string;
  /** Texto corto del chip de resumen. */
  use: string;
  ratio: number; // ancho / alto
  w: number;
  h: number;
  /** La red la muestra en círculo (foto de perfil): la vista previa enseña el círculo. */
  circle?: boolean;
}

const f = (id: string, net: string, name: string, w: number, h: number, circle = false): Format =>
  ({ id, net, name, use: `${net} · ${name}`, ratio: w / h, w, h, circle });

export const FORMATS: Format[] = [
  f("ig-feed", "Instagram", "Publicación (vertical)", 1080, 1350),
  f("ig-square", "Instagram", "Publicación cuadrada", 1080, 1080),
  f("ig-grid", "Instagram", "Publicación 3:4 (cuadrícula nueva)", 1080, 1440),
  f("ig-story", "Instagram", "Historias y Reels", 1080, 1920),
  f("ig-profile", "Instagram", "Foto de perfil", 1080, 1080, true),
  f("tiktok", "TikTok", "Vídeo / foto", 1080, 1920),
  f("tiktok-profile", "TikTok", "Foto de perfil", 1080, 1080, true),
  f("wa-status", "WhatsApp", "Estado", 1080, 1920),
  f("wa-profile", "WhatsApp", "Foto de perfil", 1080, 1080, true),
  f("fb-post", "Facebook", "Publicación", 1080, 1350),
  f("fb-link", "Facebook", "Publicación horizontal", 1200, 630),
  f("fb-cover", "Facebook", "Portada", 1640, 624),
  f("fb-profile", "Facebook", "Foto de perfil", 1080, 1080, true),
  f("x-post", "X", "Publicación", 1600, 900),
  f("x-header", "X", "Cabecera", 1500, 500),
  f("li-post", "LinkedIn", "Publicación", 1200, 627),
  f("li-cover", "LinkedIn", "Portada", 1584, 396),
  f("li-profile", "LinkedIn", "Foto de perfil", 1080, 1080, true),
  f("yt-thumb", "YouTube", "Miniatura", 1280, 720),
  f("pin", "Pinterest", "Pin", 1000, 1500),
  f("print-10x15", "Imprimir", "Copia 10×15 (horizontal)", 1800, 1200),
  f("print-15x10", "Imprimir", "Copia 10×15 (vertical)", 1200, 1800),
];

/** Redes en el orden en que se muestran. */
export const NETWORKS = [...new Set(FORMATS.map((x) => x.net))];

/** Nombres antiguos por proporción (plantillas y sesiones anteriores). */
const ALIASES: Record<string, string> = { "4:5": "ig-feed", "1:1": "ig-square", "9:16": "ig-story", "3:4": "ig-grid", "1.91:1": "fb-link" };

export const formatById = (id: FormatId): Format => FORMATS.find((x) => x.id === (ALIASES[id] ?? id)) ?? FORMATS[0];

/** Tamaño de salida: el exacto de la red; solo si la foto no llega, se reduce (nunca se amplía). */
export function outputSize(fmt: Format, cropW: number, cropH: number) {
  const scale = Math.min(1, cropW / fmt.w, cropH / fmt.h);
  return { w: Math.round(fmt.w * scale), h: Math.round(fmt.h * scale) };
}

/** Etiqueta del archivo exportado. */
export const formatTag = (id: FormatId) => formatById(id).id;
