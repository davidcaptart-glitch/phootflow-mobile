import { describe, expect, it } from "vitest";
import {
  History, newHeal, newPortrait, newText, normalizeLayers, strokesBox, layerName, type Layer,
} from "../packages/core/src/retouch/layers";
import {
  blurChannel, cloneHeal, findHealSource, maskBounds, personAlpha, portraitRetouch, rasterStrokes, upsampleMask, type Rgba,
} from "../packages/core/src/retouch/pixels";

/** Degradado horizontal suave (como una pared o un cielo) w×h. */
function gradient(w: number, h: number): Rgba {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    data[i] = 60 + (x / w) * 120; data[i + 1] = 90 + (y / h) * 60; data[i + 2] = 150; data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}
const px = (img: Rgba, x: number, y: number) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 3));
function spot(img: Rgba, cx: number, cy: number, r: number, color = [20, 10, 10]) {
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (Math.hypot(x - cx, y - cy) > r) continue;
    const i = (y * img.width + x) * 4;
    img.data[i] = color[0]; img.data[i + 1] = color[1]; img.data[i + 2] = color[2];
  }
}
const diff = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

describe("pincel", () => {
  it("pinta un círculo con borde suave donde se toca", () => {
    const m = rasterStrokes([{ r: 0.05, pts: [0.5, 0.5] }], 200, 100);
    expect(m[50 * 200 + 100]).toBe(255);       // centro
    expect(m[50 * 200 + 100 + 8]).toBeGreaterThan(0); // borde suave (radio 10 px = 0,05 × 200)
    expect(m[50 * 200 + 100 + 8]).toBeLessThan(255);
    expect(m[50 * 200 + 100 + 12]).toBe(0);
    expect(m[0]).toBe(0);
    const b = maskBounds(m, 200, 100)!;
    expect(b.w).toBeGreaterThanOrEqual(19);
    expect(b.w).toBeLessThanOrEqual(21);
  });
  it("un trazo une los puntos", () => {
    const m = rasterStrokes([{ r: 0.02, pts: [0.1, 0.5, 0.9, 0.5] }], 100, 100);
    for (let x = 12; x < 88; x += 5) expect(m[50 * 100 + x]).toBe(255);
    expect(m[20 * 100 + 50]).toBe(0);
  });
  it("en una región, solo el trozo", () => {
    const full = rasterStrokes([{ r: 0.05, pts: [0.5, 0.5] }], 200, 200);
    const part = rasterStrokes([{ r: 0.05, pts: [0.5, 0.5] }], 200, 200, { x: 90, y: 90, w: 20, h: 20 });
    expect(part[10 * 20 + 10]).toBe(full[100 * 200 + 100]);
    expect(part[3 * 20 + 7]).toBe(full[93 * 200 + 97]);
  });
  it("caja de los trazos con margen", () => {
    const b = strokesBox([{ r: 0.1, pts: [0.5, 0.5] }], 2)!; // foto apaisada 2:1
    expect(b.w).toBeCloseTo(0.2, 5);
    expect(b.h).toBeCloseTo(0.4, 5);
    expect(strokesBox([], 1)).toBeNull();
  });
});

