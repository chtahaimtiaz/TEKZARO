"use client";

import { useState } from "react";
import { AdCreativeUploadButton } from "./AdCreativeUploadButton";

interface AdCreativeFormProps {
  action: (formData: FormData) => void;
  available: boolean;
  initialImageUrl?: string;
  initialAltText?: string;
  initialTargetUrl?: string;
}

export function AdCreativeForm({ action, available, initialImageUrl = "", initialAltText = "", initialTargetUrl = "" }: AdCreativeFormProps) {
  const [imageUrl, setImageUrl] = useState(initialImageUrl);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-border bg-paper-raised p-4 text-sm">
      <input type="hidden" name="imageUrl" value={imageUrl} />
      <div className="flex flex-wrap items-center gap-3">
        <AdCreativeUploadButton available={available} onUploaded={setImageUrl} />
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- creative dimensions aren't known ahead of time, see AdSlot's note
          <img src={imageUrl} alt="Creative preview" className="h-16 w-28 rounded-md border border-border object-cover" />
        )}
      </div>
      <label className="flex flex-col gap-1">
        Alt text
        <input name="altText" defaultValue={initialAltText} required className="rounded-md border border-border-strong p-2" />
      </label>
      <label className="flex flex-col gap-1">
        Destination URL
        <input
          name="targetUrl"
          type="url"
          defaultValue={initialTargetUrl}
          required
          placeholder="https://…"
          className="rounded-md border border-border-strong p-2"
        />
      </label>
      <button
        type="submit"
        disabled={!imageUrl}
        className="w-fit rounded-md bg-accent px-4 py-2 font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50 dark:text-paper"
      >
        Save creative
      </button>
    </form>
  );
}
