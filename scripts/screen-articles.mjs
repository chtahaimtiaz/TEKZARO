import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function run() {
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

  console.log("=== SCREENING PUBLISHED ARTICLES FOR AD-SENSE COMPLIANCE ===");
  const toDraft = [];
  const keep = [];

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

    let reason = null;
    if (wordCount < 300) {
      reason = `Thin content (<300 words: ${wordCount})`;
    } else {
      for (const pat of offTopicPatterns) {
        if (pat.test(a.title)) {
          reason = `Off-topic / Policy violation: matches ${pat}`;
          break;
        }
      }
    }

    if (reason) {
      toDraft.push({ id: a.id, slug: a.slug, title: a.title, category: a.category?.slug, wordCount, reason });
    } else {
      keep.push({ id: a.id, slug: a.slug, title: a.title, category: a.category?.slug, wordCount });
    }
  }

  console.log(`\nArticles to DRAFT/UNPUBLISH: ${toDraft.length}`);
  for (const d of toDraft) {
    console.log(`- [${d.category}] [${d.wordCount}w] [${d.reason}] ${d.title}`);
  }

  console.log(`\nArticles to KEEP PUBLISHED: ${keep.length}`);
  const keepCat = {};
  keep.forEach(k => { keepCat[k.category] = (keepCat[k.category] || 0) + 1; });
  console.log("Categories breakdown for kept articles:", keepCat);
}

run().catch(console.error).finally(() => prisma.$disconnect());
