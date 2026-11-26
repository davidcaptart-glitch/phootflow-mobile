// Todo lo que depende de dónde corre la app pasa por aquí. Hoy: navegador (PWA, web.ts).
// Mañana: Android/iOS con Capacitor (capacitor.ts), sin tocar el motor ni las pantallas:
//   pickPhotos  -> @capacitor/camera (pickImages) o un plugin de galería: acceso directo a la fototeca
//   share       -> @capacitor/share (con archivos guardados por @capacitor/filesystem)
//   saveToGallery -> plugin de galería (guardar en Fotos / Galería)
//   deviceId    -> @capacitor/device (getId): huella estable de la licencia
//   kv          -> @capacitor/preferences
//   purchase    -> Google Play Billing / StoreKit (p. ej. RevenueCat o cordova-plugin-purchase)

export interface PickedPhoto {
  /** Nombre original. */
  name: string;
  /** Los bytes de la foto (JPEG, HEIC, PNG…). */
  blob: Blob;
}

export type ShareResult = "shared" | "saved" | "cancelled";

export interface StorePurchase {
  store: "google_play" | "app_store";
  product: "lite" | "pro";
  /** Recibo que el servidor de licencias valida con la tienda. */
  receipt: string;
}

export interface Platform {
  readonly kind: "web" | "android" | "ios";
  pickPhotos(): Promise<PickedPhoto[]>;
  /** Abre el menú Compartir del sistema (Instagram, TikTok, WhatsApp…). Si no hay, descarga los archivos. */
  share(files: File[], text?: string): Promise<ShareResult>;
  /** ¿Se pueden compartir varios archivos a la vez (carrusel)? */
  canShareFiles(files: File[]): boolean;
  saveFiles(files: File[]): Promise<void>;
  /** Huella del dispositivo para la licencia (hex, ≥ 32 caracteres). */
  deviceId(): Promise<string>;
  deviceName(): string;
  kvGet<T>(key: string): Promise<T | null>;
  kvSet<T>(key: string, value: T): Promise<void>;
  /** Compras en la tienda: solo en las apps nativas (null en la PWA, que usa claves). */
  purchase: null | ((product: "lite" | "pro") => Promise<StorePurchase>);
  restorePurchases: null | (() => Promise<StorePurchase[]>);
}
