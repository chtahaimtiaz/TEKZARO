/**
 * Single source of truth for the block shapes an AI synthesis/improvement
 * task is allowed to emit, kept in exact sync with SynthesizableBlock
 * (lib/ai/synthesizable-blocks.ts) — the validator every one of these
 * prompts is checked against. verify-and-synthesize.ts, improve-article.ts
 * and model-benchmark.ts each used to hand-copy this shape into their own
 * prompt string, and two of them had drifted into telling the model it
 * could emit a "pakistan-impact" block — which the validator has always
 * rejected (that callout is human-editorial-only, never AI-producible), so
 * a model that followed the instruction got its entire draft silently
 * nulled out by validateImprovedDraft/parseModelOutput's every() check.
 * Interpolate BLOCK_SHAPE_EXAMPLE/BLOCK_SHAPE_RULES into a prompt instead
 * of restating the shape by hand.
 */
export const BLOCK_SHAPE_EXAMPLE =
  `[ { "type": "paragraph", "text": "..." }, { "type": "heading", "level": 2, "text": "..." }, { "type": "list", "style": "bullet", "items": ["..."] }, { "type": "quote", "text": "...", "cite": "optional" }, { "type": "fact-table", "rows": [{ "label": "...", "value": "..." }] }, { "type": "faq", "items": [{ "question": "...", "answer": "..." }] } ]`;

export const BLOCK_SHAPE_RULES = `
- "fact-table": use ONLY when the source material gives genuinely tabular facts (specifications, prices, dates, eligibility, side-by-side figures) traceable to what was supplied — never invent a row to make the table look fuller.
- "faq": use ONLY when the material actually answers 2-5 real reader questions beyond what the prose already covers — never a restatement of the article as questions.
- Never emit a "type": "image" block. Image selection is a separate system's job; you have no role in finding, naming, or asserting the existence of an image.
- Never emit a "type": "pakistan-impact" block. That callout is written by a human editor's judgment, never generated automatically.
`.trim();
