import { describe, expect, it } from "vitest";
import { adjActive, maskAlpha, newMask, newPart, zoneAlpha, fillPoly, type MaskContext } from "../packages/core/src/pro/masks";
import { DEFAULT_DEV, cloneDev, fromSource, toSource } from "../packages/core/src/pro/dev";

/** Foto sintética: cielo azul arriba, suelo verde oscuro abajo, un cuadrado rojo en el centro. */
function ctx(w = 80, h = 60): MaskContext {
  const rgb = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    let c = y < h * 0.4 ? [0.35, 0.55, 0.9] : [0.12, 0.3, 0.1];
    if (x > w * 0.4 && x < w * 0.6 && y > h * 0.45 && y < h * 0.75) c = [0.85, 0.1, 0.1];
    rgb.set(c, i);
  }
  return { w, h, rgb };
}
const at = (a: Float32Array, c: MaskContext, x: number, y: number) => a[Math.round(y * (c.h - 1)) * c.w + Math.round(x * (c.w - 1))];

describe("zonas", () => {
  const c = ctx();
  it("radial: lleno en el centro, nada fuera", () => {
    const a = zoneAlpha(newMask("radial"), c);
    expect(at(a, c, 0.5, 0.45)).toBeGreaterThan(0.95);
    expect(at(a, c, 0.02, 0.98)).toBeLessThan(0.01);
  });
  it("lineal: de lleno a nada", () => {
    const a = zoneAlpha(newMask("linear"), c);
    expect(at(a, c, 0.5, 0)).toBeGreaterThan(0.99);
    expect(at(a, c, 0.5, 0.8)).toBe(0);
  });
  it("pincel pinta y borra", () => {
    const m = newMask("brush");
    m.params.feather = 0;
    m.params.strokes = [[0.5, 0.5, 0.1, 1], [0.5, 0.5, 0.03, -1]];
    const a = zoneAlpha(m, c);
    expect(at(a, c, 0.6, 0.5)).toBeGreaterThan(0.9);
    expect(at(a, c, 0.5, 0.5)).toBeLessThan(0.05);
  });
  it("rango de color coge el rojo", () => {
    const m = newMask("color");
    m.params.hue = 0;
    const a = zoneAlpha(m, c);
    expect(at(a, c, 0.5, 0.6)).toBeGreaterThan(0.8);
    expect(at(a, c, 0.1, 0.1)).toBeLessThan(0.05);
  });
  it("rango de luz coge lo claro", () => {
    const m = newMask("luma");
    m.params.lo = 50; m.params.hi = 100;
    const a = zoneAlpha(m, c);
    expect(at(a, c, 0.1, 0.1)).toBeGreaterThan(0.8);
    expect(at(a, c, 0.1, 0.9)).toBeLessThan(0.05);
  });
  it("punto de control: cerca y del mismo color", () => {
    const m = newMask("point");
    m.params.cx = 0.5; m.params.cy = 0.6; m.params.size = 60;
    const a = zoneAlpha(m, c);
    expect(at(a, c, 0.5, 0.6)).toBeGreaterThan(0.7);
    expect(at(a, c, 0.5, 0.1)).toBeLessThan(0.05);
  });
  it("cielo: lo de arriba", () => {
    const a = zoneAlpha(newMask("sky"), c);
    expect(at(a, c, 0.3, 0.1)).toBeGreaterThan(0.5);
    expect(at(a, c, 0.3, 0.9)).toBeLessThan(0.05);
  });
  it("IA con las clases de la segmentación", () => {
    const n = c.w * c.h, bg = new Float32Array(n).fill(1), z = new Float32Array(n);
    for (let i = 0; i < n; i++) if ((i % c.w) > c.w / 2) bg[i] = 0;
    const a = zoneAlpha(newMask("person"), { ...c, seg: [bg, z, z, z, z, z], cache: {} });
    expect(at(a, c, 0.9, 0.5)).toBeGreaterThan(0.8);
    expect(at(a, c, 0.1, 0.5)).toBeLessThan(0.2);
  });
});

describe("combinar", () => {
  const c = ctx();
  it("restar e intersecar zonas, invertir y cantidad", () => {
    const m = newMask("linear");                       // arriba lleno
    const sub = newPart("radial", "sub");
    sub.params = { cx: 0.5, cy: 0.1, rx: 0.1, ry: 0.1, feather: 10 };
    m.parts.push(sub);
    let a = maskAlpha(m, c);
    expect(at(a, c, 0.5, 0.1)).toBeLessThan(0.05);
    expect(at(a, c, 0.1, 0.05)).toBeGreaterThan(0.9);
    sub.mode = "inter";
    a = maskAlpha(m, c);
    expect(at(a, c, 0.5, 0.1)).toBeGreaterThan(0.8);
    expect(at(a, c, 0.1, 0.05)).toBeLessThan(0.05);
    m.invert_all = true; m.amount = 50;
    a = maskAlpha(m, c);
    expect(at(a, c, 0.1, 0.05)).toBeCloseTo(0.5, 1);
  });
  it("una máscara sin ajustes no cambia nada", () => {
    expect(adjActive({})).toBe(false);
    expect(adjActive({ grade_blend: 50, grade_sh_hue: 200 })).toBe(false);
    expect(adjActive({ exposure: 0.5 })).toBe(true);
  });
  it("polígono relleno", () => {
    const d = new Float32Array(100);
    fillPoly(d, 10, 10, [[2, 2], [8, 2], [8, 8], [2, 8]]);
    expect(d[5 * 10 + 5]).toBeCloseTo(1, 2);
    expect(d[0]).toBe(0);
  });
});

describe("geometría", () => {
  it("de la vista a la foto y vuelta, con giro, volteo, ángulo y recorte", () => {
    const d = { ...cloneDev(DEFAULT_DEV), rotate: 90 as const, flipH: true, angle: 7, crop: { x: 0.1, y: 0.2, w: 0.6, h: 0.5 } };
    for (const [u, v] of [[0, 0], [0.3, 0.7], [1, 1], [0.5, 0.5]]) {
      const [sx, sy] = toSource(d, u, v, 4000, 3000);
      const [u2, v2] = fromSource(d, sx, sy, 4000, 3000);
      expect(u2).toBeCloseTo(u, 6);
      expect(v2).toBeCloseTo(v, 6);
    }
  });
});
