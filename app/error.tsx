"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-4 text-center">
      <p className="eyebrow">500</p>
      <h1 className="mt-2 font-serif text-4xl font-bold">Something went wrong</h1>
      <p className="mt-3 max-w-md text-ink-soft">
        TEKZARO hit an unexpected error rendering this page. This has been logged; try again.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 rounded-md bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-soft"
      >
        Try again
      </button>
    </div>
  );
}
