// Fotos que se pueden usar en Diseño, vengan de donde vengan: la sesión que se está editando (con su estilo),
// las versiones ya editadas guardadas en «Mis ediciones», o fotos del teléfono tal cual.
import { Renderer, decode, library, platform, toJpeg, type Look, type Pixels, type Session, type Version } from "@phootflow/core";

export type AssetSource = "sesion" | "editada" | "telefono";

export interface Asset {
  id: string;
  source: AssetSource;
  thumbUrl: string;
  /** La imagen para diseñar (≈1600 px). */
  load: () => Promise<Pixels>;
}

const SIDE = 1600;
let shared: Renderer | null = null;

/** Las fotos de la sesión, reveladas con su estilo al usarlas. */
export function sessionAssets(session: Session, look: Look): Asset[] {
  return session.photos.filter((p) => p.stats && p.thumbUrl).map((p) => ({
    id: p.id, source: "sesion", thumbUrl: p.thumbUrl!,
    load: async () => {
      shared ??= new Renderer();
      return session.renderedPixels(shared, p, look, SIDE);
    },
  }));
}

/** Una versión ya editada de «Mis ediciones» (se usa tal cual se exportó). */
export function versionAsset(v: Version): Asset {
  return { id: `v:${v.id}`, source: "editada", thumbUrl: URL.createObjectURL(v.blob), load: () => decode(v.blob, SIDE) };
}

/** Elegir fotos del teléfono (sin editar). */
export async function pickPhoneAssets(): Promise<Asset[]> {
  const picked = await platform.pickPhotos();
  const out: Asset[] = [];
  for (const p of picked) {
    try {
      const thumb = await decode(p.blob, 320);
      out.push({
        id: library.newKey("t"), source: "telefono", thumbUrl: URL.createObjectURL(await toJpeg(thumb, 0.8)),
        load: () => decode(p.blob, SIDE),
      });
    } catch { /* foto que no se puede abrir (p. ej. HEIC en Chrome): se omite */ }
  }
  return out;
}

/** Las versiones editadas guardadas en la app, las más recientes primero. */
export async function editedAssets(): Promise<Asset[]> {
  return (await library.allPhotoVersions()).map(versionAsset);
}
