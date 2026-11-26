import type { Platform } from "./types";
import { webPlatform } from "./web";
import { createCapacitorPlatform, isNative } from "./capacitor";

export type { Platform, PickedPhoto, ShareResult, StorePurchase } from "./types";
export { PurchaseCancelled, STORE_PRODUCTS } from "./capacitor";

/** Navegador (PWA) → web.ts; app nativa de Android / iOS (Capacitor) → capacitor.ts. Se decide al cargar. */
export let platform: Platform = isNative() ? createCapacitorPlatform() : webPlatform;

/** Para pruebas o para forzar una plataforma. */
export function setPlatform(p: Platform) {
  platform = p;
}
