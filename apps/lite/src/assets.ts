// Fotos que se pueden usar en Diseño, vengan de donde vengan: la sesión que se está editando (con su estilo),
// las versiones ya editadas guardadas en «Mis ediciones», o fotos del teléfono tal cual.
import { Renderer, decode, library, platform, toJpeg, type Look, type Pixels, type Session, type Version } from "@phootflow/core";

import type { Asset, DesignSources } from "@phootflow/core/ui";
import { saveDesign, saveStandaloneDesign } from "./saving";
export type { Asset };

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

/** Lo que el Diseño común necesita en Lite: la sesión (si la hay), «Mis ediciones», el teléfono y dónde guardar. */
export function liteSources(o: { session?: Session; look?: Look; initial?: Asset[] }): DesignSources {
  return {
    initial: o.initial,
    own: o.session && o.look ? sessionAssets(o.session, o.look) : [],
    phone: pickPhoneAssets,
    library: { label: "Mis ediciones", icon: "edited", empty: "Todavía no hay fotos exportadas en «Mis ediciones».", load: editedAssets },
    save: (files, format, size) => (o.session ? saveDesign(o.session, files, format, size) : saveStandaloneDesign(files, format, size)),
    savedIn: "Mis ediciones",
  };
}
