// Deterministic parameters for original abstract cover art (see
// components/ui/PlaceholderArt). Never sources or resembles real photography —
// used whenever an article has no licensed image yet (spec: unknown license =
// flag for editor, never auto-publish a scraped photo).

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export interface PlaceholderParams {
  hueA: number;
  hueB: number;
  shapes: { cx: number; cy: number; r: number; opacity: number }[];
  rotation: number;
}

export function placeholderParams(seed: string): PlaceholderParams {
  const h = hashString(seed);
  const hueA = h % 360;
  const hueB = (hueA + 35 + (h % 40)) % 360;
  const shapeCount = 3 + (h % 3);
  const shapes = Array.from({ length: shapeCount }, (_, i) => {
    const s = hashString(`${seed}-${i}`);
    return {
      cx: 10 + (s % 80),
      cy: 10 + ((s >> 3) % 80),
      r: 12 + ((s >> 6) % 26),
      opacity: 0.08 + ((s >> 9) % 10) / 60,
    };
  });
  return { hueA, hueB, shapes, rotation: h % 360 };
}
