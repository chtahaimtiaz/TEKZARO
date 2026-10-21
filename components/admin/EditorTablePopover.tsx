"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/react";

interface EditorTablePopoverProps {
  editor: Editor;
  open: boolean;
  onClose: () => void;
}

export function EditorTablePopover({ editor, open, onClose }: EditorTablePopoverProps) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [withHeaderRow, setWithHeaderRow] = useState(true);

  if (!open) return null;

  function insert() {
    const validRows = Math.min(Math.max(1, rows), 30);
    const validCols = Math.min(Math.max(1, cols), 15);
    editor
      .chain()
      .focus()
      .insertTable({ rows: validRows, cols: validCols, withHeaderRow })
      .run();
    onClose();
  }

  return (
    <div className="absolute z-20 mt-1 flex flex-col gap-3 rounded-lg border border-border-strong bg-paper-raised p-3 shadow-xl text-ink">
      <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Insert Table</p>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <label className="block mb-1 text-ink-soft">Rows (1-30)</label>
          <input
            type="number"
            min={1}
            max={30}
            value={rows}
            onChange={(e) => setRows(Number(e.target.value))}
            className="w-full rounded border border-border-strong bg-paper p-1.5 text-xs text-ink focus:border-accent"
          />
        </div>
        <div>
          <label className="block mb-1 text-ink-soft">Columns (1-15)</label>
          <input
            type="number"
            min={1}
            max={15}
            value={cols}
            onChange={(e) => setCols(Number(e.target.value))}
            className="w-full rounded border border-border-strong bg-paper p-1.5 text-xs text-ink focus:border-accent"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-ink-soft cursor-pointer">
        <input
          type="checkbox"
          checked={withHeaderRow}
          onChange={(e) => setWithHeaderRow(e.target.checked)}
          className="rounded border-border text-accent focus:ring-accent"
        />
        <span>Include header row</span>
      </label>
      <div className="flex justify-end gap-2 pt-1 border-t border-border">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-border px-2.5 py-1 text-xs text-ink-soft hover:bg-paper"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={insert}
          className="rounded bg-accent px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
        >
          Insert Table
        </button>
      </div>
    </div>
  );
}
