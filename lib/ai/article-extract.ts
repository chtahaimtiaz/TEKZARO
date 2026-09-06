/**
 * Extracts an article's readable body and metadata from a fetched HTML page.
 *
 * The previous approach stripped every tag from the whole document, so
 * navigation, cookie banners, related-article rails and footers reached the
 * model as source material. Measured on real pages that left as little as
 * 43% of the text as actual article body — and because the evidence budget
 * truncates, boilerplate could crowd the article out of the window entirely.
 *
 * Hand-rolled rather than pulling in a readability/DOM dependency, matching
 * lib/images/sniff.ts and lib/ingestion/feed-parser.ts: this runs on
 * untrusted third-party HTML, so every loop below is bounded and there is no
 * third-party parser to be DoS'd. It is deliberately conservative — where it
 * cannot confidently identify a body it returns what it found and lets the
 * caller decide, rather than guessing.
 */

export interface ExtractedArticle {
  /** Readable body with structure preserved: "## " for subheadings, "- " for
   * list items, "> " for quotes. Those markers matter less than the fact that
   * headings, lists and quoted statements survive as evidence at all. */
  text: string;
  title: string | null;
  author: string | null;
  publishedAt: string | null;
  canonicalUrl: string | null;
  /** Characters of body text recovered — drives the richness classification. */
  length: number;
}

const STRIP_ELEMENTS = [
  "script", "style", "noscript", "svg", "iframe", "form", "nav", "header",
  "footer", "aside", "figcaption", "picture", "video", "audio",
  "button", "select", "textarea", "template",
];

/** Class/id fragments that reliably mark non-article furniture. Matched only
 * against an opening tag's class/id attribute, never against body text, so a
 * paragraph that happens to discuss advertising is never dropped. */
const BOILERPLATE_ATTR =
  /(^|[\s"_-])(nav|menu|sidebar|side-bar|comment|footer|header|masthead|share|social|related|recommend|promo|advert|ads?|ad-slot|ad-unit|cookie|consent|gdpr|newsletter|subscribe|subscription|paywall|breadcrumb|pagination|tag-list|author-box|meta-box|widget|popup|modal|banner|toolbar|skip-link|screen-reader|visually-hidden)([\s"_-]|$)/i;

function removeElements(html: string, tags: string[]): string {
  let out = html;
  for (const tag of tags) {
    out = out.replace(new RegExp("<" + tag + "\\b[^>]*>[\\s\\S]*?</" + tag + ">", "gi"), " ");
    out = out.replace(new RegExp("<" + tag + "\\b[^>]*/?>", "gi"), " ");
  }
  return out;
}

/** Drops div/section/list blocks whose own class or id looks like furniture.
 * One nesting level resolves per pass and the pass count is capped, so
 * malformed or adversarial markup cannot loop. */
function removeBoilerplateContainers(html: string): string {
  let out = html;
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    out = out.replace(/<(div|section|ul|ol)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (match, _tag, attrs: string) => {
      const attrText = /\s(?:class|id)\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? "";
      if (attrText && BOILERPLATE_ATTR.test(attrText)) {
        changed = true;
        return " ";
      }
      return match;
    });
    if (!changed) break;
  }
  return out;
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&#(\d{1,6});/g, (_m, d: string) => {
      const n = Number(d);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    });
}

function textOf(html: string): string {
  return decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function metaContent(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = re.exec(html);
    if (m && m[1]) {
      const v = decode(m[1]).replace(/\s+/g, " ").trim();
      if (v) return v;
    }
  }
  return null;
}

function paragraphChars(html: string): number {
  let total = 0;
  for (const m of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = textOf(m[1]);
    if (t.length > 40) total += t.length;
  }
  return total;
}

/** Picks the container holding the most paragraph text. Semantic wrappers win
 * outright when they carry real text; otherwise every block is scored, which
 * is what handles publishers that mark articles up with plain divs. */
