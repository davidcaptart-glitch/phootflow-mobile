// Guardar en la biblioteca de la app: la sesión (originales + estilo) al llegar a Resultados, y cada versión al
// exportar o publicar. Y recuperarla para seguir editando.
import { DEFAULT_LOOK, Session, library, toJpeg, type ExportItem, type Look, type Version } from "@phootflow/core";
import type { Tools } from "./screens/Choose";

const fmtDate = (t: number) => new Date(t).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

export async function saveSession(session: Session, look: Look, tools: Tools) {
  void library.persist();
  const ok = session.photos.filter((p) => !p.error);
  await library.savePhotos(await Promise.all(ok.map(async (p) => ({
    id: p.id, sessionId: session.id, name: p.name, original: p.blob,
    thumb: p.thumb ? await toJpeg(p.thumb, 0.8) : null,
  }))));
  const guide = session.guide;
  const prev = await library.getSession(session.id);
  await library.saveSession({
    id: session.id,
    title: prev?.title ?? `${fmtDate(session.created)} · ${ok.length} ${ok.length === 1 ? "foto" : "fotos"}`,
    created: session.created, updated: Date.now(), look, tools: { ...tools },
    photoIds: ok.map((p) => p.id), guideId: session.guideId,
    cover: guide?.thumb ? await toJpeg(guide.thumb, 0.8) : null,
    people: session.people,
    crops: Object.fromEntries(ok.filter((p) => Object.keys(p.cropOverride).length).map((p) => [p.id, { ...p.cropOverride }])),
  });
}

export async function saveExports(session: Session, items: ExportItem[]) {
  const now = Date.now();
  await library.addVersions(items.map((it, i): Version => ({
    id: library.newKey("v"), sessionId: session.id, photoId: it.photoId, kind: "photo", format: it.format, bw: it.bw,
    name: it.file.name, blob: it.file, width: it.width, height: it.height, created: now + i,
  })));
}

/** Un diseño hecho sin sesión (desde el inicio o con fotos de «Mis ediciones»): se guarda como su propia entrada. */
export async function saveStandaloneDesign(files: File[], format: string, size: { w: number; h: number }) {
  const s = new Session();
  await library.saveSession({
    id: s.id, title: `Diseño · ${fmtDate(s.created)}`, created: s.created, updated: Date.now(),
    look: { ...DEFAULT_LOOK }, tools: {}, photoIds: [], guideId: null, cover: files[0] ?? null,
  });
  await saveDesign(s, files, format, size);
}

export async function saveDesign(session: Session, files: File[], format: string, size: { w: number; h: number }) {
  const now = Date.now();
  await library.addVersions(files.map((f, i): Version => ({
    id: library.newKey("v"), sessionId: session.id, photoId: null, kind: "design", format, bw: false, page: i,
    name: f.name, blob: f, width: size.w, height: size.h, created: now + i,
  })));
}

/** Rehace una sesión guardada (fotos originales, guía, estilo y herramientas) para seguir editando. */
export async function openSession(id: string): Promise<{ session: Session; look: Look; tools: Tools } | null> {
  const s = await library.getSession(id);
  if (!s) return null;
  const photos = await library.sessionPhotos(id);
  const order = new Map(s.photoIds.map((pid, i) => [pid, i]));
  photos.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const session = new Session();
  session.id = s.id;
  session.created = s.created;
  session.add(photos.map((p) => ({ id: p.id, name: p.name, blob: p.original })));
  session.guideId = s.guideId && photos.some((p) => p.id === s.guideId) ? s.guideId : photos[0]?.id ?? null;
  for (const p of session.photos) p.cropOverride = { ...(s.crops?.[p.id] ?? {}) };
  // las personas con sus nombres y uniones, sin las fotos que ya no estén
  const ids = new Set(photos.map((p) => p.id));
  session.people = s.people?.map((x) => ({ ...x, photoIds: x.photoIds.filter((id) => ids.has(id)), faces: x.faces.filter((f) => ids.has(f.photoId)) })) ?? null;
  const tools = s.tools as unknown as Tools;
  session.needSegmentation = !!(tools.bokeh || tools.beauty || tools.splash);
  session.needObjects = !!tools.splash;
  session.needPortrait = !!tools.beauty;
  return { session, look: s.look, tools };
}
