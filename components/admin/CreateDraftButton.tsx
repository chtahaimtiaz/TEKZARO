"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface CreateDraftButtonProps {
  action: () => Promise<{ ok: boolean; error?: string; articleId?: string }>;
  label?: string;
}

export function CreateDraftButton({ action, label = "Create Draft" }: CreateDraftButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Could not create a draft.");
        return;
      }
      router.push(`/admin/articles/${result.articleId}`);
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
      >
        {pending ? "Creating…" : label}
      </button>
      {error && <p className="max-w-sm text-sm text-red-600">{error}</p>}
    </div>
  );
}
