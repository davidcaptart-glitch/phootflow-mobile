// Plataforma web (PWA). Ver types.ts para su equivalente nativo.
import type { PickedPhoto, Platform, ShareResult } from "./types";

const PREFIX = "phootflow:";

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function download(file: File) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export const webPlatform: Platform = {
  kind: "web",

  pickPhotos() {
    return new Promise<PickedPhoto[]>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*,.heic,.heif,.dng";
      input.multiple = true;
      input.style.display = "none";
      input.onchange = () => {
        resolve(Array.from(input.files ?? [], (f) => ({ name: f.name, blob: f })));
        input.remove();
      };
      input.addEventListener("cancel", () => { resolve([]); input.remove(); });
      document.body.appendChild(input);
      input.click();
    });
  },

  canShareFiles(files) {
    return typeof navigator.canShare === "function" && navigator.canShare({ files });
  },

  async share(files, text): Promise<ShareResult> {
    if (this.canShareFiles(files)) {
      try {
        await navigator.share({ files, text });
        return "shared";
      } catch (e) {
        if ((e as DOMException).name === "AbortError") return "cancelled";
      }
    }
    await this.saveFiles(files);
    return "saved";
  },

  async saveFiles(files) {
    for (const f of files) {
      download(f);
      await new Promise((r) => setTimeout(r, 250)); // algunos navegadores bloquean descargas seguidas
    }
  },

  async deviceId() {
    // El navegador no da un id del aparato: se crea uno al azar y se guarda. Si se borran los datos del
    // navegador cambia, y la licencia se libera desde la administración (como al cambiar de PC).
    let id = localStorage.getItem(PREFIX + "huella");
    if (!id) {
      id = hex(crypto.getRandomValues(new Uint8Array(32)));
      localStorage.setItem(PREFIX + "huella", id);
    }
    return id;
  },

  deviceName() {
    const ua = navigator.userAgent;
    const m = ua.match(/\(([^)]+)\)/);
    const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua)
      ? (m?.[1].split(";").map((s) => s.trim()).find((s) => s && !/Android|Linux|wv|^K$/.test(s)) ?? "Android")
      : /Windows/.test(ua) ? "Windows (navegador)" : /Mac/.test(ua) ? "Mac (navegador)" : "Navegador";
    return os.slice(0, 80);
  },

  async kvGet(key) {
    const v = localStorage.getItem(PREFIX + key);
    return v == null ? null : JSON.parse(v);
  },

  async kvSet(key, value) {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  },

  purchase: null,
  restorePurchases: null,
};
