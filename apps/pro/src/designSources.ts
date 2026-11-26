// Diseñar en Pro: el Diseño común (el de Lite, tipo SCRL) con las fotos de la biblioteca ya reveladas y, si las
// tienen, retocadas; o fotos del teléfono tal cual.
import { decode, library, platform, pro, retouch, toJpeg } from "@phootflow/core";
import type { Asset, DesignSources } from "@phootflow/core/ui";
import { developed } from "./retouch/work";

const SIDE = 1600;

/** Fotos de la biblioteca de Pro (no las rechazadas), las últimas editadas primero. */
async function libraryAssets(): Promise<Asset[]> {
  const [photos, rts] = await Promise.all([pro.catalog.listPhotos(), pro.catalog.listRetouch()]);
  const byId = new Map(rts.map((r) => [r.id, r]));
  return photos
    .filter((p) => p.flag !== -1)
    .sort((a, b) => b.edited - a.edited || b.added - a.added)
    .map((p) => {
      const r = byId.get(p.id);
      const layers = (r?.layers ?? []) as retouch.Layer[];
      const thumb = r?.thumb && layers.length ? r.thumb : p.thumb;
      return {
        id: `cat:${p.id}`,
        source: layers.length ? "retocada" : "biblioteca",
        thumbUrl: thumb ? URL.createObjectURL(thumb) : "",
        load: async () => {
          const base = await developed(p, SIDE);
          if (!layers.length) return base;
          const a = await retouch.loadAssets(layers, base, retouch.emptyAssets());
          return retouch.flatten(retouch.composeAll(base, layers, a));
        },
      };
    });
}

/** Fotos del teléfono, sin editar. */
async function phoneAssets(): Promise<Asset[]> {
  const picked = await platform.pickPhotos();
  const out: Asset[] = [];
  for (const p of picked) {
    try {
      const thumb = await decode(p.blob, 320);
      out.push({
        id: library.newKey("t"), source: "telefono", thumbUrl: URL.createObjectURL(await toJpeg(thumb, 0.8)),
        load: () => decode(p.blob, SIDE),
      });
    } catch { /* foto que no se puede abrir: se omite */ }
  }
  return out;
}

export function proSources(initial: Asset[] = [], own: Asset[] = []): DesignSources {
  return {
    initial,
    own,
    phone: phoneAssets,
    library: {
      label: "Biblioteca", icon: "image", load: libraryAssets,
      empty: "Todavía no hay fotos en la biblioteca: impórtalas en Revelar.",
    },
    save: async () => { /* Pro no guarda copias aparte: se comparten o se descargan */ },
  };
}

export { libraryAssets };
