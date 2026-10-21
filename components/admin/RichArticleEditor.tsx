"use client";

import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TextAlign } from "@tiptap/extension-text-align";
import { ArticleImage, CiteBlockquote } from "@/lib/editor/nodes";
import { blocksToTiptapContent, tiptapContentToBlocks } from "@/lib/editor/block-conversion";
import type { JSONContent } from "@tiptap/react";
import { segmentPlainTextPaste } from "@/lib/editor/paste-heuristics";
import type { ContentBlock } from "@/lib/content-blocks";
import type { ArticleMediaOption } from "@/lib/article-media";
import { EditorToolbar } from "./EditorToolbar";

interface RichArticleEditorProps {
  /** Canvas-eligible subset (paragraph, heading, quote, list, image, table, divider) */
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  titleIsEmpty: boolean;
  onTitleDetected?: (title: string) => void;
  articleId?: string;
  mediaUploadAvailable: boolean;
  articleMediaOptions: ArticleMediaOption[];
  canManageMedia: boolean;
}

function asDoc(blocks: ContentBlock[]): JSONContent {
  return { type: "doc", content: blocksToTiptapContent(blocks) };
}

const CANVAS_CLASSES =
  "min-h-[350px] rounded-md border border-border-strong p-4 text-[1.05rem] leading-relaxed text-ink-soft focus:outline-none " +
  "[&_h2]:pt-4 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-ink " +
  "[&_h3]:pt-3 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-ink " +
  "[&_h4]:pt-2 [&_h4]:text-lg [&_h4]:font-bold [&_h4]:text-ink " +
  "[&_blockquote]:my-3 [&_blockquote]:not-italic " +
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 " +
  "[&_a]:text-accent [&_a]:underline " +
  "[&_u]:underline [&_s]:line-through " +
  "[&_hr]:my-6 [&_hr]:border-t [&_hr]:border-border " +
  "[&_p]:my-2 " +
  // Rich Table styling inside the WYSIWYG canvas:
  "[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-lg [&_table]:border [&_table]:border-border " +
  "[&_th]:border [&_th]:border-border [&_th]:bg-paper-raised [&_th]:p-3 [&_th]:font-bold [&_th]:text-ink [&_th]:text-left " +
  "[&_td]:border [&_td]:border-border [&_td]:p-3 [&_td]:align-top " +
  "[&_.selectedCell]:bg-accent/15 [&_.selectedCell]:border-accent";

export function RichArticleEditor({
  blocks,
  onChange,
  titleIsEmpty,
  onTitleDetected,
  articleId,
  mediaUploadAvailable,
  articleMediaOptions,
  canManageMedia,
}: RichArticleEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onTitleDetectedRef = useRef(onTitleDetected);
  onTitleDetectedRef.current = onTitleDetected;
  const titleIsEmptyRef = useRef(titleIsEmpty);
  titleIsEmptyRef.current = titleIsEmpty;

  const lastEmittedRef = useRef<ContentBlock[]>(blocks);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3, 4] },
          blockquote: false, // replaced by CiteBlockquote below
          strike: {}, // enable strikethrough
          code: false,
          codeBlock: false,
          horizontalRule: {}, // enable horizontal rule
          link: { openOnClick: false, protocols: ["http", "https", "mailto"] },
        }),
        Underline,
        TextAlign.configure({
          types: ["heading", "paragraph"],
        }),
        Table.configure({
          resizable: true,
        }),
        TableRow,
        TableHeader,
        TableCell,
        CiteBlockquote,
        ArticleImage.configure({ articleId, mediaUploadAvailable, articleMediaOptions, canManageMedia }),
      ],
      content: asDoc(blocks),
      immediatelyRender: false,
      onUpdate({ editor }) {
        const next = tiptapContentToBlocks(editor.getJSON());
        lastEmittedRef.current = next;
        onChangeRef.current(next);
      },
      editorProps: {
        handlePaste(_view, event) {
          const html = event.clipboardData?.getData("text/html");
          if (html && html.trim()) return false; // real HTML paste (including tables from Word/Docs/Excel) handled by schema

          const text = event.clipboardData?.getData("text/plain");
          if (!text) return false;

          const { extractedTitle, titleAsBodyBlock, blocks: pasted } = segmentPlainTextPaste(text);
          let toInsert: ContentBlock[];
          if (extractedTitle && titleIsEmptyRef.current) {
            onTitleDetectedRef.current?.(extractedTitle);
            toInsert = pasted;
          } else if (extractedTitle) {
            toInsert = [titleAsBodyBlock!, ...pasted];
          } else {
            toInsert = pasted;
          }

          editor?.chain().focus().insertContent(blocksToTiptapContent(toInsert)).run();
          return true;
        },
      },
    },
    [],
  );

  useEffect(() => {
    if (!editor) return;
    if (JSON.stringify(blocks) === JSON.stringify(lastEmittedRef.current)) return;
    editor.commands.setContent(asDoc(blocks), { emitUpdate: false });
    lastEmittedRef.current = blocks;
  }, [blocks, editor]);

  if (!editor) return null;

  return (
    <div>
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} className={CANVAS_CLASSES} />
    </div>
  );
}
