// Pure, dependency-free — safe to import from both server code and Client
// Components (unlike lib/slug.ts, which also touches the database and is
// marked server-only).
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
