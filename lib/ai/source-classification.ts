/**
 * Classifies an arbitrary URL by evidentiary weight.
 *
 * This is deliberately independent of the Source table. Source rows answer
 * "which feeds do we ingest from"; this answers "how much does a document
 * count as evidence" — two different questions that were previously the same
 * one. Because only ingested domains could be classified, a story could not
 * be verified against Reuters, the AP, a regulator, an SEC filing or a
 * research paper, since none of those are feeds TEKZARO subscribes to. Five
 * hostnames qualified as primary, and nine of the twenty-four secondary slots
 * were the Google News aggregator.
 *
 * Ordered by the weight a newsroom should give it, not by prestige.
 */
export enum SourceRank {
  /** First-party: the organisation the story is about, a regulator, a court,
   * a government body, a university, or a peer-reviewed/preprint paper. */
  PRIMARY = 1,
  /** Major independent newsgathering with its own reporting desks. */
  MAJOR_INDEPENDENT = 2,
  /** Specialist technology/science publication with genuine domain expertise. */
  SPECIALIST = 3,
  /** General publication — real reporting, no particular subject expertise. */
  GENERAL = 4,
  /** Republishes other outlets' work; carries no independent weight. */
  AGGREGATOR = 5,
  /** Unrecognised. Usable, but never as the basis for a confirmation. */
  UNKNOWN = 6,
}

export interface SourceClassification {
  rank: SourceRank;
  /** Human-readable justification, carried into the evidence bundle so an
   * editor can see why a document was weighted as it was. */
  label: string;
  hostname: string;
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

/** Matches a host against a list, allowing subdomains: "newsroom.apple.com"
 * matches "apple.com". Compared label-wise so "notapple.com" never matches. */
function hostMatches(host: string, domains: ReadonlySet<string>): string | null {
  if (domains.has(host)) return host;
  const parts = host.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".");
    if (domains.has(candidate)) return candidate;
  }
  return null;
}

/** Wire services and national broadcasters that run their own reporting
 * desks. Deliberately short — this tier should be hard to enter. */
const MAJOR_INDEPENDENT: ReadonlySet<string> = new Set([
  "reuters.com", "apnews.com", "ap.org", "bbc.com", "bbc.co.uk", "ft.com",
  "bloomberg.com", "wsj.com", "nytimes.com", "washingtonpost.com",
  "economist.com", "cnbc.com", "theguardian.com", "aljazeera.com", "afp.com",
  "npr.org", "dawn.com", "thenews.com.pk", "tribune.com.pk", "brecorder.com",
]);

const SPECIALIST: ReadonlySet<string> = new Set([
  "techcrunch.com", "arstechnica.com", "theverge.com", "wired.com",
  "technologyreview.com", "spectrum.ieee.org", "ieee.org", "acm.org",
  "zdnet.com", "techrepublic.com", "thenewstack.io", "theregister.com",
  "anandtech.com", "tomshardware.com", "bleepingcomputer.com",
  "thehackernews.com", "krebsonsecurity.com", "securityweek.com",
  "engadget.com", "9to5mac.com", "9to5google.com", "macrumors.com",
  "androidauthority.com", "gsmarena.com", "spacenews.com", "nasaspaceflight.com",
  "pcgamer.com", "polygon.com", "eurogamer.net", "crunchbase.com",
  "propakistani.pk", "techjuice.pk", "phoronix.com", "semianalysis.com",
]);

/** Republishers. Ranked below general publications because a hit here is
 * usually the same wire copy the original outlet already carries. */
const AGGREGATORS: ReadonlySet<string> = new Set([
  "news.google.com", "news.yahoo.com", "yahoo.com", "msn.com", "flipboard.com",
  "news.ycombinator.com", "reddit.com", "medium.com", "substack.com",
  "linkedin.com", "facebook.com", "x.com", "twitter.com", "instagram.com",
  "wikipedia.org", "prnewswire.com", "businesswire.com", "globenewswire.com",
]);

/** Research and standards bodies — primary by nature of what they publish. */
const RESEARCH_PRIMARY: ReadonlySet<string> = new Set([
  "arxiv.org", "nature.com", "science.org", "sciencedirect.com", "pnas.org",
  "cell.com", "thelancet.com", "nejm.org", "plos.org", "biorxiv.org",
  "medrxiv.org", "ssrn.com", "jstor.org", "springer.com", "wiley.com",
  "openreview.net", "neurips.cc", "mlr.press", "aclanthology.org",
  "rfc-editor.org", "ietf.org", "w3.org", "iso.org", "nist.gov", "cve.org",
]);

/** Official first-party technology sources — company newsrooms, research
 * arms and security advisories. A story about one of these companies is
 * verified against them; a story about someone else is not. */
const COMPANY_PRIMARY: ReadonlySet<string> = new Set([
  "apple.com", "openai.com", "anthropic.com", "google", "research.google",
  "blog.google", "deepmind.com", "microsoft.com", "meta.com", "nvidia.com",
  "amd.com", "intel.com", "qualcomm.com", "arm.com", "samsung.com", "ibm.com",
  "aws.amazon.com", "amazon.com", "tesla.com", "spacex.com", "mozilla.org",
  "cloudflare.com", "github.blog", "gitlab.com", "oracle.com", "salesforce.com",
  "adobe.com", "tsmc.com", "sony.com", "huawei.com", "xiaomi.com", "oppo.com",
]);

