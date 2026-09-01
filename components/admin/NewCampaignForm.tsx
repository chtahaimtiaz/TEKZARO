"use client";

import { useState } from "react";
import { wrapEmailHtml } from "@/lib/email/template";

interface NewCampaignFormProps {
  action: (formData: FormData) => void;
}

/** Client component so the preview can update as the admin types, instead
 * of only being visible after the campaign is already saved. Calls the
 * same wrapEmailHtml() the real send path uses, directly client-side —
 * see the note on that function for why it's safe to import here. */
export function NewCampaignForm({ action }: NewCampaignFormProps) {
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  return (
    <form action={action} className="mt-3 flex flex-col gap-3">
      <input
        name="subject"
        placeholder="Subject"
        required
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="rounded-md border border-border-strong bg-paper-raised p-2 text-sm text-ink"
      />
      <textarea
        name="bodyHtml"
        placeholder="HTML body"
        required
        rows={8}
        value={bodyHtml}
        onChange={(e) => setBodyHtml(e.target.value)}
        className="rounded-md border border-border-strong bg-paper-raised p-2 font-mono text-xs text-ink"
      />
      <p className="text-xs text-ink-muted">
        An unsubscribe link is appended automatically to every send — don&apos;t include your own.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="w-fit rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark dark:text-paper">
          Save draft
        </button>
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          disabled={!subject && !bodyHtml}
          className="w-fit rounded-md border border-border-strong px-4 py-2 text-sm font-semibold hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {showPreview ? "Hide preview" : "Preview"}
        </button>
      </div>

      {showPreview && (
        <div className="overflow-hidden rounded-md border border-border">
          <p className="border-b border-border bg-paper px-3 py-1 text-xs font-semibold text-ink-muted">
            Preview — as recipients will see it
          </p>
          <iframe title="Campaign preview" srcDoc={wrapEmailHtml(bodyHtml || "<p><em>Nothing to preview yet.</em></p>")} className="h-64 w-full" />
        </div>
      )}
    </form>
  );
}
