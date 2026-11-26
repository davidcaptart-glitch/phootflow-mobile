import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { changesSince, compareVersions, whatsNewFor, type ChangelogEntry } from "../packages/core/src/updates/changelog";
import { CHANGELOG as LITE } from "../apps/lite/src/changelog";
import { CHANGELOG as PRO } from "../apps/pro/src/changelog";

const LOG: ChangelogEntry[] = [
  { version: "0.10.0", date: "2027-02-01", items: ["c"] },
  { version: "0.3.0", date: "2027-01-01", items: ["b"] },
  { version: "0.2.0", date: "2026-12-01", items: ["a"] },
  { version: "0.1.0", date: "2026-11-01", items: ["primera"] },
];

describe("versiones", () => {
  it("compara número a número", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1.2.3", "1.2.4")).toBe(-1);
  });
});

describe("novedades", () => {
  it("lo nuevo desde la última vista, hasta la actual y de la más nueva a la más antigua", () => {
    expect(changesSince(LOG, "0.1.0", "0.3.0").map((e) => e.version)).toEqual(["0.3.0", "0.2.0"]);
    expect(whatsNewFor(LOG, "0.10.0", "0.2.0", true).map((e) => e.version)).toEqual(["0.10.0", "0.3.0"]);
  });
  it("una sola vez: con la versión ya vista no sale nada", () => {
    expect(whatsNewFor(LOG, "0.3.0", "0.3.0", true)).toEqual([]);
    expect(whatsNewFor(LOG, "0.2.0", "0.3.0", true)).toEqual([]);
  });
  it("instalación nueva sin nada; quien ya la usaba ve lo posterior a la primera versión", () => {
    expect(whatsNewFor(LOG, "0.3.0", null, false)).toEqual([]);
    expect(whatsNewFor(LOG, "0.3.0", null, true).map((e) => e.version)).toEqual(["0.3.0", "0.2.0"]);
  });
});

describe.each([["lite", LITE], ["pro", PRO]] as const)("registro de cambios de %s", (app, log) => {
  const version = JSON.parse(readFileSync(`apps/${app}/package.json`, "utf8")).version as string;
  it("tiene la versión del package.json, arriba", () => {
    expect(log[0].version).toBe(version);
  });
  it("ordenado, con fechas y frases", () => {
    for (let i = 1; i < log.length; i++) expect(compareVersions(log[i - 1].version, log[i].version)).toBe(1);
    for (const e of log) {
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.items.length).toBeGreaterThan(0);
      for (const t of e.items) expect(t.length).toBeLessThan(140);
    }
  });
});
