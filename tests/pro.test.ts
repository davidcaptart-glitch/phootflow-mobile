import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEV, applyPreset, autoDev, BUILTIN_PRESETS, changedGroups, cloneDev, curveTable, fitAspect,
  normalizeDev, outputSize, pasteDev, sampleCurve,
} from "../packages/core/src/pro/dev";
import type { PhotoStats } from "../packages/core/src/engine/types";

describe("curvas", () => {
  it("la recta deja todo igual", () => {
    const c = sampleCurve([[0, 0], [1, 1]], 11);
    c.forEach((v, i) => expect(v).toBeCloseTo(i / 10, 5));
  });
  it("es monótona y pasa por los puntos", () => {
    const pts: [number, number][] = [[0, 0], [0.25, 0.15], [0.75, 0.9], [1, 1]];
    const c = sampleCurve(pts, 256);
    for (let i = 1; i < 256; i++) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1] - 1e-6);
    expect(c[Math.round(0.25 * 255)]).toBeCloseTo(0.15, 1);
    expect(c[Math.round(0.75 * 255)]).toBeCloseTo(0.9, 1);
  });
  it("tabla RGBA: la general en A", () => {
    const t = curveTable({ master: [[0, 0.2], [1, 1]], r: [[0, 0], [1, 1]], g: [[0, 0], [1, 1]], b: [[0, 0], [1, 1]] });
    expect(t[3]).toBe(51);
    expect(t[0]).toBe(0);
    expect(t[255 * 4 + 3]).toBe(255);
  });
});

describe("ajustes", () => {
  const stats: PhotoStats = { width: 4000, height: 3000, logMid: Math.log2(0.05), p2: 0.002, p98: 0.3, castRG: 0.3, castBG: -0.3, faces: [], people: null };

  it("Auto aclara una foto oscura y corrige el color", () => {
    const d = autoDev(stats);
    expect(d.exposure).toBeGreaterThan(0.5);
    expect(d.wbR).toBeLessThan(1);
    expect(d.wbB).toBeGreaterThan(1);
    expect(d.crop).toEqual(DEFAULT_DEV.crop);
  });

  it("copiar y pegar solo los grupos elegidos", () => {
    const a = { ...cloneDev(DEFAULT_DEV), exposure: 1, vibrance: 30, angle: 3 };
    const b = pasteDev(DEFAULT_DEV, a, ["color"]);
    expect(b.vibrance).toBe(30);
    expect(b.exposure).toBe(0);
    expect(b.angle).toBe(0);
    expect(changedGroups(a).sort()).toEqual(["color", "geometry", "light"]);
  });

  it("un preset no toca la exposición ni el recorte", () => {
    const d = { ...cloneDev(DEFAULT_DEV), exposure: 0.7, crop: { x: 0.1, y: 0, w: 0.8, h: 1 } };
    const bn = applyPreset(d, BUILTIN_PRESETS.find((p) => p.id === "p-bn")!);
    expect(bn.bw).toBe(true);
    expect(bn.exposure).toBe(0.7);
    expect(bn.crop.x).toBe(0.1);
  });

  it("los ajustes viejos se completan", () => {
    const d = normalizeDev({ exposure: 1 } as never);
    expect(d.exposure).toBe(1);
    expect(d.hsl).toHaveLength(8);
    expect(d.curves.master).toHaveLength(2);
  });

  it("recorte con proporción y tamaño de salida", () => {
    const c = fitAspect(1, 4000, 3000);
    expect(c.w).toBeCloseTo(0.75, 5);
    expect(c.h).toBe(1);
    const d = { ...cloneDev(DEFAULT_DEV), crop: c, rotate: 90 as const };
    expect(outputSize(d, 4000, 3000)).toEqual({ width: 2250, height: 4000 });
    expect(outputSize({ ...d, rotate: 0 }, 4000, 3000, 1080)).toEqual({ width: 1080, height: 1080 });
  });
});
