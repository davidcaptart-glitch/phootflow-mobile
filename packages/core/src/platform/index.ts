import type { Platform } from "./types";
import { webPlatform } from "./web";

export type { Platform, PickedPhoto, ShareResult, StorePurchase } from "./types";

// Cuando existan las apps nativas: if (Capacitor.isNativePlatform()) platform = capacitorPlatform;
export let platform: Platform = webPlatform;

/** Para pruebas o para la versión nativa. */
export function setPlatform(p: Platform) {
  platform = p;
}
