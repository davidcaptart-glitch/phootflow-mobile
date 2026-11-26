// Plataforma nativa (Android / iOS con Capacitor). Misma interfaz que web.ts (ver types.ts).
//   pickPhotos     -> @capacitor/camera chooseFromGallery (selector de fotos del sistema, varias a la vez)
//   share          -> @capacitor/filesystem (copia en la caché) + @capacitor/share (menú Compartir del sistema)
//   saveFiles      -> @capacitor-community/media (álbum «PhootFlow» en Galería / Fotos)
//   deviceId       -> @capacitor/device getId(): no cambia al borrar los datos de la app
//   kv             -> @capacitor/preferences
//   purchase       -> RevenueCat (@revenuecat/purchases-capacitor): Google Play Billing y StoreKit
// Los plugins de compras y galería se cargan solo al usarlos: la PWA no carga nada de esto.
import { Capacitor } from "@capacitor/core";
import { Camera, MediaTypeSelection } from "@capacitor/camera";
import { Device } from "@capacitor/device";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Preferences } from "@capacitor/preferences";
import { Share } from "@capacitor/share";
import type { PickedPhoto, Platform, ShareResult, StorePurchase } from "./types";

const PREFIX = "phootflow:";
const ALBUM = "PhootFlow";

/** Id de cada producto en Google Play Console y App Store Connect (compra única, no suscripción). */
export const STORE_PRODUCTS: Record<"lite" | "pro", string> = { lite: "phootflow_lite", pro: "phootflow_pro" };

/** Claves PÚBLICAS del SDK de RevenueCat (goog_… / appl_…). Se leen al compilar de `.env.local` (fuera de git);
 *  sin ellas la app no ofrece «Comprar» y se activa con clave, como la PWA. */
