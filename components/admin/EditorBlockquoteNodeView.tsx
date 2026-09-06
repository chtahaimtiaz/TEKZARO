"use client";

import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/react";

/**
 * Without this, every existing quote's `cite` would be silently dropped the
 * moment it's opened in the new canvas — StarterKit's stock blockquote node
 * has no attribute for it. The quote's own text stays normal editable
 * ProseMirror content (NodeViewContent) — still gets full bold/italic/link
 * support like any other text — with a plain, non-editable input for the
 * attribution alongside it.
 */
export function EditorBlockquoteNodeView({ node, updateAttributes }: NodeViewProps) {
  const cite = typeof node.attrs.cite === "string" ? node.attrs.cite : "";

  return (
    <NodeViewWrapper className="border-l-4 border-accent pl-4 italic text-ink">
      <NodeViewContent />
      <input
        value={cite}
        onChange={(e) => updateAttributes({ cite: e.target.value || null })}
        placeholder="Attribution (optional)"
        contentEditable={false}
        className="mt-1 w-full rounded-md border border-border-strong bg-paper p-1.5 text-sm not-italic text-ink-muted focus:border-accent"
      />
    </NodeViewWrapper>
  );
}
