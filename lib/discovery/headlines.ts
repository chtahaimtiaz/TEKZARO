export interface HeadlineSuggestion {
  style: "straight" | "seo" | "short" | "breaking" | "editorial";
  label: string;
  headline: string;
}

function cleanHeadline(raw: string): string {
  // Strip common RSS title suffixes like " - TechCrunch" or " | The Verge".
  return raw.replace(/\s*[-|–]\s*[A-Z][\w .]{2,30}$/, "").trim();
}

function firstEntityPhrase(headline: string): string | null {
  const match = headline.match(/\b([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*){0,2})\b/);
  return match ? match[1] : null;
}

function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${(lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated).trim()}…`;
}

/**
 * Five deterministic, template-based headline variants — no AI call, no
 * external dependency, always available. Explicitly NOT labeled
 * "AI-generated" anywhere in the UI (see components/admin) since nothing
 * here is a model output; it's plain, auditable string transformation.
 */
export function generateHeadlineSuggestions(rawHeadline: string, excerpt?: string): HeadlineSuggestion[] {
  const straight = cleanHeadline(rawHeadline);

  const entity = firstEntityPhrase(straight);
  const seo =
    entity && !straight.startsWith(entity) ? `${entity}: ${straight}` : straight;

  const short = truncateAtWord(straight, 60);

  const breaking = /^breaking[:\s]/i.test(straight) ? straight : `Breaking: ${straight}`;

  const firstClause = excerpt?.split(/[.!?]/)[0]?.trim();
  const editorial =
    firstClause && firstClause.length > 15 && firstClause.length < 90
      ? `${straight} — ${firstClause}`
      : straight;

  return [
    { style: "straight", label: "Straight news", headline: straight },
    { style: "seo", label: "SEO-optimized", headline: seo },
    { style: "short", label: "Short / mobile", headline: short },
    { style: "breaking", label: "Breaking-news style", headline: breaking },
    { style: "editorial", label: "Editorial", headline: editorial },
  ];
}