describe("corrector y tampón", () => {
  it("el corrector borra una mancha en un degradado sin que se note", () => {
    const img = gradient(160, 120);
    const clean = px(img, 80, 60);
    spot(img, 80, 60, 6);
    const mask = rasterStrokes([{ r: 9 / 160, pts: [80 / 160, 60 / 120] }], 160, 120);
    const d = findHealSource(img, mask);
    expect(Math.hypot(d.dx, d.dy)).toBeGreaterThan(10); // el origen no es la propia mancha
    const out = cloneHeal(img, mask, d.dx, d.dy, true);
    expect(diff(px(out, 80, 60), clean)).toBeLessThan(6);
    expect(diff(px(out, 84, 62), px(gradient(160, 120), 84, 62))).toBeLessThan(6);
    // lo de fuera no se toca
    expect(px(out, 10, 10)).toEqual(px(img, 10, 10));
  });

  it("el tampón copia tal cual (sin fundir el color)", () => {
    const img = gradient(100, 100);
    const mask = rasterStrokes([{ r: 0.04, pts: [0.3, 0.3] }], 100, 100, undefined, 1);
    const out = cloneHeal(img, mask, 40, 0, false);
    expect(px(out, 30, 30)).toEqual(px(img, 70, 30));
    // con fusión, el centro queda parecido a lo que había (el degradado se corrige)
    const healed = cloneHeal(img, mask, 40, 0, true);
    expect(diff(px(healed, 30, 30), px(img, 30, 30))).toBeLessThan(8);
  });

  it("el tampón también copia la opacidad (sobre un fondo quitado)", () => {
    const img = gradient(100, 100);
    for (let y = 0; y < 100; y++) for (let x = 0; x < 50; x++) img.data[(y * 100 + x) * 4 + 3] = 0; // izquierda transparente
    const mask = rasterStrokes([{ r: 0.04, pts: [0.2, 0.5] }], 100, 100, undefined, 1);
    const out = cloneHeal(img, mask, 50, 0, false);
    expect(out.data[(50 * 100 + 20) * 4 + 3]).toBe(255);
    expect(out.data[(10 * 100 + 20) * 4 + 3]).toBe(0);
  });

  it("el corrector evita copiar de otra mancha", () => {
    const img = gradient(200, 200);
    spot(img, 100, 100, 5);
    // manchas alrededor salvo hacia la izquierda
    for (const [x, y] of [[125, 100], [100, 125], [100, 75], [125, 125], [125, 75], [75, 125], [75, 75]]) spot(img, x, y, 7, [250, 250, 20]);
    const mask = rasterStrokes([{ r: 7 / 200, pts: [0.5, 0.5] }], 200, 200);
    const d = findHealSource(img, mask);
    const out = cloneHeal(img, mask, d.dx, d.dy, true);
    expect(diff(px(out, 100, 100), px(gradient(200, 200), 100, 100))).toBeLessThan(12);
  });
});

describe("retrato", () => {
  // «cara» de 64×64: piel con ruido (poros), un ojo y una boca con dientes amarillentos
  function face(): { img: Rgba; skin: { data: Uint8Array; width: number; height: number }; mask: { data: Uint8Array; width: number; height: number; channels: number } } {
    const w = 64, h = 64, data = new Uint8ClampedArray(w * h * 4);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < w * h; i++) {
      const n = (rnd() - 0.5) * 40;
      data[i * 4] = 200 + n; data[i * 4 + 1] = 150 + n; data[i * 4 + 2] = 130 + n; data[i * 4 + 3] = 255;
    }
    const skin = { data: new Uint8Array(w * h), width: w, height: h };
    const mask = { data: new Uint8Array(w * h * 4), width: w, height: h, channels: 4 };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x >= 8 && x < 56 && y >= 8 && y < 56) skin.data[i] = 255;
      if (x >= 40 && x < 50 && y >= 44 && y < 50) { // dientes
        mask.data[i * 4 + 2] = 255;
        data[i * 4] = 225; data[i * 4 + 1] = 205; data[i * 4 + 2] = 120;
      }
    }
    return { img: { data, width: w, height: h }, skin, mask };
  }
  const variance = (img: Rgba, x0: number, y0: number, x1: number, y1: number) => {
    const v: number[] = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) v.push(img.data[(y * img.width + x) * 4 + 1]);
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length;
  };

  it("la piel se suaviza (menos ruido) y fuera de la piel no cambia nada", () => {
    const { img, skin, mask } = face();
    const out = portraitRetouch(img, { face: mask, skin }, { skin: 100, eyes: 0, teeth: 0, circles: 0 });
    expect(variance(out, 14, 14, 34, 34)).toBeLessThan(variance(img, 14, 14, 34, 34) * 0.4);
    expect(px(out, 2, 2)).toEqual(px(img, 2, 2));
  });

  it("los dientes salen más blancos y menos amarillos", () => {
    const { img, skin, mask } = face();
    const out = portraitRetouch(img, { face: mask, skin }, { skin: 0, eyes: 0, teeth: 100, circles: 0 });
    const [r0, g0, b0] = px(img, 45, 47), [r1, g1, b1] = px(out, 45, 47);
    expect((r1 + g1) / 2 - b1).toBeLessThan(((r0 + g0) / 2 - b0) * 0.5);
    expect(r1 + g1 + b1).toBeGreaterThan(r0 + g0 + b0);
  });

  it("con todo a cero, la foto queda igual", () => {
    const { img, skin, mask } = face();
    const out = portraitRetouch(img, { face: mask, skin }, { skin: 0, eyes: 0, teeth: 0, circles: 0 });
    expect(Array.from(out.data)).toEqual(Array.from(img.data));
  });
});

