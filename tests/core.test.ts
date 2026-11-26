import { describe, expect, it, beforeEach } from "vitest";
import * as ed from "@noble/ed25519";
import { measure } from "../packages/core/src/engine/analyze";
import { autoDevelop, developFor } from "../packages/core/src/engine/congruence";
import { cutsFace, smartCrop } from "../packages/core/src/engine/crop";
import { DEFAULT_LOOK, type PhotoStats } from "../packages/core/src/engine/types";
import { setPlatform, type Platform } from "../packages/core/src/platform";
import * as L from "../packages/core/src/license/license";

/** Foto sintética de un gris uniforme (valor sRGB 0..255), opcionalmente con dominante. */
function flat(v: number, w = 32, h = 24, cast: [number, number, number] = [0, 0, 0]) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    px[i * 4] = v + cast[0]; px[i * 4 + 1] = v + cast[1]; px[i * 4 + 2] = v + cast[2]; px[i * 4 + 3] = 255;
  }
  return px;
}

const stats = (o: Partial<PhotoStats> = {}): PhotoStats => ({
  width: 4000, height: 3000, logMid: Math.log2(0.18), p2: 0.01, p98: 0.8, castRG: 0, castBG: 0, faces: [], people: null, ...o,
});

describe("congruencia", () => {
  it("una foto oscura y una clara de la misma escena acaban casi igual", () => {
    const dark = measure(flat(60), 32, 24);
    const light = measure(flat(150), 32, 24);
    const a = autoDevelop(dark), b = autoDevelop(light);
    expect(a.exposure).toBeGreaterThan(0.5);
    expect(b.exposure).toBeLessThan(0);
    // tras la corrección, la diferencia de luz se reduce al 25 % (EV_STRENGTH = 0.75)
    const before = Math.abs(dark.logMid - light.logMid);
    const after = Math.abs(dark.logMid + a.exposure - (light.logMid + b.exposure));
    expect(after).toBeLessThan(before * 0.3);
  });

  it("quita parte de la dominante de color", () => {
    const warm = measure(flat(120, 32, 24, [25, 0, -25]), 32, 24);
    expect(warm.castRG).toBeGreaterThan(0.2);
    const d = autoDevelop(warm);
    expect(d.wbR).toBeLessThan(1);
    expect(d.wbB).toBeGreaterThan(1);
  });

  it("cada foto se iguala a la guía en luz y dominante", () => {
    const guide = measure(flat(120), 32, 24);
    const other = measure(flat(70, 32, 24, [14, 0, -16]), 32, 24);
    const dg = developFor(guide, DEFAULT_LOOK), dOther = developFor(other, DEFAULT_LOOK, guide);
    const lg = guide.logMid + dg.exposure, lo = other.logMid + dOther.exposure;
    expect(Math.abs(lg - lo)).toBeLessThan(Math.abs(guide.logMid - other.logMid) * 0.15);
    // la dominante cálida se compensa respecto a la guía (que es neutra)
    expect(dOther.wbR / dg.wbR).toBeLessThan(0.9);
    expect(dOther.wbB / dg.wbB).toBeGreaterThan(1.1);
  });

  it("los ajustes del usuario en la guía se suman a lo automático de cada foto", () => {
    const look = { ...DEFAULT_LOOK, light: { ...DEFAULT_LOOK.light, exposure: 0.5, warmth: 20 } };
    const s = stats({ logMid: Math.log2(0.09) });
    expect(developFor(s, look).exposure).toBeCloseTo(autoDevelop(s).exposure + 0.5, 5);
    expect(developFor(s, look).warmth).toBe(20);
  });
});

