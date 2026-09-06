/**
 * Arithmetic performed ON figures the evidence actually reports — never a
 * source for new numbers, only a way to relate two that are already there.
 * A published article may say "412 million, up from 268 million — a 53.7%
 * increase" only when 412 and 268 both trace to evidence; the 53.7% itself
 * must never be presented as if the source stated it.
 *
 * Precision is deliberately capped: a derived percentage is rounded to one
 * decimal place regardless of floating-point precision, because a source
 * reporting whole numbers ("412 million", "268 million") supports "53.7%",
 * not "53.731343283582089%" — that extra precision is manufactured, not
 * derived, and looks exactly like the fabricated-statistic failure mode this
 * whole pipeline exists to prevent.
 */

export interface DerivedNumberResult {
  value: number;
  /** Formatted with exactly the precision the inputs can support. */
  formatted: string;
  /** The reported figures this was computed from — always preserved
   * alongside a derived value so a published claim can point back to them. */
  from: number[];
}

const DECIMALS = 1;

function round(n: number): number {
  const f = 10 ** DECIMALS;
  return Math.round(n * f) / f;
}

function formatPercent(n: number): string {
  const r = round(n);
  // Avoid "-0.0%": a change indistinguishable from zero at this precision is
  // reported as flat, not as a fabricated-looking negative zero.
  return `${r === 0 ? 0 : r}%`;
}

/** Percentage change from one figure to another. Positive for growth,
 * negative for decline — callers choose the wording ("grew", "fell") from
 * the sign rather than calling separate growth/decline functions, so there
 * is exactly one implementation to keep correct. */
export function percentChange(from: number, to: number): DerivedNumberResult {
  if (from === 0) {
    throw new RangeError("percentChange: cannot compute a percentage change from zero");
  }
  const value = ((to - from) / Math.abs(from)) * 100;
  return { value: round(value), formatted: formatPercent(value), from: [from, to] };
}

/** Simple difference, unit-agnostic — the caller states the unit in prose. */
export function absoluteDifference(from: number, to: number): DerivedNumberResult {
  const value = to - from;
  return { value: round(value), formatted: `${round(value)}`, from: [from, to] };
}

/** a:b expressed as a ratio to b=1, e.g. ratio(3.5, 1) -> "3.5x". Used for
 * "roughly 2x the previous generation" style claims. */
export function ratio(a: number, b: number): DerivedNumberResult {
  if (b === 0) throw new RangeError("ratio: cannot divide by zero");
  const value = a / b;
  return { value: round(value), formatted: `${round(value)}x`, from: [a, b] };
}

/** What derived-numbers actually computes, so a claim-extraction pass can
 * verify a figure appearing in a draft against the pair of numbers it would
 * have to have come from, without recomputing every combination inline. */
export function tryDeriveMatch(
  candidateValue: number,
  sourceNumbers: number[],
  tolerance = 0.15,
): { kind: "percentChange" | "ratio"; from: [number, number] } | null {
  for (let i = 0; i < sourceNumbers.length; i++) {
    for (let j = 0; j < sourceNumbers.length; j++) {
      if (i === j) continue;
      const a = sourceNumbers[i];
      const b = sourceNumbers[j];
      try {
        const pc = percentChange(a, b);
        if (Math.abs(pc.value - candidateValue) <= tolerance) return { kind: "percentChange", from: [a, b] };
        if (Math.abs(Math.abs(pc.value) - candidateValue) <= tolerance) return { kind: "percentChange", from: [a, b] };
      } catch {
        /* from === 0, skip */
      }
      if (b !== 0) {
        const r = ratio(a, b);
        if (Math.abs(r.value - candidateValue) <= tolerance) return { kind: "ratio", from: [a, b] };
      }
    }
  }
  return null;
}