describe("máscaras", () => {
  it("remuestrear conserva el interior y el exterior", () => {
    const m = { data: new Uint8Array(16), width: 4, height: 4 };
    m.data[5] = m.data[6] = m.data[9] = m.data[10] = 255; // el centro 2×2
    const up = upsampleMask(m, 40, 40);
    expect(up[20 * 40 + 20]).toBe(255);
    expect(up[0]).toBe(0);
  });
  it("la persona recortada: dentro opaca, fuera transparente", () => {
    const m = { data: new Uint8Array(64 * 64), width: 64, height: 64 };
    for (let y = 16; y < 48; y++) for (let x = 16; x < 48; x++) m.data[y * 64 + x] = 255;
    const a = personAlpha(m, 128, 128, 30);
    expect(a[64 * 128 + 64]).toBe(255);
    expect(a[5 * 128 + 5]).toBe(0);
  });
  it("desenfocar una constante la deja igual", () => {
    const f = new Float32Array(100).fill(42);
    blurChannel(f, 10, 10, 3).forEach((v) => expect(v).toBeCloseTo(42, 4));
  });
});

describe("capas e historial", () => {
  it("deshacer y rehacer", () => {
    const h = new History<Layer[]>([]);
    const a = newText("Hola");
    h.push("Texto", [a]);
    h.push("Retrato", [a, newPortrait()]);
    expect(h.current.length).toBe(2);
    expect(h.undoLabel).toBe("Retrato");
    h.undo();
    expect(h.current).toEqual([a]);
    expect(h.redoLabel).toBe("Retrato");
    h.undo();
    expect(h.current).toEqual([]);
    expect(h.canUndo).toBe(false);
    h.redo();
    // un cambio nuevo borra lo que se podía rehacer
    h.push("Corrector", [a, newHeal("heal", [], 0.1, 0)]);
    expect(h.canRedo).toBe(false);
    expect(h.labels).toEqual(["Abrir", "Texto", "Corrector"]);
  });
  it("el historial tiene un límite", () => {
    const h = new History(0, 5);
    for (let i = 1; i <= 10; i++) h.push(`p${i}`, i);
    expect(h.labels.length).toBe(5);
    expect(h.current).toBe(10);
    for (let i = 0; i < 10; i++) h.undo();
    expect(h.current).toBe(6);
  });
  it("lo guardado se normaliza (capas viejas o rotas)", () => {
    const ls = normalizeLayers([{ kind: "text", text: "Hola" }, { kind: "nada" }, null, { kind: "portrait", skin: 80 }]);
    expect(ls.length).toBe(2);
    expect(ls[0].kind === "text" && ls[0].size > 0).toBe(true);
    expect(ls[1].kind === "portrait" && ls[1].skin === 80 && ls[1].teeth > 0).toBe(true);
    expect(normalizeLayers(undefined)).toEqual([]);
    expect(layerName(ls[0])).toBe("Texto · Hola");
  });
});