const RC_KEYS = {
  android: import.meta.env.VITE_REVENUECAT_ANDROID_KEY as string | undefined,
  ios: import.meta.env.VITE_REVENUECAT_IOS_KEY as string | undefined,
};

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",", 2)[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

const safeName = (n: string) => n.replace(/[^\w.\-]+/g, "_").slice(-120) || "foto.jpg";

/** Copia los archivos en la caché de la app y devuelve sus URI nativas (para Compartir o para la galería). */
async function writeCache(files: File[]): Promise<string[]> {
  const stamp = Date.now();
  const uris: string[] = [];
  for (const [i, f] of files.entries()) {
    const { uri } = await Filesystem.writeFile({
      path: `compartir/${stamp}-${i}-${safeName(f.name)}`,
      data: await blobToBase64(f),
      directory: Directory.Cache,
      recursive: true,
    });
    uris.push(uri);
  }
  return uris;
}

async function clearShareCache() {
  try {
    await Filesystem.rmdir({ path: "compartir", directory: Directory.Cache, recursive: true });
  } catch { /* no había nada */ }
}

let albumId: Promise<string | undefined> | null = null;

/** En Android hay que guardar en un álbum (carpeta); en iOS basta con la fototeca. */
function galleryAlbum(kind: Platform["kind"]): Promise<string | undefined> {
  if (kind !== "android") return Promise.resolve(undefined);
  albumId ??= (async () => {
    const { Media } = await import("@capacitor-community/media");
    const find = async () => (await Media.getAlbums()).albums.find((a) => a.name === ALBUM)?.identifier;
    let id = await find();
    if (!id) {
      await Media.createAlbum({ name: ALBUM });
      id = await find();
    }
    if (!id) throw new Error("No se ha podido crear el álbum PhootFlow en la galería.");
    return id;
  })().catch((e) => { albumId = null; throw e; });
  return albumId;
}

// ---- compras (RevenueCat) ----

let rcReady: Promise<typeof import("@revenuecat/purchases-capacitor")> | null = null;

function revenueCat(kind: Platform["kind"], appUserID: () => Promise<string>) {
  rcReady ??= (async () => {
    const rc = await import("@revenuecat/purchases-capacitor");
    const apiKey = kind === "ios" ? RC_KEYS.ios : RC_KEYS.android;
    if (!apiKey) throw new Error("Las compras no están configuradas en esta versión.");
    // El usuario de RevenueCat es la huella del móvil: el servidor de licencias lo usa para validar la compra.
    await rc.Purchases.configure({ apiKey, appUserID: await appUserID() });
    return rc;
  })().catch((e) => { rcReady = null; throw e; });
  return rcReady;
}

/** Lo que se manda al servidor de licencias. Lo valida con la API de RevenueCat (clave secreta solo en el servidor). */
function receipt(appUserId: string, t: { transactionIdentifier: string; productIdentifier: string; purchaseToken?: string | null }) {
  return JSON.stringify({
    proveedor: "revenuecat", app_user_id: appUserId, transaccion: t.transactionIdentifier,
    producto_tienda: t.productIdentifier, purchase_token: t.purchaseToken ?? null,
  });
}

const productFromStoreId = (id: string): "lite" | "pro" | null =>
  id.startsWith(STORE_PRODUCTS.pro) ? "pro" : id.startsWith(STORE_PRODUCTS.lite) ? "lite" : null;

export class PurchaseCancelled extends Error {
  constructor() { super("Compra cancelada."); }
}

// ---- plataforma ----

export function createCapacitorPlatform(): Platform {
  const kind = Capacitor.getPlatform() === "ios" ? "ios" : "android";
  const store: StorePurchase["store"] = kind === "ios" ? "app_store" : "google_play";
  let name = kind === "ios" ? "iPhone" : "Android";
  Device.getInfo().then((i) => {
    const model = [i.manufacturer, i.model].filter(Boolean).join(" ").trim();
    if (model) name = model.slice(0, 80);
  }).catch(() => {});

  let huella: Promise<string> | null = null;
  const deviceId = () => (huella ??= (async () => {
    // ANDROID_ID (16 hex) o identifierForVendor (UUID): se pasa por SHA-256 para tener 64 hex y no mandar el id en claro.
    const { identifier } = await Device.getId();
    const data = new TextEncoder().encode("phootflow-movil:" + identifier);
    return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", data)));
  })());

  const hasStore = !!(kind === "ios" ? RC_KEYS.ios : RC_KEYS.android);

  const p: Platform = {
    kind,

    async pickPhotos() {
      let results;
      try {
        ({ results } = await Camera.chooseFromGallery({
          mediaType: MediaTypeSelection.Photo, allowMultipleSelection: true, limit: 0, quality: 100,
          correctOrientation: false,
        }));
      } catch (e) {
        if (/cancel/i.test(String((e as Error)?.message ?? e))) return [];
        throw e;
      }
      const out: PickedPhoto[] = [];
      for (const [i, r] of results.entries()) {
        const src = r.webPath ?? (r.uri ? Capacitor.convertFileSrc(r.uri) : null);
        if (!src) continue;
        const blob = await (await fetch(src)).blob();
        const base = decodeURIComponent((r.uri ?? src).split(/[/?#]/).filter(Boolean).pop() ?? "");
        out.push({ name: /\.\w{3,4}$/.test(base) ? base : `foto-${i + 1}.jpg`, blob });
      }
      return out;
    },

    canShareFiles() {
      return true; // el menú Compartir nativo acepta varios archivos
    },

    async share(files, text): Promise<ShareResult> {
      await clearShareCache();
      const uris = await writeCache(files);
      try {
        await Share.share({ files: uris, text, dialogTitle: "Compartir" });
        return "shared";
      } catch (e) {
        if (/cancel/i.test(String((e as Error)?.message ?? e))) return "cancelled";
        await this.saveFiles(files);
        return "saved";
      }
    },

    async saveFiles(files) {
      const { Media } = await import("@capacitor-community/media");
      const album = await galleryAlbum(kind);
      const uris = await writeCache(files);
      for (const [i, uri] of uris.entries()) {
        await Media.savePhoto({
          path: uri, albumIdentifier: album, fileName: files[i].name.replace(/\.\w+$/, "").slice(0, 80),
        });
      }
    },

    deviceId,

    deviceName() {
      return name;
    },

    async kvGet(key) {
      const { value } = await Preferences.get({ key: PREFIX + key });
      return value == null ? null : JSON.parse(value);
    },

    async kvSet(key, value) {
      await Preferences.set({ key: PREFIX + key, value: JSON.stringify(value) });
    },

    purchase: hasStore
      ? async (product) => {
          const { Purchases, PRODUCT_CATEGORY } = await revenueCat(kind, deviceId);
          const { products } = await Purchases.getProducts({
            productIdentifiers: [STORE_PRODUCTS[product]], type: PRODUCT_CATEGORY.NON_SUBSCRIPTION,
          });
          if (!products.length) throw new Error("Este producto todavía no está disponible en la tienda.");
          try {
            const r = await Purchases.purchaseStoreProduct({ product: products[0] });
            const { appUserID } = await Purchases.getAppUserID();
            return { store, product, receipt: receipt(appUserID, r.transaction) };
          } catch (e) {
            if ((e as { userCancelled?: boolean })?.userCancelled) throw new PurchaseCancelled();
            throw e;
          }
        }
      : null,

    restorePurchases: hasStore
      ? async () => {
          const { Purchases } = await revenueCat(kind, deviceId);
          const { customerInfo } = await Purchases.restorePurchases();
          const { appUserID } = await Purchases.getAppUserID();
          const out: StorePurchase[] = [];
          for (const t of customerInfo.nonSubscriptionTransactions) {
            const product = productFromStoreId(t.productIdentifier);
            if (product) out.push({ store, product, receipt: receipt(appUserID, t) });
          }
          return out;
        }
      : null,
  };
  return p;
}
