// Biblioteca dentro de la app: cada sesión con sus fotos originales, el estilo (Look) y TODAS las versiones que
// se han hecho (cada destino, en color y en B/N) y los diseños (posts y carruseles). Se guarda en IndexedDB,
// que funciona igual en la PWA y dentro de la app nativa (WebView de Capacitor).
import type { Box, FormatId, Look } from "./engine/types";
import type { Person } from "./ai/people";

export interface SavedSession {
  id: string;
  title: string;
  created: number;
  updated: number;
  look: Look;
  /** Herramientas elegidas en «¿Qué quieres editar?» (para volver al editor igual). */
  tools: Record<string, boolean>;
  photoIds: string[];
  guideId: string | null;
  cover: Blob | null;
  /** Personas encontradas en Resultados, con los nombres y uniones hechos a mano (huellas y caras incluidas). */
  people?: Person[] | null;
  /** Recortes retocados a mano: foto → destino → encuadre. */
  crops?: Record<string, Record<FormatId, Box>>;
}

export interface SavedPhoto {
  id: string;
  sessionId: string;
  name: string;
  original: Blob;
  thumb: Blob | null;
}

export interface Version {
  id: string;
  sessionId: string;
  /** Foto de la que sale (null en un diseño). */
  photoId: string | null;
  kind: "photo" | "design";
  /** Destino (id de FORMATS) o null = proporción original. */
  format: string | null;
  bw: boolean;
  /** Página de un diseño (carrusel). */
  page?: number;
  name: string;
  blob: Blob;
  width: number;
  height: number;
  created: number;
}

const DB = "phootflow-biblioteca";
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore("sessions", { keyPath: "id" });
      d.createObjectStore("photos", { keyPath: "id" }).createIndex("session", "sessionId");
      const v = d.createObjectStore("versions", { keyPath: "id" });
      v.createIndex("session", "sessionId");
      v.createIndex("photo", "photoId");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

const req = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

async function store(name: string, mode: IDBTransactionMode = "readonly") {
  return (await db()).transaction(name, mode).objectStore(name);
}

export const newKey = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Pide al navegador que no borre la biblioteca si falta espacio (en iPhone, solo con la app instalada). */
export async function persist() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}

/** Espacio usado y disponible (bytes), si el navegador lo dice. */
export async function usage(): Promise<{ used: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { used: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch { return null; }
}

// ------------------------------------------------------------------ sesiones
export async function saveSession(s: SavedSession) {
  await req((await store("sessions", "readwrite")).put({ ...s, updated: Date.now() }));
}

export async function listSessions(): Promise<SavedSession[]> {
  const all = await req((await store("sessions")).getAll()) as SavedSession[];
  return all.sort((a, b) => b.updated - a.updated);
}

export async function getSession(id: string): Promise<SavedSession | null> {
  return ((await req((await store("sessions")).get(id))) as SavedSession) ?? null;
}

export async function deleteSession(id: string) {
  for (const name of ["photos", "versions"]) {
    const st = await store(name, "readwrite");
    const keys = await req(st.index("session").getAllKeys(id));
    const st2 = await store(name, "readwrite");
    await Promise.all(keys.map((k) => req(st2.delete(k))));
  }
  await req((await store("sessions", "readwrite")).delete(id));
}

// ------------------------------------------------------------------ fotos
/** Guarda las originales que aún no estén (por id). */
export async function savePhotos(photos: SavedPhoto[]) {
  for (const p of photos) {
    const st = await store("photos", "readwrite");
    if (!(await req(st.getKey(p.id)))) await req((await store("photos", "readwrite")).put(p));
  }
}

export async function sessionPhotos(sessionId: string): Promise<SavedPhoto[]> {
  return req((await store("photos")).index("session").getAll(sessionId)) as Promise<SavedPhoto[]>;
}

// ------------------------------------------------------------------ versiones
export async function addVersions(vs: Version[]) {
  const st = await store("versions", "readwrite");
  await Promise.all(vs.map((v) => req(st.put(v))));
}

export async function sessionVersions(sessionId: string): Promise<Version[]> {
  const all = await req((await store("versions")).index("session").getAll(sessionId)) as Version[];
  return all.sort((a, b) => b.created - a.created);
}

export async function deleteVersion(id: string) {
  await req((await store("versions", "readwrite")).delete(id));
}

/** Tamaño de una imagen guardada. */
export async function imageSize(blob: Blob) {
  const b = await createImageBitmap(blob);
  const s = { width: b.width, height: b.height };
  b.close();
  return s;
}

/** Todas las versiones de fotos editadas (no diseños), las más recientes primero. */
export async function allPhotoVersions(limit = 300): Promise<Version[]> {
  const all = await req((await store("versions")).getAll()) as Version[];
  return all.filter((v) => v.kind === "photo").sort((a, b) => b.created - a.created).slice(0, limit);
}
