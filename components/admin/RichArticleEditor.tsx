"use client";

import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ArticleImage, CiteBlockquote } from "@/lib/editor/nodes";
import { blocksToTiptapContent, tiptapContentToBlocks } from "@/lib/editor/block-conversion";
import type { JSONContent } from "@tiptap/react";
import { segmentPlainTextPaste } from "@/lib/editor/paste-heuristics";
import type { ContentBlock } from "@/lib/content-blocks";
import type { ArticleMediaOption } from "@/lib/article-media";
import { EditorToolbar } from "./EditorToolbar";

interface RichArticleEditorProps {
  /** Canvas-eligible subset only (paragraph/heading/quote/list/image) —
   * ArticleEditor.tsx filters via splitCanvasBlocks before passing this. */
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  /** form.title.trim().length === 0, recomputed by the parent every render
   * — read at paste time to decide whether a detected title gets applied. */
  titleIsEmpty: boolean;
  onTitleDetected?: (title: string) => void;
  articleId?: string;
  mediaUploadAvailable: boolean;
  articleMediaOptions: ArticleMediaOption[];
  canManageMedia: boolean;
}

/** Reproduces ArticleBody.tsx's literal per-element classes on the editing
 * canvas, transcribed directly rather than approximated, so dark mode
 * (already token-driven there) needs no extra work here. */
// blocksToTiptapContent returns a bare array of top-level nodes — its own
// type (Content = HTMLContent | JSONContent | JSONContent[] | null) accepts
// that directly, but a real Editor's initial `content` / setContent() needs
// the full doc envelope; a raw non-empty array reaches EditorState.create
// without a schema-resolvable root and throws ("reading 'schema' of
// undefined") the moment there's real content to parse — confirmed via a
// live browser check against an existing published article, not caught by
// unit tests since those only exercise blocksToTiptapContent's own output
// shape, never feed it into a real Editor instance.
function asDoc(blocks: ContentBlock[]): JSONContent {
  return { type: "doc", content: blocksToTiptapContent(blocks) };
}

const CANVAS_CLASSES =
  "min-h-[300px] rounded-md border border-border-strong p-3 text-[1.05rem] leading-relaxed text-ink-soft focus:outline-none " +
  "[&_h2]:pt-2 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-ink " +
  "[&_h3]:pt-1 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-ink " +
  "[&_blockquote]:my-2 [&_blockquote]:not-italic " +
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 " +
  "[&_a]:text-accent [&_a]:underline " +
  "[&_p]:my-2";

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
  // Stale-closure guards: these props change every render (onChange/
  // onTitleDetected are inline closures from ArticleEditor.tsx, titleIsEmpty
  // is a derived boolean), but useEditor's config below only runs once
  // (empty deps — a non-empty deps array would destroy/recreate the editor,
  // losing cursor/selection/undo history, on every parent re-render). Each
  // ref is updated unconditionally on every render, with no effect needed,
  // and read from inside the config's callbacks instead of closing over the
  // prop directly.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onTitleDetectedRef = useRef(onTitleDetected);
  onTitleDetectedRef.current = onTitleDetected;
  const titleIsEmptyRef = useRef(titleIsEmpty);
  titleIsEmptyRef.current = titleIsEmpty;

  // What the canvas itself last emitted — compared against incoming
  // `blocks` so an external change (the Advanced raw-block editor, or
  // SuggestionsPanel's onInsertLink) triggers a re-seed, while the canvas's
  // own onUpdate firing right back with the same content does not (which
  // would otherwise fight the user's cursor position on every keystroke).
  const lastEmittedRef = useRef<ContentBlock[]>(blocks);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3] },
          blockquote: false, // replaced by CiteBlockquote below — avoids a duplicate "blockquote" node name
          strike: false,
          code: false,
          codeBlock: false,
          horizontalRule: false,
          link: { openOnClick: false, protocols: ["http", "https", "mailto"] },
        }),
        CiteBlockquote,
        ArticleImage.configure({ articleId, mediaUploadAvailable, articleMediaOptions, canManageMedia }),
      ],
      content: asDoc(blocks),
      immediatelyRender: false, // required for SSR: ArticleEditor is "use client" but Next still server-renders it for the initial HTML, and ProseMirror needs a real DOM
      onUpdate({ editor }) {
        const next = tiptapContentToBlocks(editor.getJSON());
        lastEmittedRef.current = next;
        onChangeRef.current(next);
      },
      editorProps: {
        // ProseMirror's handlePaste is (view, event, slice) => boolean | void;
        // the view/slice params aren't needed here (insertion goes through
        // the Editor wrapper's own chain(), not the raw view), and a
        // function declaring fewer params than the caller passes is a valid
        // substitute in TypeScript's structural typing.
        handlePaste(_view, event) {
          const html = event.clipboardData?.getData("text/html");
          if (html && html.trim()) return false; // real HTML paste — ProseMirror's own schema-driven parsing already handles Word/Docs/webpage paste correctly

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

          // Closes over `editor` from the useEditor() call this config
          // object belongs to — a valid forward reference since handlePaste
          // is only ever invoked long after useEditor has returned and
          // assigned it, never during construction itself.
          editor?.chain().focus().insertContent(blocksToTiptapContent(toInsert)).run();
          return true;
        },
      },
    },
    [],
  );

  useEffect(() => {
    if (!editor) return;
    if (JSON.stringify(blocks) === JSON.stringify(lastEmittedRef.current)) return; // echo of our own onUpdate — skip
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
