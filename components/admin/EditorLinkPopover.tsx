"use client";

import { useState, useEffect } from "react";
import type { Editor } from "@tiptap/react";

interface EditorLinkPopoverProps {
  editor: Editor;
  open: boolean;
  onClose: () => void;
}

export function EditorLinkPopover({ editor, open, onClose }: EditorLinkPopoverProps) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!open) return;
    const existing = editor.getAttributes("link").href;
    setUrl(typeof existing === "string" ? existing : "");
  }, [open, editor]);

  if (!open) return null;

  function apply() {
    const trimmed = url.trim();
    if (trimmed) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    onClose();
  }

  function remove() {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    onClose();
  }

  return (
    <div className="absolute z-20 mt-1 flex items-center gap-2 rounded-md border border-border-strong bg-paper-raised p-2 shadow-lg">
      <input
        autoFocus
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder="https://…"
        className="w-56 rounded-md border border-border-strong p-1.5 text-sm focus:border-accent"
      />
      <button type="button" onClick={apply} className="rounded-md border border-border px-2 py-1 text-xs font-semibold hover:border-accent">
        Apply
      </button>
      <button type="button" onClick={remove} className="rounded-md border border-border px-2 py-1 text-xs text-red-600 hover:border-red-400 dark:text-red-400">
        Remove
      </button>
    </div>
  );
}