describe("recorte para redes", () => {
  it("toma el recorte más grande de la proporción pedida", () => {
    const c = smartCrop(stats(), 4 / 5);
    expect(c.h).toBeCloseTo(1);
    expect(c.w).toBeCloseTo((4 / 5) / (4 / 3));
  });

  it("centra en la cara y no la corta, también en 9:16 desde una horizontal", () => {
    const face = { x: 0.78, y: 0.2, w: 0.08, h: 0.11 };
    const s = stats({ faces: [face] });
    for (const r of [4 / 5, 9 / 16, 1]) {
      const c = smartCrop(s, r);
      expect(cutsFace(s, c)).toBe(false);
      expect(c.x + c.w).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("en vertical deja los ojos hacia el tercio superior", () => {
    const s = stats({ width: 3000, height: 4000, faces: [{ x: 0.4, y: 0.3, w: 0.2, h: 0.15 }] });
    const c = smartCrop(s, 1);
    const eyes = 0.3 + 0.15 * 0.4;
    const rel = (eyes - c.y) / c.h;
    expect(rel).toBeGreaterThan(0.25);
    expect(rel).toBeLessThan(0.45);
  });
});

describe("licencia del móvil", () => {
  const seed = ed.utils.randomPrivateKey();
  let pub = "";
  const kv = new Map<string, unknown>();
  const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const token = async (d: object) => {
    const p = b64u(new TextEncoder().encode(JSON.stringify(d)));
    return p + "." + b64u(await ed.signAsync(new TextEncoder().encode(p), seed));
  };

  beforeEach(async () => {
    pub = Array.from(await ed.getPublicKeyAsync(seed), (x) => x.toString(16).padStart(2, "0")).join("");
    kv.clear();
    setPlatform({
      kind: "web", deviceId: async () => "ab".repeat(32), deviceName: () => "prueba",
      kvGet: async (k: string) => (kv.get(k) as any) ?? null, kvSet: async (k: string, v: unknown) => void kv.set(k, v),
    } as unknown as Platform);
  });

  const now = 1_800_000_000;
  const base = { v: 1, clave: "PF-A", huella: "ab".repeat(32), estado: "activa", titular: "Ana", emitido: now, hasta: now + 7 * 86400, caduca: null };

  it("una clave Pro abre Lite y Pro; una Lite solo Lite; una de PC ninguna", async () => {
    const pro = { token: await token({ ...base, producto: "pro", licencia: "pro" }) };
    const lite = { token: await token({ ...base, producto: "lite", licencia: "lite" }) };
    const pc = { token: await token({ ...base, producto: "escritorio", licencia: "escritorio" }) };
    expect((await L.evaluate("lite", pro, now, pub)).ok).toBe(true);
    expect((await L.evaluate("pro", pro, now, pub)).ok).toBe(true);
    expect((await L.evaluate("lite", lite, now, pub)).ok).toBe(true);
    expect((await L.evaluate("pro", lite, now, pub)).code).toBe("producto");
    expect((await L.evaluate("lite", pc, now, pub)).code).toBe("producto");
  });

  it("rechaza tokens manipulados, de otro móvil o vencidos", async () => {
    const t = await token({ ...base, licencia: "lite" });
    const [p, s] = t.split(".");
    const fake = b64u(new TextEncoder().encode(JSON.stringify({ ...base, licencia: "pro" }))) + "." + s;
    expect((await L.evaluate("pro", { token: fake }, now, pub)).code).toBe("sin_licencia");
    expect((await L.evaluate("lite", { token: await token({ ...base, licencia: "lite", huella: "cd".repeat(32) }) }, now, pub)).code).toBe("otro_equipo");
    expect((await L.evaluate("lite", { token: t }, now + 8 * 86400, pub)).code).toBe("vencida");
    expect((await L.evaluate("lite", { token: t, visto: now + 3 * 86400 }, now, pub)).code).toBe("reloj");
    void p;
  });
});

import { unionMask } from "../packages/core/src/ai/vision";

describe("máscaras para el color selectivo", () => {
  const m = (v: number[]) => ({ data: Uint8Array.from(v), width: 2, height: 2 });
  it("une los elementos elegidos y no da nada si la foto no tiene ninguno", () => {
    const masks = { clothes: m([255, 0, 0, 0]), hair: m([0, 200, 0, 0]) };
    expect(Array.from(unionMask(masks, ["clothes", "hair"])!.data)).toEqual([255, 200, 0, 0]);
    expect(unionMask(masks, ["car"])).toBeNull();
    expect(unionMask(masks, ["car", "hair"])!.data[1]).toBe(200);
  });
});

import * as S from "../packages/core/src/styles";

describe("estilos guardados", () => {
  const kv = new Map<string, unknown>();
  beforeEach(() => {
    kv.clear();
    setPlatform({
      kind: "web", deviceId: async () => "ab".repeat(32), deviceName: () => "prueba",
      kvGet: async (k: string) => (kv.get(k) as any) ?? null, kvSet: async (k: string, v: unknown) => void kv.set(k, v),
    } as unknown as Platform);
  });

  it("guarda, sustituye por nombre, renombra y borra", async () => {
    const look = { ...DEFAULT_LOOK, lut: "rodaje/calido", bokeh: 40, formats: ["ig-story"] };
    const a = await S.saveStyle("Boda cálida", look);
    expect(a.tools.bokeh).toBe(true);
    expect(a.tools.crop).toBe(true);
    const b = await S.saveStyle("boda cálida ", { ...look, grain: 20 });
    expect(b.id).toBe(a.id);
    expect((await S.ownStyles()).length).toBe(1);
    await S.renameStyle(a.id, "Boda");
    expect((await S.ownStyles())[0].name).toBe("Boda");
    await S.deleteStyle(a.id);
    expect(await S.ownStyles()).toEqual([]);
  });

  it("uno propio con el nombre de un predefinido lo sustituye", async () => {
    await S.saveStyle("Natural", DEFAULT_LOOK);
    const all = await S.allStyles();
    expect(all.filter((s) => s.name === "Natural").length).toBe(1);
    expect(all[0].builtin).toBe(false);
    expect(all.length).toBe(S.BUILTIN.length);
  });

  it("los estilos antiguos sin color selectivo se completan", () => {
    const l = S.styleLook({ lut: "rodaje/vivo" } as never);
    expect(l.splash.on).toBe(false);
    expect(l.light.exposure).toBe(0);
  });
});

describe("creador sencillo de estilos", () => {
  it("traduce las respuestas a ajustes y conserva lo demás", () => {
    const base = { ...DEFAULT_LOOK, bokeh: 40, formats: ["ig-story"] };
    const l = S.applySimple(base, { mood: "calido", light: "luminosa", contrast: "intenso", color: "vivo", finish: "pelicula" });
    expect(l.light.warmth).toBeGreaterThan(0);
    expect(l.light.exposure).toBeGreaterThan(0);
    expect(l.light.saturation).toBeGreaterThan(0);
    expect(l.lut).toBe("t3mujinpack/Kodak Portra 400");
    expect(l.bokeh).toBe(40);
    expect(l.formats).toEqual(["ig-story"]);
    const bn = S.applySimple(base, { ...S.SIMPLE_DEFAULT, color: "bn" });
    expect(bn.lut).toBe("rodaje/blanco-y-negro");
    expect(S.applySimple(base, S.SIMPLE_DEFAULT).lut).toBeNull();
  });
});

import { detectTilt, rotateCover } from "../packages/core/src/engine/straighten";

describe("enderezar automático", () => {
  /** Cielo claro sobre tierra oscura con el horizonte inclinado `deg` (positivo = sube a la derecha). */
  const horizon = (deg: number, w = 256, h = 192) => {
    const px = new Uint8ClampedArray(w * h * 4);
    const t = Math.tan((deg * Math.PI) / 180);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const yh = h / 2 - (x - w / 2) * t; // sube a la derecha
      const v = y < yh ? 210 : 60;
      const i = (y * w + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255;
    }
    return px;
  };
  it("mide la inclinación del horizonte con su signo", () => {
    expect(detectTilt(horizon(3), 256, 192)).toBeCloseTo(3, 0);
    expect(detectTilt(horizon(-4.5), 256, 192)).toBeCloseTo(-4.5, 0);
    expect(Math.abs(detectTilt(horizon(0), 256, 192))).toBeLessThan(0.3);
  });
  it("con una pared vertical, el mismo giro de cámara da el mismo signo", () => {
    // cámara girada a la izquierda 3°: el horizonte sube a la derecha y lo vertical se inclina con la parte de arriba a la izquierda
    const w = 256, h = 192, a = (3 * Math.PI) / 180;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const xe = w / 2 + (y - h / 2) * Math.tan(a);
      const v = x < xe ? 200 : 50, i = (y * w + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255;
    }
    expect(detectTilt(px, w, h)).toBeCloseTo(3, 0);
  });

  it("sin líneas no gira", () => {
    const px = new Uint8ClampedArray(64 * 64 * 4).fill(128);
    expect(detectTilt(px, 64, 64)).toBe(0);
  });
  it("la ampliación cubre las esquinas", () => {
    expect(rotateCover(0, 400, 300)).toBeCloseTo(1);
    expect(rotateCover(5, 400, 300)).toBeGreaterThan(1.1);
  });
});

import { cluster, similarity } from "../packages/core/src/ai/people-math";

describe("personas", () => {
  it("la semejanza lleva los 5 puntos a la plantilla", () => {
    const tpl: [number, number][] = [[38.3, 51.7], [73.5, 51.5], [56, 71.7], [41.5, 92.4], [70.7, 92.2]];
    // los mismos puntos girados 20°, al doble de tamaño y desplazados
    const a = (20 * Math.PI) / 180;
    const src = tpl.map(([x, y]) => [2 * (x * Math.cos(a) - y * Math.sin(a)) + 300, 2 * (x * Math.sin(a) + y * Math.cos(a)) + 120] as [number, number]);
    const t = similarity(src, tpl);
    for (let i = 0; i < 5; i++) {
      const [x, y] = src[i];
      expect(t.a * x - t.b * y + t.tx).toBeCloseTo(tpl[i][0], 3);
      expect(t.b * x + t.a * y + t.ty).toBeCloseTo(tpl[i][1], 3);
    }
  });

  it("agrupa por parecido y no junta dos caras de la misma foto", () => {
    const v = (...xs: number[]) => { const e = Float32Array.from(xs); const n = Math.hypot(...xs); return e.map((x) => x / n); };
    const A = (p: string, d = 0) => ({ photoId: p, emb: v(1, d, 0), thumb: null, size: 0.1 });
    const B = (p: string, d = 0) => ({ photoId: p, emb: v(0, 1, d), thumb: null, size: 0.1 });
    const g = cluster([A("1"), A("2", 0.1), B("1"), B("3", 0.2), A("3", 0.05)]);
    expect(g.map((x) => x.map((f) => f.photoId).sort().join())).toEqual(["1,2,3", "1,3"]);
  });
});
