"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { EditorLinkPopover } from "./EditorLinkPopover";

interface EditorToolbarProps {
  editor: Editor;
}

function ToolbarButton({
  active,
  disabled,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-xs font-semibold disabled:opacity-40 ${
        active ? "border-accent bg-accent/10 text-accent" : "border-border text-ink-soft hover:border-accent hover:text-accent"
      }`}
    >
      {children}
    </button>
  );
}

/** Undo, Redo, Paragraph, H2, H3, Bold, Italic, Link, Bullet List, Numbered
 * List, Quote, Image — the exact set asked for, no more. */
export function EditorToolbar({ editor }: EditorToolbarProps) {
  const [linkOpen, setLinkOpen] = useState(false);

  return (
    <div className="relative mb-2 flex flex-wrap gap-1 border-b border-border pb-2">
      <ToolbarButton title="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
        ↶ Undo
      </ToolbarButton>
      <ToolbarButton title="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
        ↷ Redo
      </ToolbarButton>
      <span className="mx-1 w-px bg-border" />
      <ToolbarButton title="Paragraph" active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()}>
        P
      </ToolbarButton>
      <ToolbarButton title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        H2
      </ToolbarButton>
      <ToolbarButton title="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        H3
      </ToolbarButton>
      <span className="mx-1 w-px bg-border" />
      <ToolbarButton title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton title="Link" active={editor.isActive("link")} onClick={() => setLinkOpen((v) => !v)}>
        🔗 Link
      </ToolbarButton>
      <span className="mx-1 w-px bg-border" />
      <ToolbarButton title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        • List
      </ToolbarButton>
      <ToolbarButton title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        1. List
      </ToolbarButton>
      <ToolbarButton title="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        " Quote
      </ToolbarButton>
      <ToolbarButton
        title="Image"
        onClick={() => editor.chain().focus().setArticleImage({ src: "", alt: "", caption: null, credit: null }).run()}
      >
        🖼 Image
      </ToolbarButton>
      <EditorLinkPopover editor={editor} open={linkOpen} onClose={() => setLinkOpen(false)} />
    </div>
  );
}
