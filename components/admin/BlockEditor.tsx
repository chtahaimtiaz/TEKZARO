"use client";

import type { ContentBlock } from "@/lib/content-blocks";

interface BlockEditorProps {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
}

const BLOCK_TYPES: { value: ContentBlock["type"]; label: string }[] = [
  { value: "paragraph", label: "Paragraph" },
  { value: "heading", label: "Heading" },
  { value: "quote", label: "Quote" },
  { value: "list", label: "List" },
  { value: "image", label: "Image" },
];

function emptyBlock(type: ContentBlock["type"]): ContentBlock {
  switch (type) {
    case "paragraph":
      return { type: "paragraph", text: "" };
    case "heading":
      return { type: "heading", level: 2, text: "" };
    case "quote":
      return { type: "quote", text: "", cite: "" };
    case "list":
      return { type: "list", style: "bullet", items: [""] };
    case "image":
      return { type: "image", url: "", alt: "", caption: "", credit: "" };
    case "pakistan-impact":
      return { type: "pakistan-impact", text: "" };
  }
}

export function BlockEditor({ blocks, onChange }: BlockEditorProps) {
  function updateBlock(index: number, next: ContentBlock) {
    onChange(blocks.map((b, i) => (i === index ? next : b)));
  }
  function removeBlock(index: number) {
    onChange(blocks.filter((_, i) => i !== index));
  }
  function moveBlock(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  function addBlock(type: ContentBlock["type"]) {
    onChange([...blocks, emptyBlock(type)]);
  }

  return (
    <div className="flex flex-col gap-3">
      {blocks.length === 0 && (
        <p className="rounded-md border border-dashed border-border-strong p-4 text-sm text-ink-muted">
          No content yet — add a block below.
        </p>
      )}

      {blocks.map((block, index) => (
        <div key={index} className="rounded-lg border border-border bg-paper-raised p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-ink-muted">
            <span className="font-semibold uppercase tracking-wide">{block.type}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => moveBlock(index, -1)} className="rounded border border-border px-2 py-0.5 hover:border-accent">
                ↑
              </button>
              <button type="button" onClick={() => moveBlock(index, 1)} className="rounded border border-border px-2 py-0.5 hover:border-accent">
                ↓
              </button>
              <button type="button" onClick={() => removeBlock(index)} className="rounded border border-border px-2 py-0.5 text-red-600 hover:border-red-400 dark:text-red-400 dark:hover:border-red-700">
                Remove
              </button>
            </div>
          </div>

          {(block.type === "paragraph" || block.type === "heading" || block.type === "quote") && (
            <textarea
              value={block.text}
              onChange={(e) => updateBlock(index, { ...block, text: e.target.value })}
              rows={block.type === "heading" ? 1 : 3}
              className="w-full rounded-md border border-border-strong p-2 text-sm focus:border-accent"
              placeholder={block.type === "heading" ? "Heading text" : "Text"}
            />
          )}

          {block.type === "heading" && (
            <select
              value={block.level}
              onChange={(e) => updateBlock(index, { ...block, level: Number(e.target.value) as 2 | 3 })}
              className="mt-2 rounded-md border border-border-strong p-1.5 text-sm"
            >
              <option value={2}>H2</option>
              <option value={3}>H3</option>
            </select>
          )}

          {block.type === "quote" && (
            <input
              value={block.cite ?? ""}
              onChange={(e) => updateBlock(index, { ...block, cite: e.target.value })}
              placeholder="Attribution (optional)"
              className="mt-2 w-full rounded-md border border-border-strong p-2 text-sm focus:border-accent"
            />
          )}

          {block.type === "list" && (
            <div className="flex flex-col gap-2">
              <select
                value={block.style}
                onChange={(e) => updateBlock(index, { ...block, style: e.target.value as "bullet" | "number" })}
                className="w-fit rounded-md border border-border-strong p-1.5 text-sm"
              >
                <option value="bullet">Bullet</option>
                <option value="number">Numbered</option>
              </select>
              {block.items.map((item, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={item}
                    onChange={(e) => {
                      const items = [...block.items];
                      items[i] = e.target.value;
                      updateBlock(index, { ...block, items });
                    }}
                    className="w-full rounded-md border border-border-strong p-2 text-sm focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => updateBlock(index, { ...block, items: block.items.filter((_, j) => j !== i) })}
                    className="rounded border border-border px-2 text-xs text-red-600 hover:border-red-400 dark:text-red-400 dark:hover:border-red-700"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => updateBlock(index, { ...block, items: [...block.items, ""] })}
                className="w-fit text-xs font-semibold text-accent hover:underline"
              >
                + Add item
              </button>
            </div>
          )}

          {block.type === "image" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={block.url}
                onChange={(e) => updateBlock(index, { ...block, url: e.target.value })}
                placeholder="Image URL"
                className="rounded-md border border-border-strong p-2 text-sm focus:border-accent sm:col-span-2"
              />
              <input
                value={block.alt}
                onChange={(e) => updateBlock(index, { ...block, alt: e.target.value })}
                placeholder="Alt text (required)"
                className="rounded-md border border-border-strong p-2 text-sm focus:border-accent"
              />
              <input
                value={block.caption ?? ""}
                onChange={(e) => updateBlock(index, { ...block, caption: e.target.value })}
                placeholder="Caption (optional)"
                className="rounded-md border border-border-strong p-2 text-sm focus:border-accent"
              />
              <input
                value={block.credit ?? ""}
                onChange={(e) => updateBlock(index, { ...block, credit: e.target.value })}
                placeholder="Credit / license (optional)"
                className="rounded-md border border-border-strong p-2 text-sm focus:border-accent sm:col-span-2"
              />
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        {BLOCK_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => addBlock(t.value)}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:border-accent hover:text-accent"
          >
            + {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
