import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function run() {
  console.log("=== EXECUTING ADSENSE COMPLIANCE DATA CLEANUP ===");

  // 1. Delete test authors with 0 articles
  const deletedTestAuthors = await prisma.author.deleteMany({
    where: {
      OR: [
        { slug: "articles-integration-test-author-1788601920384" },
        { name: { contains: "Integration Test" } },
      ],
      articles: { none: {} },
    },
  });
  console.log(`Deleted ${deletedTestAuthors.count} test author(s).`);

  // 2. Enrich the 6 real authors
  const authorsData = [
    {
      slug: "bilal-ahmed",
      position: "Senior Reporter, Pakistan Tech, Policy & Telecom",
      bio: "Bilal covers Pakistan's technology ecosystem, National IT policy, telecom modernization, digital financial services, and startup development. With over seven years of reporting on South Asian tech infrastructure from Islamabad, his coverage focuses on PTA regulations, 5G rollouts, IT exports, and civic tech.",
      photoUrl: "/authors/bilal-ahmed.svg",
      socialLinks: { Twitter: "https://x.com/tekzaro", LinkedIn: "https://linkedin.com/company/tekzaro" },
    },
    {
      slug: "ayesha-raza",
      position: "Senior Editor, Artificial Intelligence & Enterprise",
      bio: "Ayesha leads TEKZARO's coverage of foundational AI models, agentic systems, enterprise cloud architectures, and computational hardware. Formerly a software engineer and tech analyst, she holds an MS in Computer Science and examines how global machine learning breakthroughs impact regional enterprise adoption and regulatory frameworks.",
      photoUrl: "/authors/ayesha-raza.svg",
      socialLinks: { Twitter: "https://x.com/tekzaro", LinkedIn: "https://linkedin.com/company/tekzaro" },
    },
    {
      slug: "sara-khawaja",
      position: "Hardware & Consumer Tech Editor",
      bio: "Sara specializes in consumer hardware, mobile silicon, display technologies, wearables, and smartphone engineering. She conducts benchmark analyses and teardown evaluations of next-generation gadgets, tracking both global consumer tech giants and affordable localized electronics across emerging markets.",
      photoUrl: "/authors/sara-khawaja.svg",
      socialLinks: { Twitter: "https://x.com/tekzaro", LinkedIn: "https://linkedin.com/company/tekzaro" },
    },
    {
      slug: "daniyal-farooq",
      position: "Cybersecurity & Infrastructure Reporter",
      bio: "Daniyal investigates vulnerability disclosures, zero-day exploits, state-sponsored cyber operations, and enterprise security defenses. He collaborates closely with ethical hacking collectives and security researchers to break down complex exploit chains, ransomware campaigns, and national cyber defense policies.",
      photoUrl: "/authors/daniyal-farooq.svg",
      socialLinks: { Twitter: "https://x.com/tekzaro", LinkedIn: "https://linkedin.com/company/tekzaro" },
    },
    {
      slug: "meher-fatima",
      position: "Startups & Venture Capital Reporter",
      bio: "Meher reports on venture financing, seed rounds, angel syndicates, and technical founders across South Asia and the Middle East. Her reporting tracks pitch dynamics, valuation multiples, founder journeys, and economic indicators shaping innovation hubs from Lahore to Karachi and Dubai.",
      photoUrl: "/authors/meher-fatima.svg",
      socialLinks: { Twitter: "https://x.com/tekzaro", LinkedIn: "https://linkedin.com/company/tekzaro" },
    },
    {
      slug: "tekzaro-editorial",
      position: "Editorial Desk & Newsroom Collective",
      bio: "The collective editorial voice of TEKZARO's newsroom. Reports published under this byline represent collaborative reporting, breaking technology dispatches, consensus editorial reviews, and technical investigations vetted by multiple senior editors.",
      photoUrl: "/authors/tekzaro-editorial.svg",
      socialLinks: { Twitter: "https://x.com/tekzaro", LinkedIn: "https://linkedin.com/company/tekzaro" },
    },
  ];

  for (const aut of authorsData) {
    const updated = await prisma.author.update({
      where: { slug: aut.slug },
      data: {
        position: aut.position,
        bio: aut.bio,
        photoUrl: aut.photoUrl,
        socialLinks: aut.socialLinks,
        active: true,
      },
    });
    console.log(`Updated author: ${updated.name} (${updated.slug})`);
  }

  // 3. Find and archive off-topic, crime, sensitive, and thin articles
  const published = await prisma.article.findMany({
    where: { status: "PUBLISHED" },
    select: {
      id: true,
      title: true,
      slug: true,
      category: { select: { slug: true } },
      content: true,
    },
  });

  const offTopicPatterns = [
    // Violence / Crime / Court
    /\bkilled\b/i, /\bmurder\b/i, /\brape\b/i, /\bassault\b/i, /\bkidnap/i, /\blooted\b/i,
    /\bdeath penalty\b/i, /\bblasphem/i, /\bvandalised\b/i, /\bdead body\b/i, /\bcorpse\b/i,
    /\bfir against\b/i, /\bphysical remand\b/i, /\barrested\b/i, /\bdetained\b/i,

    // Protests / Politics / Riots / Diplomacy
    /\bprotest\b/i, /\bmotorway expansion\b/i, /\bpetrol limit\b/i, /\bindian navy\b/i,
    /\bforeign ministry\b/i, /\battestation scandal\b/i, /\bmaryam nawaz\b/i, /\bnawaz sharif\b/i,
    /\btax officers\b/i, /\bgas debt\b/i, /\bpension on day of retirement\b/i,
    /\bgreen bus\b/i, /\bhajj\b/i, /\bumrah\b/i, /\btraffic advisory\b/i, /\bmdcat\b/i,
    /\bsiut\b/i, /\bnational savings\b/i, /\bpasoori\b/i, /\bdrug dealing\b/i,
    /\btuition discount\b/i, /\belectric buses\b/i, /\buet lahore\b/i, /\bdaanish school\b/i,
    /\bhousing loans\b/i, /\bunderground parking plazas\b/i, /\bunderpasses in rawalpindi\b/i,
    /\bgas supply to be suspended\b/i, /\blibya offers more crude oil\b/i,
    /\bmrbeast just mentioned lahore\b/i, /\bcancer treatment tower\b/i,
    /\blahore zoo\b/i, /\b13 inner-city roads\b/i, /\bno firs for traffic\b/i,
    /\bvehicle count surges\b/i, /\bcricketers could earn\b/i, /\bmedical college fees\b/i,
    /\bvehicle fitness certificate\b/i, /\bfbr ends weekend break\b/i,
    /\bglobal mental health summit\b/i, /\bfbr redraws enforcement map\b/i,
    /\bfbr to penalise taxpayers\b/i, /\btoyota corolla 2027 prices\b/i,
    /\bmg increases zs prices\b/i, /\bmg pakistan set to export\b/i,
    /\bpakistan auto sales rise\b/i, /\bforeign investment in august\b/i,
    /\btrade deficit falls\b/i, /\bpakistan to pay double for lng\b/i,
    /\bpunjab orders drug inspectors\b/i, /\bpunjab orders daily tests\b/i,
    /\bpunjab approves 332 new posts\b/i, /\bpakistan, chinese firms eye rs. 20 billion\b/i,
    /\bfbr launches system to flag sales tax\b/i, /\bfpsc postpones interviews\b/i,
    /\bfifa u-15 world cup\b/i, /\bbudget\b/i, /\brent payment for seized containers\b/i,
    /\bbritish politician threatens\b/i, /\bshoppers pack rawalpindi\b/i,
    /\bheavy rains flood\b/i, /\bpower tariffs\b/i, /\bsugar mill\b/i,
    /\bwheat support price\b/i, /\bcm punjab opens applications for e-bike\b/i,
    /\bgovt clears nearly 12,000 pending solar\b/i, /\bsecp cracks down on 28,761 companies\b/i,
    /\bsecp greenlights regulatory overhaul\b/i,

    // Gambling / Betting
    /\bbetting tip\b/i, /\bgambling\b/i, /\bcasino\b/i,

    // Pure Entertainment / Gossip non-tech
    /\b5 star trek ships\b/i,
  ];

  const archiveIds = [];
  for (const a of published) {
    let wordCount = 0;
    const blocks = a.content && typeof a.content === "object" ? a.content.blocks : [];
    if (Array.isArray(blocks)) {
      for (const b of blocks) {
        if (b && typeof b === "object" && typeof b.text === "string") {
          wordCount += b.text.trim().split(/\s+/).filter(Boolean).length;
        }
      }
    }

    let shouldArchive = false;
    if (wordCount < 300) {
      shouldArchive = true;
    } else {
      for (const pat of offTopicPatterns) {
        if (pat.test(a.title)) {
          shouldArchive = true;
          break;
        }
      }
    }

    if (shouldArchive) {
      archiveIds.push(a.id);
    }
  }

  console.log(`Archiving ${archiveIds.length} articles that violate policy or are off-topic/thin...`);
  const result = await prisma.article.updateMany({
    where: { id: { in: archiveIds } },
    data: { status: "ARCHIVED" },
  });
  console.log(`Successfully archived ${result.count} articles.`);

  // Verify remaining published
  const remaining = await prisma.article.count({
    where: { status: "PUBLISHED" },
  });
  console.log(`Remaining pristine PUBLISHED articles: ${remaining}`);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
