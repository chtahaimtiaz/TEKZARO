import { formatDateTime } from "@/lib/format";

interface PublishedUpdatedMetaProps {
  publishedAt: Date | null;
  updatedAt: Date;
}

export function PublishedUpdatedMeta({ publishedAt, updatedAt }: PublishedUpdatedMetaProps) {
  const wasUpdated = publishedAt && updatedAt.getTime() - publishedAt.getTime() > 60_000;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
      {publishedAt && (
        <span>
          Published <time dateTime={publishedAt.toISOString()}>{formatDateTime(publishedAt)}</time>
        </span>
      )}
      {wasUpdated && (
        <span className="font-medium text-accent">
          Updated <time dateTime={updatedAt.toISOString()}>{formatDateTime(updatedAt)}</time>
        </span>
      )}
    </div>
  );
}