/** Government/regulatory/academic suffixes. Checked as suffixes so any
 * ministry, regulator or university under them qualifies without being
 * enumerated — this is what makes sbp.org.pk, pta.gov.pk, sec.gov and
 * mit.edu reachable as primary evidence. */
const OFFICIAL_SUFFIXES = [
  ".gov", ".gov.pk", ".gov.uk", ".gov.au", ".gov.in", ".mil",
  ".edu", ".edu.pk", ".ac.uk", ".ac.jp", ".edu.au",
  ".europa.eu", ".un.org", ".who.int", ".imf.org", ".worldbank.org",
];

/** Pakistani institutions that do not sit under a .gov.pk suffix but are
 * first-party for the subjects TEKZARO covers most. */
const PK_OFFICIAL: ReadonlySet<string> = new Set([
  "sbp.org.pk", "pta.gov.pk", "pseb.org.pk", "nadra.gov.pk", "pbs.gov.pk",
  "hec.gov.pk", "ecp.gov.pk", "karandaaz.com.pk", "nccia.gov.pk",
]);

/** URL paths that mark a page as a first-party announcement even on a domain
 * that is not otherwise classified — a company newsroom, press release or
 * investor filing is primary regardless of who the company is. */
const OFFICIAL_PATH =
  /\/(newsroom|press-?release|press-?room|press-?centre|press-?center|media-?release|investor|investors|ir\/|sec-filing|filings|regulatory|announcement|advisory|advisories|security-bulletin|cve|whitepaper|research\/publication)/i;

/** Subdomains that indicate a first-party channel of whatever organisation
 * owns the domain. */
const OFFICIAL_SUBDOMAIN = /^(newsroom|press|media|investor|investors|ir|blog|research|about|security|developer|developers|docs|status)\./i;

export function classifySource(rawUrl: string): SourceClassification {
  let host: string;
  let pathname: string;
  try {
    const u = new URL(rawUrl);
    host = normalizeHost(u.hostname);
    pathname = u.pathname;
  } catch {
    return { rank: SourceRank.UNKNOWN, label: "Unparseable URL", hostname: "" };
  }

  // Aggregators are checked first: a Google News or Yahoo URL wrapping a
  // Reuters story is still an aggregator page, and treating it as the
  // underlying outlet would overstate the evidence.
  const agg = hostMatches(host, AGGREGATORS);
  if (agg) return { rank: SourceRank.AGGREGATOR, label: `Aggregator (${agg})`, hostname: host };

  if (OFFICIAL_SUFFIXES.some((s) => host.endsWith(s)) || PK_OFFICIAL.has(host)) {
    return { rank: SourceRank.PRIMARY, label: `Official government, regulatory or academic source (${host})`, hostname: host };
  }

  const research = hostMatches(host, RESEARCH_PRIMARY);
  if (research) return { rank: SourceRank.PRIMARY, label: `Research or standards publication (${research})`, hostname: host };

  const company = hostMatches(host, COMPANY_PRIMARY);
  if (company) return { rank: SourceRank.PRIMARY, label: `Official company source (${company})`, hostname: host };

  if (OFFICIAL_PATH.test(pathname)) {
    return { rank: SourceRank.PRIMARY, label: `First-party announcement page (${host})`, hostname: host };
  }

  const major = hostMatches(host, MAJOR_INDEPENDENT);
  if (major) return { rank: SourceRank.MAJOR_INDEPENDENT, label: `Major independent newsroom (${major})`, hostname: host };

  const specialist = hostMatches(host, SPECIALIST);
  if (specialist) return { rank: SourceRank.SPECIALIST, label: `Specialist technology publication (${specialist})`, hostname: host };

  // A first-party subdomain of an otherwise unknown organisation still
  // reports on itself — weaker than a known company newsroom, but stronger
  // than an unidentified page.
  if (OFFICIAL_SUBDOMAIN.test(new URL(rawUrl).hostname.toLowerCase())) {
    return { rank: SourceRank.GENERAL, label: `Apparent first-party channel (${host})`, hostname: host };
  }

  return { rank: SourceRank.UNKNOWN, label: `Unrecognised source (${host})`, hostname: host };
}

/** Whether a document at this rank can support PRIMARY_SOURCE_CONFIRMED. */
export function isPrimaryRank(rank: SourceRank): boolean {
  return rank === SourceRank.PRIMARY;
}

/** Whether a document carries enough independent weight to corroborate.
 * Aggregators and unknown sources deliberately do not. */
export function isCorroboratingRank(rank: SourceRank): boolean {
  return rank <= SourceRank.GENERAL;
}

export function rankName(rank: SourceRank): string {
  return {
    [SourceRank.PRIMARY]: "primary",
    [SourceRank.MAJOR_INDEPENDENT]: "major independent",
    [SourceRank.SPECIALIST]: "specialist",
    [SourceRank.GENERAL]: "general",
    [SourceRank.AGGREGATOR]: "aggregator",
    [SourceRank.UNKNOWN]: "unknown",
  }[rank];
}
