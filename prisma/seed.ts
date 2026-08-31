import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma as db } from "../lib/prisma";
import { estimateReadingTime } from "../lib/reading-time";
import { slugify } from "../lib/slug";
import type { ContentBlock } from "../lib/content-blocks";

// ---------------------------------------------------------------------------
// DEMO CONTENT. Every article below is fictional/illustrative — it exists so
// the site can be built and tested end-to-end (spec section 63). Company
// names are kept generic on purpose so nothing here could be mistaken for a
// real announcement. Every seeded article is flagged isDemo: true and gets a
// visible "Demo" badge in the UI.
// ---------------------------------------------------------------------------

function daysAgoDate(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

interface Section {
  whatHappened: string[];
  whyMatters: string[];
  context?: string[];
  quote?: { text: string; cite: string };
  list?: { style: "bullet" | "number"; items: string[] };
  pakistanImpact?: string;
}

function buildBlocks(lead: string, s: Section): ContentBlock[] {
  const blocks: ContentBlock[] = [{ type: "paragraph", text: lead }];
  blocks.push({ type: "heading", level: 2, text: "What Happened" });
  s.whatHappened.forEach((t) => blocks.push({ type: "paragraph", text: t }));
  if (s.quote) blocks.push({ type: "quote", text: s.quote.text, cite: s.quote.cite });
  blocks.push({ type: "heading", level: 2, text: "Why It Matters" });
  s.whyMatters.forEach((t) => blocks.push({ type: "paragraph", text: t }));
  if (s.list) blocks.push({ type: "list", style: s.list.style, items: s.list.items });
  if (s.context) {
    blocks.push({ type: "heading", level: 2, text: "Context" });
    s.context.forEach((t) => blocks.push({ type: "paragraph", text: t }));
  }
  if (s.pakistanImpact) {
    blocks.push({ type: "pakistan-impact", text: s.pakistanImpact });
  }
  return blocks;
}

const CATEGORIES = [
  { slug: "pakistan-tech", name: "Pakistan Tech", description: "Technology news from Pakistan — startups, policy, telecom, cybersecurity, IT exports and the people building Pakistan's digital economy." },
  { slug: "ai", name: "AI", description: "Artificial intelligence models, research, tools and the companies building them." },
  { slug: "smartphones", name: "Smartphones", description: "Phones, mobile platforms, chips and the devices shaping how people connect." },
  { slug: "computing", name: "Computing", description: "PCs, processors, operating systems and the infrastructure behind modern computing." },
  { slug: "gadgets", name: "Gadgets", description: "Wearables, smart-home devices and the hardware changing everyday life." },
  { slug: "cybersecurity", name: "Cybersecurity", description: "Vulnerabilities, breaches, defensive research and the security of connected systems." },
  { slug: "software", name: "Software", description: "Applications, developer tools, platforms and the code running the modern internet." },
  { slug: "gaming", name: "Gaming", description: "Games, consoles, engines and the business behind interactive entertainment." },
  { slug: "startups", name: "Startups", description: "Funding rounds, founders and the companies building what's next." },
  { slug: "space", name: "Space", description: "Space & Science — launches, missions, research and discovery beyond Earth." },
  { slug: "enterprise", name: "Enterprise", description: "Enterprise technology, cloud infrastructure and the systems running large organizations." },
];

const AUTHORS = [
  { slug: "ayesha-raza", name: "Ayesha Raza", position: "Senior Editor, AI & Enterprise", bio: "Ayesha leads TEKZARO's AI and enterprise technology coverage, with a focus on how emerging platforms reach Pakistani developers and businesses." },
  { slug: "bilal-ahmed", name: "Bilal Ahmed", position: "Reporter, Pakistan Tech & Telecom", bio: "Bilal covers Pakistan's startup ecosystem, telecom policy and digital infrastructure from Islamabad." },
  { slug: "sara-khawaja", name: "Sara Khawaja", position: "Reporter, Smartphones & Gadgets", bio: "Sara reports on consumer hardware, from flagship phones to the gadgets that follow them." },
  { slug: "daniyal-farooq", name: "Daniyal Farooq", position: "Reporter, Cybersecurity", bio: "Daniyal covers vulnerability disclosures, breaches and the defensive research community." },
  { slug: "meher-fatima", name: "Meher Fatima", position: "Reporter, Startups & Business", bio: "Meher tracks funding rounds and the founders building the next generation of technology companies." },
  { slug: "tekzaro-editorial", name: "TEKZARO Editorial", position: "Newsroom Staff", bio: "Reporting from the TEKZARO editorial desk." },
];

const TAGS = [
  "AI", "LLM", "Startups", "Funding", "Cybersecurity", "Vulnerability", "5G", "Telecom",
  "PTA", "IT Exports", "Freelancers", "Fintech", "Gaming", "Consoles", "Space", "Semiconductors",
  "Cloud", "Enterprise", "Smartphones", "Chips", "Privacy", "Open Source", "Research", "Displays",
  "Policy", "Data Payments", "Software",
];

interface SeedArticle {
  title: string;
  subheadline: string;
  excerpt: string;
  category: string;
  author: string;
  tags: string[];
  daysAgo: number;
  breaking?: boolean;
  featured?: boolean;
  pakistanRelevance?: number;
  regionalRelevance?: number;
  globalSignificance?: number;
  section: Section;
}

const ARTICLES: SeedArticle[] = [
  // ---------------- PAKISTAN TECH ----------------
  {
    title: "State Bank Greenlights Broader Digital Wallet Interoperability",
    subheadline: "New rules let customers move funds between competing wallet providers without a bank account as an intermediary.",
    excerpt: "A new regulatory framework allows Pakistan's digital wallet providers to interoperate directly, a change fintech firms have requested for years.",
    category: "pakistan-tech", author: "bilal-ahmed", tags: ["Fintech", "Data Payments", "Policy"],
    daysAgo: 3, featured: false, pakistanRelevance: 100, regionalRelevance: 40, globalSignificance: 15,
    section: {
      whatHappened: [
        "Pakistan's central banking regulator published a framework allowing licensed digital wallet providers to route transfers directly to one another, without requiring a linked bank account to bridge the transaction.",
        "The rules set minimum security and reconciliation standards providers must meet before enabling cross-wallet transfers, with a phased rollout starting with the largest providers by user base.",
      ],
      whyMatters: [
        "Pakistan has one of the fastest-growing mobile wallet user bases in the region, but transfers between providers have historically been slow or required a bank account most users don't have.",
        "Removing that friction could meaningfully expand digital payments among Pakistan's largely unbanked population, particularly for remittances and small merchant payments.",
      ],
      context: [
        "Fintech operators had lobbied for interoperability rules since at least 2023, arguing that walled-garden wallets were holding back adoption compared to markets with unified payment rails.",
      ],
    },
  },
  {
    title: "Karachi SaaS Startup Raises Pre-Series A to Scale IT Exports",
    subheadline: "The round will fund expansion of a workflow-automation product already selling to clients in the Gulf and Europe.",
    excerpt: "A Karachi-based B2B software startup has closed a pre-Series A round to grow its export-focused sales team.",
    category: "pakistan-tech", author: "meher-fatima", tags: ["Startups", "Funding", "IT Exports"],
    daysAgo: 6, pakistanRelevance: 100, regionalRelevance: 20, globalSignificance: 10,
    section: {
      whatHappened: [
        "A Karachi-headquartered workflow-automation startup announced a pre-Series A round led by a regional venture fund, with participation from two Pakistani angel syndicates.",
        "The company says the funding will go toward expanding its sales and support team serving clients in the UAE, Saudi Arabia and the UK, where most of its revenue currently originates.",
      ],
      whyMatters: [
        "The deal is a data point in Pakistan's broader push to grow IT exports, which the government has repeatedly named as a priority for foreign exchange earnings.",
        "Export-focused Pakistani software startups have had an uneven fundraising environment over the past two years; a completed round signals continued investor interest despite that backdrop.",
      ],
      list: { style: "bullet", items: [
        "Round size and valuation were not disclosed",
        "Company reports roughly 40 employees, most based in Karachi",
        "Existing clients concentrated in Gulf and European markets",
      ] },
    },
  },
  {
    title: "PTA Sets Timeline Framework for Upcoming 5G Spectrum Auction",
    subheadline: "The regulator says a formal auction date will follow a public consultation period with telecom operators.",
    excerpt: "Pakistan's telecom regulator has published a framework outlining the process and rough timeline for its long-anticipated 5G spectrum auction.",
    category: "pakistan-tech", author: "bilal-ahmed", tags: ["5G", "Telecom", "PTA", "Policy"],
    daysAgo: 9, pakistanRelevance: 100, regionalRelevance: 35, globalSignificance: 10,
    section: {
      whatHappened: [
        "The Pakistan Telecommunication Authority released a consultation document laying out how it intends to structure the country's 5G spectrum auction, including proposed frequency bands and reserve pricing methodology.",
        "Operators have 45 days to submit feedback before the regulator finalizes auction rules.",
      ],
      whyMatters: [
        "Pakistan has lagged regional peers in 5G rollout, and operators have cited spectrum cost and availability as a central obstacle.",
        "A clear, published timeline gives operators a basis to plan capital spending, which industry groups say has been delayed by regulatory uncertainty.",
      ],
      context: [
        "Earlier attempts to schedule a spectrum auction were postponed amid disputes over reserve pricing and operator debt owed to the regulator.",
      ],
    },
  },
  {
    title: "University Lab Publishes Open Dataset for Urdu Speech Recognition",
    subheadline: "The dataset is aimed at closing a gap researchers say has slowed voice-AI development for Urdu speakers.",
    excerpt: "A Lahore university research group has released an open-licensed Urdu speech dataset intended to improve voice recognition tools for local languages.",
    category: "pakistan-tech", author: "ayesha-raza", tags: ["AI", "Research", "Open Source"],
    daysAgo: 12, pakistanRelevance: 95, regionalRelevance: 45, globalSignificance: 20,
    section: {
      whatHappened: [
        "A university research lab in Lahore published an openly licensed dataset of transcribed Urdu speech spanning multiple regional accents and recording conditions.",
        "The team says the dataset is roughly triple the size of the largest previously available open Urdu speech corpus.",
      ],
      whyMatters: [
        "Voice-AI researchers have long pointed to a shortage of high-quality training data for Urdu and other South Asian languages as a barrier to accurate speech recognition.",
        "An open dataset lowers the cost of entry for local startups and researchers who can't license proprietary voice data from large AI labs.",
      ],
      quote: { text: "The gap isn't model quality anymore — it's data. This is meant to close part of that gap for Urdu specifically.", cite: "Lead researcher, project announcement" },
    },
  },
  {
    title: "Cybersecurity Firm Discloses Critical Flaw in Widely Used Banking App",
    subheadline: "The vulnerability could have allowed attackers to intercept session tokens; the bank has issued a patch.",
    excerpt: "An Islamabad-based security firm disclosed a critical vulnerability in a mobile banking app used by millions, which has since been patched.",
    category: "pakistan-tech", author: "daniyal-farooq", tags: ["Cybersecurity", "Vulnerability", "Fintech"],
    daysAgo: 0.1, breaking: true, featured: true, pakistanRelevance: 100, regionalRelevance: 25, globalSignificance: 15,
    section: {
      whatHappened: [
        "An Islamabad-based cybersecurity research firm disclosed a critical vulnerability in a widely used Pakistani mobile banking application that could have allowed an attacker to intercept session tokens over an insecure network.",
        "The bank confirmed it shipped a patched version within 48 hours of receiving the disclosure and says it has no evidence the flaw was exploited.",
      ],
      whyMatters: [
        "The app is used by several million customers, making the disclosure one of the more consequential fintech security findings reported in Pakistan this year.",
        "Security researchers say the case illustrates the value of coordinated disclosure — the firm gave the bank a fix window before publishing technical details.",
      ],
    },
  },
  {
    title: "Freelancer Platforms Report Record Quarter for Pakistani Developers",
    subheadline: "Earnings data points to continued growth in software and AI-adjacent freelance work from Pakistan.",
    excerpt: "New data from major freelancing platforms shows Pakistani developers posted their strongest quarter yet for software and AI-related contract work.",
    category: "pakistan-tech", author: "meher-fatima", tags: ["Freelancers", "IT Exports", "Software"],
    daysAgo: 15, pakistanRelevance: 95, regionalRelevance: 15, globalSignificance: 10,
    section: {
      whatHappened: [
        "Aggregated data shared by major freelancing platforms shows earnings from Pakistan-based developers reached a quarterly record, driven largely by demand for AI-integration and web-application work.",
        "Software development and data-related categories accounted for the majority of the growth, according to the platforms.",
      ],
      whyMatters: [
        "Freelance IT exports are a meaningful contributor to Pakistan's services exports, and sustained growth in this category supports the government's broader IT-export targets.",
        "The data also suggests Pakistani developers are capturing a share of the recent surge in demand for AI-adjacent freelance work globally.",
      ],
    },
  },
  {
    title: "Global Handset Maker Confirms Pakistan Launch Window and Local Pricing",
    subheadline: "The device will be assembled locally under an existing manufacturing partnership, the company says.",
    excerpt: "A major smartphone maker has confirmed a Pakistan launch date and local pricing for its latest flagship device, with local assembly under an existing partnership.",
    category: "pakistan-tech", author: "sara-khawaja", tags: ["Smartphones", "Policy"],
    daysAgo: 2, pakistanRelevance: 90, regionalRelevance: 20, globalSignificance: 35,
    section: {
      whatHappened: [
        "A major smartphone manufacturer confirmed its newest flagship device will launch in Pakistan within weeks of its global debut, with local pricing announced alongside PTA type-approval confirmation.",
        "The company said units sold in Pakistan will be assembled locally under an existing manufacturing partnership, rather than imported fully built.",
      ],
      whyMatters: [
        "Simultaneous or near-simultaneous Pakistan launches remain uncommon for flagship devices, which historically have arrived months after their global release.",
        "Local assembly can affect final retail pricing and after-sales warranty terms, both frequent points of friction for Pakistani buyers of imported flagship phones.",
      ],
      pakistanImpact: "Pakistani buyers get access to a flagship device close to its global release for the first time in this product line, at a locally assembled price point that historically undercuts grey-market imports. Local assembly may also mean full manufacturer warranty coverage, which grey-market units typically lack.",
    },
  },

  // ---------------- AI ----------------
  {
    title: "Leading AI Lab Ships Extended-Context Update for Enterprise Assistant",
    subheadline: "The update roughly triples the amount of text the assistant can process in a single request.",
    excerpt: "A major AI lab has rolled out an extended-context update to its enterprise assistant product, aimed at large-document workflows.",
    category: "ai", author: "ayesha-raza", tags: ["AI", "LLM", "Enterprise"],
    daysAgo: 0.8, breaking: true, featured: true, pakistanRelevance: 10, regionalRelevance: 15, globalSignificance: 70,
    section: {
      whatHappened: [
        "A leading AI lab began rolling out an update to its enterprise assistant product that roughly triples the amount of text it can process in a single request, aimed at large-document and codebase-scale workflows.",
        "Pricing for the enterprise tier was not changed, though the company said very large requests may be billed at a different rate under a forthcoming usage tier.",
      ],
      whyMatters: [
        "Context-window limits have been a persistent complaint from enterprise customers trying to use AI assistants against long internal documents, contracts and codebases.",
        "The update puts pressure on competing labs to match context length, an area that has become a key differentiator in enterprise AI procurement conversations.",
      ],
    },
  },
  {
    title: "Major AI Platform Expands Multilingual Voice Support Across Its API",
    subheadline: "The update adds a wave of new languages to the platform's real-time voice API, including several South Asian languages.",
    excerpt: "A widely used AI platform has expanded multilingual support in its real-time voice API, adding several South Asian languages including Urdu.",
    category: "ai", author: "ayesha-raza", tags: ["AI", "Research"],
    daysAgo: 4, pakistanRelevance: 55, regionalRelevance: 60, globalSignificance: 55,
    section: {
      whatHappened: [
        "A widely used AI platform announced expanded language support for its real-time voice API, adding roughly a dozen languages including Urdu, Bengali and Tamil.",
        "The company said accuracy for the newly added languages is still behind its most mature languages like English and Mandarin, and it expects to publish benchmark comparisons in a future update.",
      ],
      whyMatters: [
        "Real-time voice AI in South Asian languages has lagged text-based tools, limiting products like voice assistants and call-center automation for those markets.",
        "Developers building voice products for South Asian users have had to rely on smaller, less-maintained models until now.",
      ],
      pakistanImpact: "Pakistani developers building voice-based products — customer support bots, accessibility tools, voice assistants — now have access to a maintained, general-purpose Urdu voice API rather than relying on smaller open-source alternatives. Actual accuracy for Pakistani Urdu dialects is untested at launch.",
    },
  },
  {
    title: "European Research Lab's Open-Weight Model Matches Proprietary Benchmarks",
    subheadline: "Independent evaluators say the openly licensed model performs competitively with closed frontier models on several tasks.",
    excerpt: "An openly licensed language model from a European research lab has matched proprietary frontier models on several independent benchmarks.",
    category: "ai", author: "tekzaro-editorial", tags: ["AI", "Open Source", "Research"],
    daysAgo: 8, pakistanRelevance: 15, regionalRelevance: 10, globalSignificance: 60,
    section: {
      whatHappened: [
        "A European research lab released the weights of a new large language model under a permissive open license, alongside a technical report detailing its training approach.",
        "Independent evaluators running standard benchmark suites found the model performs competitively with several proprietary frontier models on reasoning and coding tasks, though it lags on some multilingual benchmarks.",
      ],
      whyMatters: [
        "Open-weight models that match proprietary performance reduce the cost of building AI products without relying on a single closed-source vendor.",
        "The release adds to a growing set of credible open alternatives that developers and enterprises can self-host for cost or data-residency reasons.",
      ],
    },
  },
  {
    title: "Enterprise AI Spending Cools as Companies Demand Clearer ROI",
    subheadline: "Survey data suggests budget growth for generative AI pilots is slowing after two years of rapid increases.",
    excerpt: "New survey data suggests enterprise generative AI spending growth is slowing as finance teams demand clearer return-on-investment evidence.",
    category: "ai", author: "ayesha-raza", tags: ["AI", "Enterprise"],
    daysAgo: 11, pakistanRelevance: 10, regionalRelevance: 15, globalSignificance: 50,
    section: {
      whatHappened: [
        "A survey of enterprise technology buyers found year-over-year growth in generative AI budgets slowing for the first time since large-scale adoption began, with finance teams increasingly requiring measurable productivity gains before approving renewals.",
        "Respondents cited difficulty quantifying returns from pilot projects as the most common reason for delayed or reduced budget approval.",
      ],
      whyMatters: [
        "The slowdown doesn't indicate declining interest in AI tools, but it does suggest a shift from experimentation-stage spending toward more disciplined, outcome-tied procurement.",
        "Vendors that can demonstrate measurable productivity or cost outcomes are likely to be better positioned than those selling on capability alone.",
      ],
    },
  },

  // ---------------- SMARTPHONES ----------------
  {
    title: "Flagship Android Maker Unveils Under-Display Camera Refinement",
    subheadline: "The company says a new pixel arrangement reduces the visible artifacts that have limited the technology so far.",
    excerpt: "A major Android device maker has revealed a refined under-display camera design aimed at eliminating visible screen artifacts.",
    category: "smartphones", author: "sara-khawaja", tags: ["Smartphones", "Displays"],
    daysAgo: 5, pakistanRelevance: 20, regionalRelevance: 20, globalSignificance: 45,
    section: {
      whatHappened: [
        "A major Android device maker unveiled a refined under-display camera design using a new sub-pixel arrangement intended to reduce the hazy, lower-resolution look that has limited the technology's adoption.",
        "The company said the design will debut in a flagship device expected later this year, without confirming a specific model name.",
      ],
      whyMatters: [
        "Under-display cameras have been available for several years but remain uncommon in top-tier flagships because of persistent image-quality compromises.",
        "A meaningfully improved implementation could accelerate adoption across the wider Android flagship market.",
      ],
    },
  },
  {
    title: "New Mid-Range Chipset Targets Camera Performance Over Raw Speed",
    subheadline: "The chip prioritizes an upgraded image signal processor rather than a faster CPU or GPU.",
    excerpt: "A new mid-range mobile chipset emphasizes camera processing capability over raw CPU and GPU performance gains.",
    category: "smartphones", author: "sara-khawaja", tags: ["Smartphones", "Chips"],
    daysAgo: 10, pakistanRelevance: 25, regionalRelevance: 20, globalSignificance: 35,
    section: {
      whatHappened: [
        "A chipmaker introduced a new mid-range mobile processor built around an upgraded image signal processor, with only modest CPU and GPU gains over its predecessor.",
        "Device makers are expected to position phones using the chip primarily on camera performance rather than gaming benchmarks.",
      ],
      whyMatters: [
        "Camera quality has become a bigger differentiator than raw performance for mid-range phones, where most buyers won't notice benchmark differences but will notice photo quality.",
        "The shift reflects broader mid-range market trends prioritizing everyday usability over specs that mainly matter to enthusiasts.",
      ],
    },
  },
  {
    title: "Foldable Display Durability Improves in Latest Generation of Panels",
    subheadline: "Panel makers say new hinge and coating designs cut crease visibility and improve fold-cycle ratings.",
    excerpt: "The latest generation of foldable smartphone displays shows meaningful durability gains, according to panel manufacturers.",
    category: "smartphones", author: "sara-khawaja", tags: ["Smartphones", "Displays"],
    daysAgo: 14, pakistanRelevance: 15, regionalRelevance: 15, globalSignificance: 30,
    section: {
      whatHappened: [
        "Display panel manufacturers detailed a new generation of foldable screens with revised hinge mechanisms and coating layers, rated for a higher number of fold cycles than the previous generation.",
        "Early hands-on impressions from device reviewers note a less visible center crease compared to earlier foldable generations.",
      ],
      whyMatters: [
        "Durability and crease visibility have been the two most common consumer complaints about foldable phones, limiting broader adoption beyond early enthusiasts.",
        "Meaningful improvement here removes one of the last major objections holding foldables back from mainstream flagship status.",
      ],
    },
  },
  {
    title: "Chipmaker's Mobile SoC Roadmap Points to 2027 Efficiency Gains",
    subheadline: "The roadmap outlines a shift toward smaller manufacturing processes focused on battery life over peak performance.",
    excerpt: "A major mobile chipmaker outlined a multi-year roadmap prioritizing power efficiency over peak benchmark performance.",
    category: "smartphones", author: "sara-khawaja", tags: ["Smartphones", "Chips", "Semiconductors"],
    daysAgo: 18, pakistanRelevance: 40, regionalRelevance: 25, globalSignificance: 40,
    section: {
      whatHappened: [
        "A major mobile chipmaker shared a multi-year roadmap emphasizing manufacturing process improvements aimed primarily at power efficiency rather than peak performance gains.",
        "Executives said the shift responds to device makers prioritizing battery life in customer research over benchmark scores.",
      ],
      whyMatters: [
        "Efficiency-focused chip generations tend to benefit mid-range and budget devices disproportionately, since they close the battery-life gap with flagships without requiring larger batteries.",
        "For price-sensitive markets, efficiency gains often matter more to buyers than raw speed improvements most people won't perceive day to day.",
      ],
      pakistanImpact: "Pakistan's smartphone market is heavily weighted toward mid-range and budget devices, where battery life is consistently cited as a top purchase factor. Efficiency-focused chip generations like this one tend to reach Pakistani price points faster than performance-focused flagship chips.",
    },
  },

  // ---------------- COMPUTING ----------------
  {
    title: "Next-Gen Desktop Processor Line Focuses on Efficiency Cores",
    subheadline: "The new lineup adds more power-efficient cores alongside a modest bump in top-end performance cores.",
    excerpt: "A major chipmaker's next desktop processor generation shifts core-count growth toward efficiency cores rather than performance cores.",
    category: "computing", author: "tekzaro-editorial", tags: ["Chips", "Semiconductors"],
    daysAgo: 7, pakistanRelevance: 10, regionalRelevance: 15, globalSignificance: 40,
    section: {
      whatHappened: [
        "A major chipmaker detailed its next desktop processor generation, adding a larger number of power-efficient cores alongside a smaller increase in high-performance cores compared to the prior generation.",
        "Reviewers with early access said multi-threaded workloads benefit noticeably, while single-threaded gaming performance gains are more modest.",
      ],
      whyMatters: [
        "The design mirrors a broader industry shift toward heterogeneous core arrangements that balance performance and power draw, a trend that started in mobile chips and has moved to desktops.",
        "For workstation and multitasking-heavy users, the added efficiency cores could offer a bigger practical upgrade than raw clock-speed gains would.",
      ],
    },
  },
  {
    title: "Major Cloud Provider Announces New Data Center Region in South Asia",
    subheadline: "The new region is expected to reduce latency for customers across the subcontinent.",
    excerpt: "A major cloud infrastructure provider has announced a new data center region serving South Asia, aimed at reducing latency for regional customers.",
    category: "computing", author: "tekzaro-editorial", tags: ["Cloud", "Enterprise"],
    daysAgo: 4, pakistanRelevance: 50, regionalRelevance: 80, globalSignificance: 40,
    section: {
      whatHappened: [
        "A major cloud infrastructure provider announced plans to open a new data center region serving South Asia, with services expected to go live within the next year.",
        "The company said the region will initially offer core compute and storage services, with additional managed services following in subsequent phases.",
      ],
      whyMatters: [
        "Regional data center availability typically brings meaningful latency improvements for locally hosted applications compared to routing traffic to more distant regions.",
        "It can also help companies meet data-residency preferences from customers who want infrastructure located closer to the region they serve.",
      ],
      pakistanImpact: "Pakistani companies building on this cloud provider currently route traffic to more distant regions, adding latency for end users. A closer South Asia region could meaningfully improve performance for Pakistan-based applications and lower data-transfer costs, though the provider has not confirmed Pakistan-specific network peering details yet.",
    },
  },
  {
    title: "Linux Kernel Update Improves Power Management for ARM Laptops",
    subheadline: "The changes target idle power draw, a long-standing gap between ARM Linux laptops and their competitors.",
    excerpt: "A recent Linux kernel update brings meaningful power-management improvements for ARM-based laptops.",
    category: "computing", author: "tekzaro-editorial", tags: ["Open Source"],
    daysAgo: 16, pakistanRelevance: 10, regionalRelevance: 10, globalSignificance: 25,
    section: {
      whatHappened: [
        "Kernel maintainers merged a set of power-management changes targeting idle power draw on ARM-based laptops, an area where Linux has historically trailed competing operating systems on the same hardware.",
        "Early testers report meaningfully longer idle battery life on supported devices, though gains vary significantly by hardware model.",
      ],
      whyMatters: [
        "ARM laptop battery life on Linux has been a recurring complaint as more ARM-based devices reach the market, limiting Linux as a viable option on that hardware.",
        "Incremental kernel-level improvements compound over successive releases, and this update is expected to be followed by further driver-level tuning.",
      ],
    },
  },

  // ---------------- GADGETS ----------------
  {
    title: "New Smartwatch Generation Adds Continuous Blood-Oxygen Trends",
    subheadline: "The feature builds on existing spot-check sensors to track trends over time rather than single readings.",
    excerpt: "The latest smartwatch generation from a major wearables maker adds continuous blood-oxygen trend tracking.",
    category: "gadgets", author: "sara-khawaja", tags: ["Smartphones"],
    daysAgo: 6, pakistanRelevance: 15, regionalRelevance: 15, globalSignificance: 30,
    section: {
      whatHappened: [
        "A major wearables maker's newest smartwatch generation adds continuous blood-oxygen trend tracking, building on existing spot-check sensors already present in prior models.",
        "The company said the feature is intended for general wellness trend awareness and is not a diagnostic medical device.",
      ],
      whyMatters: [
        "Continuous rather than spot-check tracking gives users a clearer picture of trends over time, which health researchers say is generally more useful than isolated readings.",
        "The addition puts pressure on competing wearables makers to match the feature in their next hardware cycle.",
      ],
    },
  },
  {
    title: "Compact Mirrorless Camera Targets Creators With In-Body Stabilization",
    subheadline: "The new model adds five-axis stabilization to a smaller body aimed at video-focused creators.",
    excerpt: "A camera maker's newest compact mirrorless model adds in-body stabilization aimed squarely at video creators.",
    category: "gadgets", author: "tekzaro-editorial", tags: ["Displays"],
    daysAgo: 13, pakistanRelevance: 10, regionalRelevance: 10, globalSignificance: 25,
    section: {
      whatHappened: [
        "A camera manufacturer released a new compact mirrorless model featuring five-axis in-body stabilization in a smaller body than the outgoing generation, positioned explicitly for video-focused creators.",
        "The company paired the launch with a new lower-cost lens lineup aimed at the same audience.",
      ],
      whyMatters: [
        "In-body stabilization has typically been reserved for larger, more expensive camera bodies; bringing it to a compact form factor expands the addressable audience among creators who prioritize portability.",
      ],
    },
  },
  {
    title: "Smart Home Hub Standard Gains Broader Manufacturer Adoption",
    subheadline: "Several additional device makers have committed to supporting the cross-platform standard in upcoming products.",
    excerpt: "A cross-platform smart home standard has picked up support from several additional device manufacturers.",
    category: "gadgets", author: "tekzaro-editorial", tags: ["Smartphones"],
    daysAgo: 20, pakistanRelevance: 10, regionalRelevance: 15, globalSignificance: 30,
    section: {
      whatHappened: [
        "Several additional smart home device manufacturers committed to supporting a cross-platform connectivity standard in upcoming product lines, expanding the list of compatible brands.",
        "The standard's backers say broader adoption should reduce the number of separate hubs and apps required to manage a mixed-brand smart home setup.",
      ],
      whyMatters: [
        "Fragmentation across incompatible smart home ecosystems has been a persistent consumer complaint; wider adoption of a shared standard directly addresses that.",
      ],
    },
  },

  // ---------------- CYBERSECURITY ----------------
  {
    title: "Critical Vulnerability Disclosed in Widely Used Enterprise VPN Software",
    subheadline: "Security researchers rate the flaw critical; a patch is available and administrators are urged to apply it immediately.",
    excerpt: "Researchers have disclosed a critical vulnerability in enterprise VPN software used by thousands of organizations worldwide.",
    category: "cybersecurity", author: "daniyal-farooq", tags: ["Cybersecurity", "Vulnerability", "Enterprise"],
    daysAgo: 0.4, breaking: true, featured: true, pakistanRelevance: 20, regionalRelevance: 25, globalSignificance: 75,
    section: {
      whatHappened: [
        "Security researchers disclosed a critical remote-code-execution vulnerability in enterprise VPN software used by thousands of organizations, rating it among the more severe flaws reported in the category this year.",
        "The vendor has released a patch and is urging administrators to apply it immediately, noting that proof-of-concept exploit code is already circulating.",
      ],
      whyMatters: [
        "VPN appliances sit at the network perimeter, making vulnerabilities in them especially valuable to attackers seeking initial access to corporate networks.",
        "Organizations running affected versions should treat this as an urgent patching priority rather than routine maintenance.",
      ],
    },
  },
  {
    title: "Ransomware Group Shifts Tactics Toward Cloud Backup Deletion",
    subheadline: "Researchers say the group increasingly targets cloud backup configurations before deploying encryption payloads.",
    excerpt: "A prominent ransomware group has shifted tactics to target cloud backup systems before deploying its encryption payload.",
    category: "cybersecurity", author: "daniyal-farooq", tags: ["Cybersecurity", "Cloud"],
    daysAgo: 5, pakistanRelevance: 20, regionalRelevance: 20, globalSignificance: 50,
    section: {
      whatHappened: [
        "Incident responders reported that a well-known ransomware group has begun systematically locating and deleting cloud backup configurations before deploying its file-encryption payload, aiming to remove victims' ability to recover without paying.",
        "The tactic mirrors earlier techniques used against on-premises backup systems, now adapted for cloud-first environments.",
      ],
      whyMatters: [
        "Organizations that assumed cloud backups were inherently safer from ransomware need to reassess access controls and immutability settings on backup storage specifically.",
      ],
      list: { style: "bullet", items: [
        "Enable backup immutability where the provider supports it",
        "Separate backup-account credentials from primary infrastructure credentials",
        "Test recovery procedures regularly, not just backup creation",
      ] },
    },
  },
  {
    title: "Security Researchers Detail New Phishing Kit Sold on Underground Forums",
    subheadline: "The kit automates real-time credential relay against multi-factor authentication prompts.",
    excerpt: "Researchers have detailed a new phishing kit being sold on underground forums that automates real-time bypass of multi-factor authentication.",
    category: "cybersecurity", author: "daniyal-farooq", tags: ["Cybersecurity", "Privacy"],
    daysAgo: 9, pakistanRelevance: 20, regionalRelevance: 20, globalSignificance: 45,
    section: {
      whatHappened: [
        "Threat researchers published an analysis of a phishing kit circulating on underground forums that automates real-time relay of one-time codes, effectively bypassing many forms of SMS- and app-based multi-factor authentication.",
        "The kit is sold as a subscription service, lowering the technical bar for less sophisticated attackers to run this style of attack.",
      ],
      whyMatters: [
        "The finding reinforces security researchers' longstanding recommendation to move toward phishing-resistant authentication methods like hardware security keys for high-value accounts.",
      ],
    },
  },

  // ---------------- SOFTWARE ----------------
  {
    title: "Popular Open-Source Database Ships Major Performance Overhaul",
    subheadline: "Benchmark results show substantial gains on write-heavy workloads in the new major version.",
    excerpt: "A widely used open-source database has shipped a major version with significant write-performance improvements.",
    category: "software", author: "tekzaro-editorial", tags: ["Open Source"],
    daysAgo: 3, pakistanRelevance: 10, regionalRelevance: 10, globalSignificance: 35,
    section: {
      whatHappened: [
        "Maintainers of a widely used open-source database released a major version featuring a reworked storage engine, with published benchmarks showing substantial gains on write-heavy workloads.",
        "The release also includes breaking changes to some configuration defaults, and maintainers published a migration guide for existing deployments.",
      ],
      whyMatters: [
        "Performance gains of this scale in a mature, widely deployed database can meaningfully reduce infrastructure costs for teams running write-intensive applications.",
      ],
    },
  },
  {
    title: "Developer Tooling Startup Launches AI-Assisted Code Review Product",
    subheadline: "The tool flags likely bugs and security issues before a pull request reaches a human reviewer.",
    excerpt: "A developer tooling startup has launched a code review product that uses AI to flag likely bugs before human review.",
    category: "software", author: "meher-fatima", tags: ["AI", "Startups"],
    daysAgo: 8, pakistanRelevance: 15, regionalRelevance: 15, globalSignificance: 30,
    section: {
      whatHappened: [
        "A developer tooling startup launched a code review product that runs an automated pass over pull requests, flagging likely bugs, security issues and style deviations before a human reviewer sees the change.",
        "The company says the tool is meant to supplement, not replace, human review, and it does not auto-approve or auto-merge changes.",
      ],
      whyMatters: [
        "AI-assisted code review tools are becoming a crowded category as engineering teams look for ways to reduce reviewer workload without sacrificing code quality.",
      ],
    },
  },
  {
    title: "Widely Used JavaScript Framework Previews Server-First Rendering Model",
    subheadline: "The preview shifts more rendering work to the server by default, aiming to cut client-side JavaScript.",
    excerpt: "A major JavaScript framework has previewed a new server-first rendering model aimed at reducing client-side JavaScript.",
    category: "software", author: "tekzaro-editorial", tags: ["Open Source"],
    daysAgo: 12, pakistanRelevance: 10, regionalRelevance: 10, globalSignificance: 35,
    section: {
      whatHappened: [
        "Maintainers of a widely used JavaScript framework previewed a new rendering model that shifts more component rendering to the server by default, aiming to reduce the amount of JavaScript shipped to the browser.",
        "The preview is available behind a flag, with a stable release targeted for a future minor version.",
      ],
      whyMatters: [
        "Reducing client-side JavaScript generally improves load performance, particularly on slower networks and lower-end devices — a meaningful consideration for markets where high-end devices aren't the norm.",
      ],
    },
  },

  // ---------------- GAMING ----------------
  {
    title: "Major Studio Delays Flagship Title to Refine Multiplayer Netcode",
    subheadline: "The studio says the delay is focused specifically on stability under high player counts.",
    excerpt: "A major game studio has delayed its flagship upcoming title, citing the need for additional multiplayer netcode work.",
    category: "gaming", author: "tekzaro-editorial", tags: ["Gaming"],
    daysAgo: 5, pakistanRelevance: 10, regionalRelevance: 10, globalSignificance: 40,
    section: {
      whatHappened: [
        "A major game studio announced a several-month delay for its flagship upcoming title, saying the additional time is focused specifically on multiplayer netcode stability under high concurrent player counts.",
        "The studio said single-player content is largely complete and the delay is isolated to multiplayer systems.",
      ],
      whyMatters: [
        "Launch-day multiplayer instability has repeatedly damaged the reception of high-profile titles in recent years, making this kind of delay a increasingly common risk-management move.",
      ],
    },
  },
  {
    title: "Console Maker Expands Backward Compatibility to Two More Generations",
    subheadline: "The update lets current-generation hardware run titles from two additional previous console generations.",
    excerpt: "A console maker has expanded backward compatibility support to cover two additional previous hardware generations.",
    category: "gaming", author: "tekzaro-editorial", tags: ["Gaming", "Consoles"],
    daysAgo: 10, pakistanRelevance: 10, regionalRelevance: 10, globalSignificance: 35,
    section: {
      whatHappened: [
        "A console manufacturer rolled out a software update extending backward compatibility to titles from two additional previous hardware generations, expanding on already-supported older libraries.",
        "Not all titles from the newly supported generations are compatible at launch; the company says broader library support will expand over time.",
      ],
      whyMatters: [
        "Backward compatibility has become an increasingly important purchase factor, letting players consolidate hardware and preserve access to older game libraries.",
      ],
    },
  },
  {
    title: "Game Engine Update Brings Real-Time Global Illumination to Mid-Range Hardware",
    subheadline: "The engine's latest release optimizes a lighting technique previously limited to high-end graphics cards.",
    excerpt: "A widely used game engine's latest release brings real-time global illumination to mid-range graphics hardware.",
    category: "gaming", author: "tekzaro-editorial", tags: ["Gaming"],
    daysAgo: 17, pakistanRelevance: 10, regionalRelevance: 10, globalSignificance: 30,
    section: {
      whatHappened: [
        "The developers of a widely used game engine released an update optimizing real-time global illumination rendering to run acceptably on mid-range graphics hardware, a lighting technique previously practical mainly on high-end cards.",
        "Early developer builds using the update show meaningfully lower frame-rate cost compared to the engine's previous lighting implementation.",
      ],
      whyMatters: [
        "Wider hardware compatibility for advanced lighting techniques means more studios can adopt them without excluding players on mid-range systems, which represent the bulk of the PC gaming market.",
      ],
    },
  },

  // ---------------- STARTUPS ----------------
  {
    title: "Climate-Tech Startup Raises Series B for Carbon Capture Software",
    subheadline: "The company's software helps industrial facilities model and optimize capture-system efficiency.",
    excerpt: "A climate-tech startup building software for industrial carbon capture systems has closed a Series B funding round.",
    category: "startups", author: "meher-fatima", tags: ["Startups", "Funding"],
    daysAgo: 4, pakistanRelevance: 10, regionalRelevance: 10, globalSignificance: 30,
    section: {
      whatHappened: [
        "A climate-tech startup that builds modeling and optimization software for industrial carbon capture systems closed a Series B round led by a climate-focused venture fund.",
        "The company says the funding will support expansion into additional industrial sectors beyond its initial cement and steel clients.",
      ],
      whyMatters: [
        "Software that improves the efficiency of existing carbon capture installations can meaningfully lower the cost per ton of captured carbon, a key barrier to broader industrial adoption.",
      ],
    },
  },
  {
    title: "B2B Logistics Startup Expands Into Three New Markets After Funding Round",
    subheadline: "The company plans to replicate its freight-matching platform in three additional countries this year.",
    excerpt: "A B2B logistics startup is expanding into three new markets following a recently closed funding round.",
    category: "startups", author: "meher-fatima", tags: ["Startups", "Funding"],
    daysAgo: 9, pakistanRelevance: 15, regionalRelevance: 25, globalSignificance: 25,
    section: {
      whatHappened: [
        "A B2B logistics startup that matches shippers with available freight capacity announced plans to launch in three additional markets this year, funded by a recently closed round.",
        "The company said the new markets were selected based on existing informal demand from shippers already using its platform to route cross-border freight.",
      ],
      whyMatters: [
        "Freight-matching platforms have shown strong unit economics in fragmented logistics markets where capacity utilization is historically low.",
      ],
    },
  },
  {
    title: "Enterprise Search Startup Emerges From Stealth With Notable Backers",
    subheadline: "The company says its product indexes internal tools without requiring each one to build a custom connector first.",
    excerpt: "An enterprise search startup has emerged from stealth, announcing funding from several notable venture investors.",
    category: "startups", author: "meher-fatima", tags: ["Startups", "Funding", "AI"],
    daysAgo: 0.6, breaking: true, pakistanRelevance: 10, regionalRelevance: 10, globalSignificance: 35,
    section: {
      whatHappened: [
        "An enterprise search startup emerged from stealth mode, announcing a funding round from several notable venture investors alongside general availability of its product.",
        "The company says its approach to indexing internal company tools avoids requiring a custom-built connector for every individual application, a common bottleneck for competing products.",
      ],
      whyMatters: [
        "Enterprise search has attracted renewed investor interest as companies look to make AI assistants useful against internal, not just public, information.",
      ],
    },
  },

  // ---------------- SPACE ----------------
  {
    title: "Commercial Launch Provider Completes Milestone Reusable Booster Test",
    subheadline: "The test marks the highest number of consecutive successful landings for the company's booster design.",
    excerpt: "A commercial launch provider has completed a milestone test flight, extending its streak of successful reusable booster landings.",
    category: "space", author: "tekzaro-editorial", tags: ["Space"],
    daysAgo: 2.2, featured: true, pakistanRelevance: 10, regionalRelevance: 10, globalSignificance: 45,
    section: {
      whatHappened: [
        "A commercial launch provider completed a test flight that extended its streak of consecutive successful reusable booster landings to a new company record, carrying a mixed commercial and research payload.",
        "The company said the booster used on this flight will be refurbished and reflown, consistent with its standard turnaround process.",
      ],
      whyMatters: [
        "Consistent booster reusability continues to lower the marginal cost of individual launches, a trend that has broadly expanded access to orbital launch capacity over the past decade.",
      ],
    },
  },
  {
    title: "Space Agency Selects Instruments for Next Lunar Surface Mission",
    subheadline: "The selected payloads focus on subsurface water-ice detection and radiation monitoring.",
    excerpt: "A national space agency has selected the scientific instruments that will fly on its next lunar surface mission.",
    category: "space", author: "tekzaro-editorial", tags: ["Space", "Research"],
    daysAgo: 8, pakistanRelevance: 5, regionalRelevance: 10, globalSignificance: 40,
    section: {
      whatHappened: [
        "A national space agency announced the scientific instrument suite selected for its next lunar surface mission, prioritizing subsurface water-ice detection and radiation monitoring instruments.",
        "The mission is planned as a precursor to future crewed surface operations in the same region.",
      ],
      whyMatters: [
        "Confirming the presence and distribution of subsurface water ice is considered a prerequisite for planning sustainable long-duration lunar surface missions.",
      ],
    },
  },
  {
    title: "Astronomers Flag Unusual Signal Pattern From Nearby Exoplanet System",
    subheadline: "Researchers caution the finding is preliminary and likely explained by stellar activity, pending further observation.",
    excerpt: "Astronomers have flagged an unusual periodic signal from a nearby exoplanet system, though they caution it likely has a mundane explanation.",
    category: "space", author: "tekzaro-editorial", tags: ["Space", "Research"],
    daysAgo: 13, pakistanRelevance: 5, regionalRelevance: 5, globalSignificance: 30,
    section: {
      whatHappened: [
        "A team of astronomers reported an unusual periodic signal pattern detected from a nearby exoplanet system during a routine observation campaign, prompting a follow-up observation request on a larger telescope.",
        "The researchers were explicit that the leading explanation remains ordinary stellar activity, not anything more exotic, pending additional data.",
      ],
      whyMatters: [
        "The case is a useful reminder of how preliminary astronomical findings are typically reported: as an anomaly worth investigating, not a conclusion — a distinction that often gets lost by the time findings circulate widely.",
      ],
    },
  },

  // ---------------- ENTERPRISE ----------------
  {
    title: "Enterprise Software Vendor Simplifies Pricing After Customer Pushback",
    subheadline: "The company is collapsing eleven pricing tiers into four following sustained customer complaints.",
    excerpt: "A major enterprise software vendor has overhauled its pricing structure following sustained customer complaints about complexity.",
    category: "enterprise", author: "ayesha-raza", tags: ["Enterprise"],
    daysAgo: 6, pakistanRelevance: 10, regionalRelevance: 15, globalSignificance: 35,
    section: {
      whatHappened: [
        "A major enterprise software vendor announced a pricing overhaul collapsing eleven previous pricing tiers into four, following sustained complaints from customers about the complexity of understanding what they were being billed for.",
        "The company said existing customers will be migrated to the closest equivalent new tier at their current price for at least one renewal cycle.",
      ],
      whyMatters: [
        "Pricing complexity has been a recurring complaint across the enterprise software industry, and this kind of simplification is likely to be watched closely by competitors facing similar criticism.",
      ],
    },
  },
  {
    title: "Major Bank Migrates Core Systems to Hybrid Cloud Architecture",
    subheadline: "The multi-year migration keeps sensitive transaction data on-premises while moving other workloads to the cloud.",
    excerpt: "A major bank has completed a multi-year migration of core systems to a hybrid cloud architecture.",
    category: "enterprise", author: "ayesha-raza", tags: ["Enterprise", "Cloud"],
    daysAgo: 1.5, featured: true, pakistanRelevance: 15, regionalRelevance: 20, globalSignificance: 45,
    section: {
      whatHappened: [
        "A major bank announced completion of a multi-year migration moving core banking workloads to a hybrid cloud architecture, keeping sensitive transaction-processing systems on-premises while shifting analytics and customer-facing workloads to the cloud.",
        "The bank said the approach was chosen specifically to satisfy regulatory data-residency requirements that a full cloud migration would have complicated.",
      ],
      whyMatters: [
        "Hybrid architectures are increasingly common among regulated financial institutions balancing cloud-scale efficiency against data-residency and compliance requirements.",
      ],
      pakistanImpact: "Pakistani banks face similar data-residency expectations from the State Bank of Pakistan. A large, publicly documented hybrid migration like this one offers a reference architecture local banks' technology teams may study as they plan their own cloud strategies.",
    },
  },
  {
    title: "Cloud Provider Introduces Sovereign Cloud Option for Regulated Industries",
    subheadline: "The offering guarantees data storage and processing remain within a specified country's borders.",
    excerpt: "A major cloud provider has launched a sovereign cloud offering aimed at regulated industries with strict data-residency requirements.",
    category: "enterprise", author: "ayesha-raza", tags: ["Enterprise", "Cloud", "Policy"],
    daysAgo: 11, pakistanRelevance: 30, regionalRelevance: 35, globalSignificance: 40,
    section: {
      whatHappened: [
        "A major cloud provider launched a sovereign cloud offering that guarantees customer data storage and processing remain within a specified country's borders, including restrictions on which personnel can access the infrastructure.",
        "The offering targets government, financial services and healthcare customers facing the strictest data-residency requirements.",
      ],
      whyMatters: [
        "Sovereign cloud offerings have become a competitive battleground among major providers as more governments introduce data-localization requirements.",
      ],
      pakistanImpact: "Pakistan does not yet have a confirmed sovereign-cloud offering from this provider, but the model is one regulators and large Pakistani institutions may point to as data-localization discussions continue domestically.",
    },
  },
];

async function main() {
  console.log("Seeding DEMO CONTENT (clearly labeled, not real news)...");

  for (const c of CATEGORIES) {
    await db.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, description: c.description },
      create: c,
    });
  }

  for (const a of AUTHORS) {
    await db.author.upsert({
      where: { slug: a.slug },
      update: { name: a.name, position: a.position, bio: a.bio },
      create: a,
    });
  }

  const tagIds = new Map<string, string>();
  for (const name of TAGS) {
    const tag = await db.tag.upsert({
      where: { name },
      update: {},
      create: { name, slug: slugify(name) },
    });
    tagIds.set(name, tag.id);
  }

  const categoryIds = new Map<string, string>();
  for (const c of CATEGORIES) {
    const cat = await db.category.findUniqueOrThrow({ where: { slug: c.slug } });
    categoryIds.set(c.slug, cat.id);
  }
  const authorIds = new Map<string, string>();
  for (const a of AUTHORS) {
    const author = await db.author.findUniqueOrThrow({ where: { slug: a.slug } });
    authorIds.set(a.slug, author.id);
  }

  const missingTags = new Set<string>();
  for (const article of ARTICLES) {
    for (const t of article.tags) if (!tagIds.has(t)) missingTags.add(t);
  }
  if (missingTags.size > 0) {
    throw new Error(`Article tags not in TAGS pool: ${[...missingTags].join(", ")}`);
  }

  for (const article of ARTICLES) {
    const slug = slugify(article.title);
    const blocks = buildBlocks(article.excerpt, article.section);
    const publishedAt = daysAgoDate(article.daysAgo);

    await db.article.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        title: article.title,
        subheadline: article.subheadline,
        excerpt: article.excerpt,
        content: { blocks } as unknown as Prisma.InputJsonValue,
        status: "PUBLISHED",
        isBreaking: article.breaking ?? false,
        featured: article.featured ?? false,
        isDemo: true,
        pakistanRelevance: article.pakistanRelevance ?? 0,
        regionalRelevance: article.regionalRelevance ?? 0,
        globalSignificance: article.globalSignificance ?? 0,
        publishedAt,
        readingTime: estimateReadingTime(blocks),
        categoryId: categoryIds.get(article.category)!,
        authorId: authorIds.get(article.author)!,
        verification: "VERIFIED",
        aiStatus: "NOT_STARTED",
        seoTitle: article.title,
        metaDescription: article.excerpt,
        tags: {
          create: article.tags.map((t) => ({ tagId: tagIds.get(t)! })),
        },
      },
    });
  }

  console.log(`Seeded ${CATEGORIES.length} categories, ${AUTHORS.length} authors, ${ARTICLES.length} demo articles.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