function selectBody(html: string): string {
  const semantic = [
    /<article\b[^>]*>([\s\S]*?)<\/article>/i,
    /<[^>]+itemprop\s*=\s*["']articleBody["'][^>]*>([\s\S]*?)<\/[a-z]+>/i,
    /<main\b[^>]*>([\s\S]*?)<\/main>/i,
  ];
  for (const re of semantic) {
    const m = re.exec(html);
    if (m && m[1] && paragraphChars(m[1]) > 400) return m[1];
  }

  let best = "";
  let bestScore = 0;
  let seen = 0;
  for (const m of html.matchAll(/<(?:div|section)\b[^>]*>([\s\S]*?)<\/(?:div|section)>/gi)) {
    if (++seen > 400) break; // hard cap: never walk an unbounded document
    const score = paragraphChars(m[1]);
    if (score > bestScore) {
      bestScore = score;
      best = m[1];
    }
  }
  return bestScore > 400 ? best : html;
}

const SKIP_LINE = /^(share|advertisement|sponsored|related|read more|sign up|subscribe|follow us|image credit|photo by)\b/i;

export function extractArticle(html: string, url: string): ExtractedArticle {
  const canonicalUrl = metaContent(html, [
    /<link[^>]+rel\s*=\s*["']canonical["'][^>]+href\s*=\s*["']([^"']+)["']/i,
    /<meta[^>]+property\s*=\s*["']og:url["'][^>]+content\s*=\s*["']([^"']+)["']/i,
  ]);
  const title = metaContent(html, [
    /<meta[^>]+property\s*=\s*["']og:title["'][^>]+content\s*=\s*["']([^"']+)["']/i,
    /<meta[^>]+name\s*=\s*["']twitter:title["'][^>]+content\s*=\s*["']([^"']+)["']/i,
    /<title\b[^>]*>([\s\S]*?)<\/title>/i,
  ]);
  const publishedAt = metaContent(html, [
    /<meta[^>]+property\s*=\s*["']article:published_time["'][^>]+content\s*=\s*["']([^"']+)["']/i,
    /<meta[^>]+name\s*=\s*["'](?:date|pubdate|publish-date|DC\.date)["'][^>]+content\s*=\s*["']([^"']+)["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /<time[^>]+datetime\s*=\s*["']([^"']+)["']/i,
  ]);
  const author = metaContent(html, [
    /<meta[^>]+name\s*=\s*["']author["'][^>]+content\s*=\s*["']([^"']+)["']/i,
    /<meta[^>]+property\s*=\s*["']article:author["'][^>]+content\s*=\s*["']([^"']+)["']/i,
    /"author"\s*:\s*\{[^}]*?"name"\s*:\s*"([^"]+)"/i,
  ]);

  const cleaned = removeBoilerplateContainers(removeElements(html, STRIP_ELEMENTS));
  const body = selectBody(cleaned);

  // Walk block elements in document order, so subheadings stay attached to
  // the paragraphs they introduce and lists/quotes survive as evidence
  // instead of being flattened into undifferentiated prose.
  const parts: string[] = [];
  let seen = 0;
  for (const m of body.matchAll(/<(h2|h3|h4|p|li|blockquote|td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    if (++seen > 1500) break;
    const tag = m[1].toLowerCase();
    const t = textOf(m[2]);
    if (!t) continue;
    if (tag === "p" && t.length < 40) continue; // captions, bylines, stray labels
    if (tag === "li" && t.length < 15) continue;
    if (SKIP_LINE.test(t)) continue;
    if (tag.startsWith("h")) parts.push("\n## " + t + "\n");
    else if (tag === "li") parts.push("- " + t);
    else if (tag === "blockquote") parts.push("> " + t);
    else parts.push(t);
  }

  let text = parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // Nothing structural recovered — fall back to flat text of the selected
  // body, so a page using unusual markup still yields evidence rather than
  // nothing at all.
  if (text.length < 200) text = textOf(body);

  return { text, title, author, publishedAt, canonicalUrl: canonicalUrl ?? url, length: text.length };
}
