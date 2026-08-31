"use client";

import { useRouter } from "next/navigation";
import { MediaUploadButton } from "./MediaUploadButton";

export function MediaLibraryUploader({ available }: { available: boolean }) {
  const router = useRouter();
  return (
    <MediaUploadButton
      kind="article"
      available={available}
      onUploaded={() => {
        router.refresh();
      }}
    />
  );
}
