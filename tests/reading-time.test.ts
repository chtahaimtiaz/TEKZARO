import { describe, it, expect } from "vitest";
import { estimateReadingTime } from "../lib/reading-time";
import type { ContentBlock } from "../lib/content-blocks";

describe("estimateReadingTime", () => {
  it("counts the same number of words whether or not a paragraph carries inline marks", () => {
    const plain: ContentBlock[] = [{ type: "paragraph", text: "one two three four five" }];
    const marked: ContentBlock[] = [{ type: "paragraph", text: "one **two** three _four_ [five](https://x.com)" }];
    expect(estimateReadingTime(marked)).toBe(estimateReadingTime(plain));
  });

  it("counts words inside fact-table rows and FAQ items, not just prose blocks", () => {
    const withNothing: ContentBlock[] = [{ type: "heading", level: 2, text: "Specs" }];
    const withTable: ContentBlock[] = [
      { type: "heading", level: 2, text: "Specs" },
      { type: "fact-table", rows: [{ label: "Price", value: "Nine hundred ninety nine dollars total" }] },
    ];
    expect(estimateReadingTime(withTable)).toBeGreaterThanOrEqual(estimateReadingTime(withNothing));

    const withFaq: ContentBlock[] = [
      { type: "heading", level: 2, text: "FAQ" },
      { type: "faq", items: [{ question: "Is it fast", answer: "Yes it is very fast indeed" }] },
    ];
    expect(estimateReadingTime(withFaq)).toBeGreaterThanOrEqual(estimateReadingTime(withNothing));
  });

  it("never returns less than 1 minute", () => {
    expect(estimateReadingTime([{ type: "paragraph", text: "x" }])).toBeGreaterThanOrEqual(1);
    expect(estimateReadingTime([])).toBeGreaterThanOrEqual(1);
  });
});
