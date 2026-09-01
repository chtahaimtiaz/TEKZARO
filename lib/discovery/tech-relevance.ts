import type { RelevanceKeyword } from "./pakistan-relevance";

// A deliberately broad but bounded baseline vocabulary — same role as
// pakistan-relevance.ts's BUILTIN_PAKISTAN_TERMS: works out of the box
// before any editor has curated TOPIC keywords, and the Keyword table
// (managed at /admin/keywords, KeywordType "TOPIC") only ever adds to it,
// never replaces it. Covers the categories this project's spec names
// explicitly: AI/ML, smartphones/mobile, computing/hardware, cybersecurity,
// software, cloud, startups, robotics, space tech, consumer electronics,
// telecom, programming/data science, fintech-as-technology, and major tech
// company names.
const BUILTIN_TECH_TERMS = [
  "artificial intelligence", "machine learning", "deep learning", "neural network",
  "large language model", "generative ai", "chatbot", "algorithm",
  "smartphone", "iphone", "android", "mobile app", "app store",
  "computer", "laptop", "pc", "hardware", "motherboard",
  "cpu", "gpu", "processor", "semiconductor", "chipmaker", "chip",
  "cybersecurity", "data breach", "ransomware", "malware", "hacker", "vulnerability", "encryption",
  "software", "operating system", "open source", "programming", "developer", "coding", "api", "sdk",
  "cloud computing", "data center", "server", "saas",
  "startup", "venture capital", "seed funding", "series a", "tech company", "unicorn",
  "robotics", "automation", "drone", "autonomous vehicle", "self-driving",
  "space technology", "satellite", "spacex", "rocket launch", "nasa",
  "consumer electronics", "wearable", "smartwatch", "gadget", "vr", "ar", "virtual reality", "augmented reality",
  "internet platform", "social media platform", "streaming service",
  "telecom", "telecommunications", "broadband", "5g", "6g", "wifi", "network infrastructure",
  "data science", "big data", "database",
  "fintech", "digital payments", "cryptocurrency", "blockchain", "e-commerce platform",
  "tech policy", "data privacy regulation", "antitrust tech",
  // Major technology company names — a story naming one of these is almost
  // always technology news even without any other signal above matching.
  "google", "apple", "microsoft", "amazon", "meta", "facebook", "openai",
  "nvidia", "intel", "amd", "samsung", "huawei", "tesla", "ibm", "oracle",
  "tiktok", "twitter", "x corp", "uber", "spacex", "qualcomm",
];

export interface TechRelevanceResult {
  score: number;
  reasons: string[];
}

/**
 * Deterministic, keyword-based technology-topic classification — same
 * shape and philosophy as classifyPakistanRelevance: every point traces to
 * an actual matched term, surfaced in `reasons` so an editor can audit it.
 * Not a hard gate by itself — lib/discovery/priority.ts decides what a
 * zero score means for ranking. Caller should pass only active TOPIC
 * keywords (e.g. `Keyword.findMany({where:{type:"TOPIC", active:true}})`).
 */
export function classifyTechRelevance(
  text: string,
  configuredKeywords: RelevanceKeyword[],
): TechRelevanceResult {
  const haystack = text.toLowerCase();
  let score = 0;
  const reasons: string[] = [];
  const matched = new Set<string>();

  for (const term of BUILTIN_TECH_TERMS) {
    if (haystack.includes(term) && !matched.has(term)) {
      matched.add(term);
      score += 3;
      reasons.push(`Mentions "${term}"`);
    }
  }

  for (const kw of configuredKeywords) {
    const termLower = kw.term.toLowerCase();
    if (matched.has(termLower) || !haystack.includes(termLower)) continue;
    matched.add(termLower);
    const points = kw.priority ? 5 : 3;
    score += points;
    reasons.push(`Matches configured technology keyword "${kw.term}"${kw.priority ? " (priority)" : ""}`);
  }

  return { score, reasons };
}
