// Catálogo de Pro (IndexedDB, solo en el móvil): la foto original intacta, su miniatura y sus ajustes.
// Editar no toca nunca el original: los ajustes son un JSON aparte (no destructivo, como Lightroom).
import { normalizeDev, type Dev, type ProPreset } from "./dev";

export interface CatalogPhoto {
  id: string;
  name: string;
  added: number;
  edited: number;
  width: number;
  height: number;
  /** Miniatura revelada con los ajustes actuales (≈480 px). */
  thumb: Blob | null;
  dev: Dev;
  /** Medidas para «Auto» (las del motor común). */
  stats: unknown | null;
  rating: number;            // 0..5
  flag: -1 | 0 | 1;          // rechazada, sin marca, elegida
  /** Si se ha editado algo (para el filtro «Editadas»). */
  touched: boolean;
}

const DB = "phootflow-pro";
// 2: almacén «retouch» (capas de Retocar, una entrada por foto)
const VERSION = 2;

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains("photos")) d.createObjectStore("photos", { keyPath: "id" });
      if (!d.objectStoreNames.contains("originals")) d.createObjectStore("originals");
      if (!d.objectStoreNames.contains("presets")) d.createObjectStore("presets", { keyPath: "id" });
      if (!d.objectStoreNames.contains("retouch")) d.createObjectStore("retouch", { keyPath: "id" });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

async function store(name: string, mode: IDBTransactionMode = "readonly") {
  return (await db()).transaction(name, mode).objectStore(name);
}

export const newId = (p = "f") => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Pide al navegador que no borre el catálogo si falta espacio. */
export async function persist() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}

export async function addPhoto(p: CatalogPhoto, original: Blob) {
  const d = await db();
  const tx = d.transaction(["photos", "originals"], "readwrite");
  tx.objectStore("photos").put(p);
  tx.objectStore("originals").put(original, p.id);
  await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}

export async function listPhotos(): Promise<CatalogPhoto[]> {
  const all = (await req((await store("photos")).getAll())) as CatalogPhoto[];
  return all.map((p) => ({ ...p, dev: normalizeDev(p.dev) })).sort((a, b) => b.added - a.added);
}

export async function getPhoto(id: string): Promise<CatalogPhoto | null> {
  const p = (await req((await store("photos")).get(id))) as CatalogPhoto | undefined;
  return p ? { ...p, dev: normalizeDev(p.dev) } : null;
}

export async function updatePhoto(id: string, patch: Partial<CatalogPhoto>) {
  const s = await store("photos", "readwrite");
  const p = (await req(s.get(id))) as CatalogPhoto | undefined;
  if (!p) return;
  await req(s.put({ ...p, ...patch }));
}

export async function original(id: string): Promise<Blob | null> {
  return ((await req((await store("originals")).get(id))) as Blob | undefined) ?? null;
}

/** Quita la foto del catálogo de la app (la del carrete del móvil no se toca). */
export async function removePhoto(id: string) {
  const d = await db();
  const tx = d.transaction(["photos", "originals", "retouch"], "readwrite");
  tx.objectStore("photos").delete(id);
  tx.objectStore("originals").delete(id);
  tx.objectStore("retouch").delete(id);
  await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}

export async function listPresets(): Promise<ProPreset[]> {
  return ((await req((await store("presets")).getAll())) as ProPreset[]).sort((a, b) => a.name.localeCompare(b.name));
}

export async function savePreset(p: ProPreset) {
  await req((await store("presets", "readwrite")).put(p));
}

export async function deletePreset(id: string) {
  await req((await store("presets", "readwrite")).delete(id));
}

// ------------------------------------------------------------------ Retocar
/** Retoque de una foto (mismo id que la foto): capas de `retouch/layers` y la miniatura con el retoque. */
export interface RetouchRecord { id: string; layers: unknown[]; edited: number; thumb: Blob | null; }

export async function getRetouch(id: string): Promise<RetouchRecord | null> {
  return ((await req((await store("retouch")).get(id))) as RetouchRecord | undefined) ?? null;
}

export async function listRetouch(): Promise<RetouchRecord[]> {
  return (await req((await store("retouch")).getAll())) as RetouchRecord[];
}

export async function saveRetouch(r: RetouchRecord) {
  await req((await store("retouch", "readwrite")).put(r));
}

export async function deleteRetouch(id: string) {
  await req((await store("retouch", "readwrite")).delete(id));
}
