// Licencia de las apps móviles. Mismo servidor y mismo token firmado (Ed25519) que el PhootFlow de escritorio
// (license.py), pero con producto «lite» o «pro»: una clave de PC no abre el móvil ni al revés.
// Hoy se activa con clave (PF-…). En las apps nativas, el proveedor «tienda» manda el recibo de la compra
// y el servidor devuelve el mismo token: la comprobación de aquí no cambia (ver LICENCIAS.md, escritorio).
import * as ed from "@noble/ed25519";
import { platform } from "../platform";

export type Product = "lite" | "pro";

export const SERVER = "https://exlegzodfrydddgcvbrp.supabase.co/functions/v1/licencias";
export const PUBLIC_KEY = "25792572162f00f8dd9586b5e9c6b2cd6f85da82d12c4c04816e2438be65b097";
export const CONTACTO = "David";
const RELOJ_TOLERANCIA = 24 * 3600;
const STORE = "licencia";

export interface Token {
  v: number; clave: string; huella: string; estado: string; titular: string;
  emitido: number; hasta: number; caduca: string | null; producto?: string; licencia?: string;
}

export interface Status {
  ok: boolean;
  code: "activa" | "sin_licencia" | "revocada" | "caducada" | "vencida" | "otro_equipo" | "reloj" | "producto";
  message: string;
  titular?: string;
  clave?: string;
  hasta?: number;
}

interface Saved { clave?: string; token?: string | null; visto?: number; }

export class LicenseError extends Error {}

const b64d = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const unhex = (s: string) => Uint8Array.from(s.match(/../g)!.map((h) => parseInt(h, 16)));

export async function decodeToken(token: string | null | undefined, publicKey = PUBLIC_KEY): Promise<Token | null> {
  try {
    const [p, s] = token!.split(".");
    const ok = await ed.verifyAsync(b64d(s), new TextEncoder().encode(p), unhex(publicKey));
    if (!ok) return null;
    const d = JSON.parse(new TextDecoder().decode(b64d(p)));
    return d && typeof d === "object" ? d : null;
  } catch {
    return null;
  }
}

export function normalize(clave: string) {
  return clave.trim().toUpperCase().replace(/\s+/g, "");
}

/** Estado sin conexión, con lo guardado. `product`: la app que pregunta. */
export async function evaluate(product: Product, saved?: Saved, now = Date.now() / 1000,
  publicKey = PUBLIC_KEY): Promise<Status> {
  const d = saved ?? (await platform.kvGet<Saved>(STORE)) ?? {};
  const t = await decodeToken(d.token, publicKey);
  if (!t) return { ok: false, code: "sin_licencia", message: "Escribe tu clave de activación para empezar.", clave: d.clave };
  const base = { titular: t.titular, clave: t.clave, hasta: t.hasta };
  const lic = t.licencia ?? t.producto ?? "escritorio";
  if (!(product === "lite" ? ["lite", "pro"] : ["pro"]).includes(lic))
    return { ok: false, code: "producto", message: "Esta licencia no es de esta app.", ...base };
  if (t.huella !== (await platform.deviceId()))
    return { ok: false, code: "otro_equipo", message: "Esta licencia se activó en otro dispositivo.", ...base };
  if (t.estado === "revocada")
    return { ok: false, code: "revocada", message: `Esta licencia se ha desactivado. Habla con ${CONTACTO}.`, ...base };
  if (t.estado === "caducada")
    return { ok: false, code: "caducada", message: `Esta licencia ha caducado. Habla con ${CONTACTO} para renovarla.`, ...base };
  if (now + RELOJ_TOLERANCIA < Math.max(t.emitido, d.visto ?? 0))
    return { ok: false, code: "reloj", message: "La fecha del móvil está atrasada. Corrígela y vuelve a abrir la app.", ...base };
  if (now > t.hasta)
    return { ok: false, code: "vencida", message: "Hace demasiado que no se comprueba la licencia. Conéctate a internet.", ...base };
  const dias = Math.max(0, Math.floor((t.hasta - now + 3600) / 86400));
  return { ok: true, code: "activa", message: `Licencia activa. Funciona sin conexión ${dias} día(s) más.`, ...base };
}

async function post(body: object, server = SERVER): Promise<{ code: number; body: any }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(server, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal,
    });
    if (r.status >= 500) throw new TypeError("servidor " + r.status);
    return { code: r.status, body: await r.json().catch(() => ({})) };
  } finally {
    clearTimeout(timer);
  }
}

const NOMBRE = { lite: "PhootFlow Lite", pro: "PhootFlow Pro", escritorio: "PhootFlow para PC" } as Record<string, string>;

async function online(product: Product, clave: string, version: string, server = SERVER): Promise<Status> {
  const { code, body } = await post({
    clave, huella: await platform.deviceId(), nombre: platform.deviceName(), version, producto: product,
  }, server);
  const d = (await platform.kvGet<Saved>(STORE)) ?? {};
  if (code === 200 && (await decodeToken(body.token))) {
    const now = Date.now() / 1000;
    await platform.kvSet<Saved>(STORE, { clave, token: body.token, visto: Math.max(d.visto ?? 0, now) });
    return evaluate(product);
  }
  if (code === 404) throw new LicenseError("Esa clave no existe. Revisa que esté bien escrita.");
  if (code === 403 && body.error === "producto_distinto")
    throw new LicenseError(`Esta clave es de ${NOMBRE[body.producto] ?? "otra app"}. Para ${NOMBRE[product]} necesitas una clave de esta app.`);
  if (code === 409)
    throw new LicenseError(`Esta clave ya está en uso en otro dispositivo. Si has cambiado de móvil, pide a ${CONTACTO} que libere el anterior.`);
  if (code === 200) throw new LicenseError("El servidor ha respondido con una firma que no es válida.");
  throw new LicenseError(`El servidor no ha aceptado la petición (${code}).`);
}

export async function activate(product: Product, clave: string, version: string): Promise<Status> {
  clave = normalize(clave);
  if (!clave) throw new LicenseError("Escribe la clave.");
  try {
    return await online(product, clave, version);
  } catch (e) {
    if (e instanceof LicenseError) throw e;
    throw new LicenseError("No hay conexión con el servidor de licencias. Para activar hace falta internet una vez.");
  }
}

/** Comprueba en línea si se puede; sin red, decide con el último token guardado. */
export async function refresh(product: Product, version: string): Promise<Status> {
  const d = (await platform.kvGet<Saved>(STORE)) ?? {};
  if (!d.clave) return evaluate(product);
  try {
    return await online(product, d.clave, version);
  } catch (e) {
    if (e instanceof LicenseError) {
      await platform.kvSet<Saved>(STORE, { ...d, token: null });
      const st = await evaluate(product);
      return { ...st, message: e.message };
    }
    return evaluate(product);
  }
}
