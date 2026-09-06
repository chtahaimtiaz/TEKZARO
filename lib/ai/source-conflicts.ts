import type { EvidenceBundle } from "./evidence";

/**
 * Flags cases where two evidence documents report a materially different
 * figure for what looks like the same claim — "40% faster" from a vendor
 * against "23% faster" from independent testing is the brief's own example.
 *
 * Deliberately narrow. True semantic conflict detection (recognising that
 * two differently-worded sentences describe the same underlying fact) is
 * not something this can respons­ibly attempt with regex. What it does
 * instead: numbers are grouped by the specific keyword found immediately
 * around them (a domain word like "valuation", "faster", "bandwidth",
 * "revenue"), and two documents supplying different numbers for the same
 * keyword are flagged. This will miss real conflicts phrased without a
 * shared keyword — an acceptable false-negative, since the alternative is
 * inventing conflicts between numbers that were never actually about the
 * same thing, which is worse than staying silent.
 */

export interface SourceConflict {
  keyword: string;
  values: { hostname: string; value: number; excerpt: string }[];
}

const NUMBER_RE = /(?<![\w.])(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+\.\d+)\s*(%|percent)?/gi;

/** Domain words worth comparing across sources. Narrow and specific rather
 * than "any noun near a number" — a broad list would manufacture false
 * conflicts between unrelated figures that merely share a common word. */
const KEYWORDS = [
  "valuation", "revenue", "funding", "raised", "faster", "slower", "cheaper",
  "pricier", "bandwidth", "latency", "throughput", "users", "subscribers",
  "employees", "headcount", "growth", "market share", "accuracy", "efficiency",
  "battery life", "range", "resolution",
];

function nearbyKeyword(text: string, index: number, windowChars = 60): string | null {
  const start = Math.max(0, index - windowChars);
  const end = Math.min(text.length, index + windowChars);
  const window = text.slice(start, end).toLowerCase();
  for (const kw of KEYWORDS) {
    if (window.includes(kw)) return kw;
  }
  return null;
}

function significantlyDifferent(a: number, b: number): boolean {
  if (a === 0 || b === 0) return a !== b;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) > 0.1;
}

export function detectNumericConflicts(evidence: EvidenceBundle): SourceConflict[] {
  const byKeyword = new Map<string, { hostname: string; value: number; excerpt: string }[]>();

  for (const doc of evidence.documents) {
    for (const m of doc.text.matchAll(NUMBER_RE)) {
      const value = Number(m[1].replace(/,/g, ""));
      if (Number.isNaN(value)) continue;
      const keyword = nearbyKeyword(doc.text, m.index ?? 0);
      if (!keyword) continue;
      const start = Math.max(0, (m.index ?? 0) - 70);
      const end = Math.min(doc.text.length, (m.index ?? 0) + m[0].length + 70);
      const list = byKeyword.get(keyword) ?? [];
      // One reading per (keyword, host) — a document repeating its own
      // figure several times must not manufacture a conflict against itself.
      if (!list.some((v) => v.hostname === doc.hostname)) {
        list.push({ hostname: doc.hostname, value, excerpt: doc.text.slice(start, end).trim() });
      }
      byKeyword.set(keyword, list);
    }
  }

  const conflicts: SourceConflict[] = [];
  for (const [keyword, values] of byKeyword) {
    if (values.length < 2) continue;
    const distinctHosts = new Set(values.map((v) => v.hostname));
    if (distinctHosts.size < 2) continue;
    const min = Math.min(...values.map((v) => v.value));
    const max = Math.max(...values.map((v) => v.value));
    if (significantlyDifferent(min, max)) conflicts.push({ keyword, values });
  }
  return conflicts;
}
