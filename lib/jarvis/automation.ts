import "server-only";
import { prisma } from "../prisma";
import { logSystemEvent } from "../monitoring";
import { getSystemUserId } from "../system-actor";
import { runBatchIngestion, getEligibleActiveSources } from "../ingestion/batch-fetch";
import { processVerificationBatch } from "../verification-actions";
import { isEnabled, isEmergencyStop, isDryRun, isApprovalMode } from "./config";
import { publishArticleToInstagram, isInstagramConfigured, isInstagramAutoPublishEnabled } from "./instagram";
import * as Errors from "./errors";
import type { AutomationRun, AutomationJob, AutomationJobType, AutomationRunStatus } from "@prisma/client";

export async function startAutomationRun(triggeredBy: string): Promise<AutomationRun> {
  const existingRun = await prisma.automationRun.findFirst({
    where: { status: "RUNNING" },
  });
  if (existingRun) throw new Error(Errors.ANOTHER_RUN_ACTIVE);

  return prisma.automationRun.create({
    data: {
      status: "RUNNING",
      triggeredBy,
      dryRun: isDryRun(),
      approvalMode: isApprovalMode(),
    },
  });
}

export async function completeAutomationRun(runId: string, updates: Partial<AutomationRun>): Promise<void> {
  await prisma.automationRun.update({
    where: { id: runId },
    data: { ...updates, status: "COMPLETED", completedAt: new Date() },
  });
}

export async function failAutomationRun(runId: string, errorSummary: string): Promise<void> {
  await prisma.automationRun.update({
    where: { id: runId },
    data: { status: "FAILED", completedAt: new Date(), errorSummary },
  });
}

export async function getCurrentRun(): Promise<AutomationRun | null> {
  return prisma.automationRun.findFirst({
    orderBy: { startedAt: "desc" },
  });
}

export async function getRecentRuns(limit: number): Promise<AutomationRun[]> {
  return prisma.automationRun.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}

export async function createAutomationJob(runId: string, type: AutomationJobType, sourceItemId?: string): Promise<AutomationJob> {
  return prisma.automationJob.create({
    data: {
      runId,
      type,
      sourceItemId,
    },
  });
}

export async function updateAutomationJob(jobId: string, update: Partial<AutomationJob>): Promise<void> {
  if (update.status === "COMPLETED" || update.status === "FAILED" || update.status === "SKIPPED") {
    (update as any).completedAt = new Date();
  }
  await prisma.automationJob.update({
    where: { id: jobId },
    data: update,
  });
}

export async function runFullAutomationCycle(triggeredBy: string): Promise<{ ok: boolean; runId?: string; error?: string }> {
  if (!isEnabled()) return { ok: false, error: Errors.AUTOMATION_DISABLED };
  if (isEmergencyStop()) {
    await logSystemEvent({ level: "WARN", source: "jarvis", message: "Emergency stop active - automation aborted" });
    return { ok: false, error: Errors.EMERGENCY_STOP_ACTIVE };
  }

  let run: AutomationRun;
  try {
    run = await startAutomationRun(triggeredBy);
  } catch (error: any) {
    return { ok: false, error: error.message };
  }

  await logSystemEvent({ level: "INFO", source: "jarvis", message: "AUTOMATION_STARTED", context: { runId: run.id } });
  
  if (isDryRun()) {
    await logSystemEvent({ level: "INFO", source: "jarvis", message: "DRY RUN - NOTHING WILL BE PUBLISHED" });
  }

  try {
    // 1. Ingestion
    const systemUserId = await getSystemUserId();
    const sources = await getEligibleActiveSources();
    const ingestSummary = await runBatchIngestion(sources, systemUserId);
    
    await logSystemEvent({ level: "INFO", source: "jarvis", message: "FETCH_COMPLETED", context: ingestSummary as unknown as Record<string, unknown> });

    // 2. Verification and Publish
    const verifySummary = await processVerificationBatch();
    
    await logSystemEvent({ level: "INFO", source: "jarvis", message: "VERIFY_COMPLETED", context: verifySummary as unknown as Record<string, unknown> });

    // 3. Instagram Publish (if real run)
    let instagramAttempted = 0;
    let instagramPublished = 0;
    
    if (!isDryRun() && isInstagramConfigured() && isInstagramAutoPublishEnabled()) {
      // Find articles published in the last 1 hour that don't have an instagram post
      const recentArticles = await prisma.article.findMany({
        where: {
          status: "PUBLISHED",
          publishedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          autoPublished: true, // Only for JARVIS published ones? Actually any published is fine, but lets be safe.
        },
        include: {
          category: true,
          tags: { include: { tag: true } }
        }
      });

      for (const article of recentArticles) {
        // Check if already posted
        const existingPost = await prisma.socialPost.findFirst({
          where: { articleId: article.id, platform: "INSTAGRAM" }
        });
        if (existingPost) continue;

        if (!article.featuredImageUrl) continue; // Requires image

        const job = await createAutomationJob(run.id, "INSTAGRAM_POST");
        await prisma.socialPost.create({
          data: {
            jobId: job.id,
            articleId: article.id,
            platform: "INSTAGRAM"
          }
        });

        instagramAttempted++;
        const result = await publishArticleToInstagram({
          articleId: article.id,
          jobId: job.id,
          title: article.title,
          excerpt: article.excerpt || "",
          categoryName: article.category.name,
          tagNames: article.tags.map(t => t.tag.name),
          url: `${process.env.NEXT_PUBLIC_SITE_URL}/category/${article.category.slug}/${article.slug}`,
          pakistanRelevance: article.pakistanRelevance,
          featuredImageUrl: article.featuredImageUrl
        });

        if (result.ok) {
          instagramPublished++;
          await updateAutomationJob(job.id, { status: "COMPLETED" });
        } else {
          await updateAutomationJob(job.id, { status: "FAILED", error: result.error });
        }
      }
    }

    await completeAutomationRun(run.id, {
      storiesFetched: ingestSummary.itemsCreated,
      articlesCreated: verifySummary.itemsProcessed,
      articlesPublished: verifySummary.autoPublished,
      instagramAttempted,
      instagramPublished,
      failures: verifySummary.failed + (instagramAttempted - instagramPublished)
    });

    return { ok: true, runId: run.id };
  } catch (error: any) {
    await failAutomationRun(run.id, error.message);
    return { ok: false, error: error.message };
  }
}
