// «Novedades»: el registro de cambios de cada app y qué enseñar al abrir una versión nueva. Lógica pura (sin DOM):
// la usan la PWA y, mañana, las apps nativas (Capacitor) con el mismo registro.

export interface ChangelogEntry {
  /** Versión semántica, la misma que el `version` del package.json de la app. */
  version: string;
  /** Fecha de publicación, AAAA-MM-DD. */
  date: string;
  /** Titular opcional de la versión. */
  title?: string;
  /** Frases cortas para el usuario (qué puede hacer ahora), no técnicas. */
  items: string[];
}

/** Compara «1.2.10» con «1.10.0» número a número (lo que no es número cuenta como 0). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Entradas posteriores a `since` (excluida) y hasta `current` (incluida), de la más nueva a la más antigua. */
export function changesSince(log: ChangelogEntry[], since: string | null, current: string): ChangelogEntry[] {
  return log
    .filter((e) => compareVersions(e.version, current) <= 0 && (since == null || compareVersions(e.version, since) > 0))
    .sort((a, b) => compareVersions(b.version, a.version));
}

/**
 * Qué enseñar al abrir la app.
 * - `lastSeen`: la última versión cuyas novedades vio (null si nunca se guardó).
 * - `existingUser`: ya usaba la app antes de que existiera «Novedades» (p. ej. tiene licencia guardada).
 * Quien la instala por primera vez no ve nada (todo es nuevo); quien ya la usaba ve lo posterior a la primera versión.
 */
export function whatsNewFor(log: ChangelogEntry[], current: string, lastSeen: string | null, existingUser: boolean): ChangelogEntry[] {
  if (lastSeen == null) {
    if (!existingUser || !log.length) return [];
    const oldest = log.reduce((m, e) => (compareVersions(e.version, m) < 0 ? e.version : m), log[0].version);
    return changesSince(log, oldest, current);
  }
  if (compareVersions(lastSeen, current) >= 0) return [];
  return changesSince(log, lastSeen, current);
}

/** «26 nov 2026» */
export function formatChangeDate(date: string): string {
  const d = new Date(date + "T12:00:00");
  return isNaN(+d) ? date : d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}
