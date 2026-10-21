"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { EditorLinkPopover } from "./EditorLinkPopover";
import { EditorTablePopover } from "./EditorTablePopover";

interface EditorToolbarProps {
  editor: Editor;
}

function ToolbarButton({
  active,
  disabled,
  onClick,
  children,
  title,
  ariaLabel,
  danger,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  ariaLabel?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel || title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-35 ${
        danger
          ? "border-red-300 text-red-600 hover:bg-red-50 hover:border-red-500 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
          : active
          ? "border-accent bg-accent/15 text-accent shadow-xs"
          : "border-border text-ink-soft hover:border-accent hover:text-accent bg-paper-raised/60 hover:bg-paper-raised"
      }`}
    >
      {children}
    </button>
  );
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);

  const isTableActive = editor.isActive("table");

  return (
    <div className="relative mb-3 flex flex-col gap-2 border-b border-border pb-3">
      {/* Primary Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Article rich-text formatting">
        {/* Undo / Redo */}
        <div className="flex items-center gap-1">
          <ToolbarButton
            title="Undo (Ctrl+Z)"
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          >
            ↶ Undo
          </ToolbarButton>
          <ToolbarButton
            title="Redo (Ctrl+Y)"
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          >
            ↷ Redo
          </ToolbarButton>
        </div>

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        {/* Headings & Paragraph */}
        <div className="flex items-center gap-1">
          <ToolbarButton
            title="Normal Paragraph"
            active={editor.isActive("paragraph") && !isTableActive}
            onClick={() => editor.chain().focus().setParagraph().run()}
          >
            P
          </ToolbarButton>
          <ToolbarButton
            title="Heading 2 (Main section)"
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H2
          </ToolbarButton>
          <ToolbarButton
            title="Heading 3 (Subsection)"
            active={editor.isActive("heading", { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            H3
          </ToolbarButton>
          <ToolbarButton
            title="Heading 4 (Minor section)"
            active={editor.isActive("heading", { level: 4 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
          >
            H4
          </ToolbarButton>
        </div>

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        {/* Inline formatting: Bold, Italic, Underline, Strikethrough, Clear */}
        <div className="flex items-center gap-1">
          <ToolbarButton
            title="Bold (Ctrl+B)"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton
            title="Italic (Ctrl+I)"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton
            title="Underline (Ctrl+U)"
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <u>U</u>
          </ToolbarButton>
          <ToolbarButton
            title="Strikethrough"
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <s>S</s>
          </ToolbarButton>
          <ToolbarButton
            title="Insert or edit link"
            active={editor.isActive("link")}
            onClick={() => {
              setTableOpen(false);
              setLinkOpen((v) => !v);
            }}
          >
            🔗 Link
          </ToolbarButton>
          <ToolbarButton
            title="Clear formatting"
            onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
          >
            🧹 Clear
          </ToolbarButton>
        </div>

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        {/* Text Alignment */}
        <div className="flex items-center gap-1">
          <ToolbarButton
            title="Align Left"
            active={editor.isActive({ textAlign: "left" })}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
          >
            ⇤
          </ToolbarButton>
          <ToolbarButton
            title="Align Center"
            active={editor.isActive({ textAlign: "center" })}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
          >
            ↔
          </ToolbarButton>
          <ToolbarButton
            title="Align Right"
            active={editor.isActive({ textAlign: "right" })}
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
          >
            ⇥
          </ToolbarButton>
          <ToolbarButton
            title="Justify Text"
            active={editor.isActive({ textAlign: "justify" })}
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          >
            ≡
          </ToolbarButton>
        </div>

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        {/* Lists, Quotes, Divider, Media */}
        <div className="flex items-center gap-1">
          <ToolbarButton
            title="Bullet list"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            • List
          </ToolbarButton>
          <ToolbarButton
            title="Numbered list"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            1. List
          </ToolbarButton>
          <ToolbarButton
            title="Quote statement"
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            &ldquo; Quote
          </ToolbarButton>
          <ToolbarButton
            title="Insert horizontal divider line"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          >
            ― Divider
          </ToolbarButton>
          <ToolbarButton
            title="Insert article image"
            onClick={() => editor.chain().focus().setArticleImage({ src: "", alt: "", caption: null, credit: null }).run()}
          >
            🖼 Image
          </ToolbarButton>
        </div>

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        {/* Table Menu Toggle */}
        <div className="relative">
          <ToolbarButton
            title="Insert or configure table"
            active={isTableActive || tableOpen}
            onClick={() => {
              setLinkOpen(false);
              setTableOpen((v) => !v);
            }}
          >
            ⊞ Table {isTableActive ? "(Active)" : ""}
          </ToolbarButton>
          <EditorTablePopover editor={editor} open={tableOpen} onClose={() => setTableOpen(false)} />
        </div>
      </div>

      {/* Contextual Table Control Bar — only shows when cursor is inside a table */}
      {isTableActive && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/5 p-2 text-xs">
          <span className="flex items-center gap-1 font-semibold text-accent pr-1">
            <span className="inline-block h-2 w-2 rounded-full bg-accent animate-pulse" />
            Table:
          </span>
          <ToolbarButton title="Add Row Above" onClick={() => editor.chain().focus().addRowBefore().run()}>
            + Row Above
          </ToolbarButton>
          <ToolbarButton title="Add Row Below" onClick={() => editor.chain().focus().addRowAfter().run()}>
            + Row Below
          </ToolbarButton>
          <ToolbarButton title="Delete Row" onClick={() => editor.chain().focus().deleteRow().run()}>
            − Delete Row
          </ToolbarButton>
          <span className="mx-0.5 h-4 w-px bg-border" />
          <ToolbarButton title="Add Column Left" onClick={() => editor.chain().focus().addColumnBefore().run()}>
            + Col Left
          </ToolbarButton>
          <ToolbarButton title="Add Column Right" onClick={() => editor.chain().focus().addColumnAfter().run()}>
            + Col Right
          </ToolbarButton>
          <ToolbarButton title="Delete Column" onClick={() => editor.chain().focus().deleteColumn().run()}>
            − Delete Col
          </ToolbarButton>
          <span className="mx-0.5 h-4 w-px bg-border" />
          <ToolbarButton title="Toggle Header Row" onClick={() => editor.chain().focus().toggleHeaderRow().run()}>
            Header Row
          </ToolbarButton>
          <ToolbarButton title="Toggle Header Column" onClick={() => editor.chain().focus().toggleHeaderColumn().run()}>
            Header Col
          </ToolbarButton>
          <ToolbarButton title="Merge or split selected cells" onClick={() => editor.chain().focus().mergeOrSplit().run()}>
            Merge/Split
          </ToolbarButton>
          <span className="mx-0.5 h-4 w-px bg-border" />
          <ToolbarButton
            danger
            title="Delete this entire table"
            onClick={() => {
              if (window.confirm("Are you sure you want to delete this table?")) {
                editor.chain().focus().deleteTable().run();
              }
            }}
          >
            🗑 Delete Table
          </ToolbarButton>
        </div>
      )}

      <EditorLinkPopover editor={editor} open={linkOpen} onClose={() => setLinkOpen(false)} />
    </div>
  );
}
