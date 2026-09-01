import "server-only";
import { prisma } from "../prisma";
import { generateWithAI, isAIConfigured, AI_MODEL, AIProviderNotConfiguredError } from "./provider";
import type { AITask, Prisma } from "@prisma/client";

export interface AITaskResult {
  ok: boolean;
  text?: string;
  generationId: string;
  notConfigured?: boolean;
  error?: string;
}

export async function runTask(params: {
  task: AITask;
  requestedById: string;
  inputRef: Prisma.InputJsonValue;
  systemPrompt: string;
  userPrompt: string;
}): Promise<AITaskResult> {
  const generation = await prisma.aIGeneration.create({
    data: {
      task: params.task,
      model: AI_MODEL,
      status: "PROCESSING",
      requestedById: params.requestedById,
      inputRef: params.inputRef,
    },
  });

  if (!isAIConfigured()) {
    await prisma.aIGeneration.update({
      where: { id: generation.id },
      data: { status: "FAILED", errorMessage: "AI_API_KEY not configured" },
    });
    return { ok: false, generationId: generation.id, notConfigured: true };
  }

  try {
    const text = await generateWithAI(params.systemPrompt, params.userPrompt);
    await prisma.aIGeneration.update({
      where: { id: generation.id },
      data: { status: "COMPLETE", output: { text } },
    });
    return { ok: true, text, generationId: generation.id };
  } catch (err) {
    const message = err instanceof AIProviderNotConfiguredError ? "AI_API_KEY not configured" : String(err);
    await prisma.aIGeneration.update({
      where: { id: generation.id },
      data: { status: "FAILED", errorMessage: message.slice(0, 500) },
    });
    return { ok: false, generationId: generation.id, error: message };
  }
}

export const NEWSROOM_SYSTEM_PROMPT =
  "You are an assistant to a technology newsroom editor. You accelerate research but never " +
  "replace editorial judgment. Never invent facts, quotes, sources, or statistics. Clearly " +
  "separate confirmed facts from claims that still need verification. If the source material " +
  "is insufficient, say so explicitly rather than filling gaps.";

export async function summarizeClaims(params: {
  requestedById: string;
  clusterId: string;
  sourceTexts: { sourceName: string; text: string }[];
}): Promise<AITaskResult> {
  const combined = params.sourceTexts.map((s) => `[${s.sourceName}]\n${s.text}`).join("\n\n");
  return runTask({
    task: "SUMMARIZE",
    requestedById: params.requestedById,
    inputRef: { clusterId: params.clusterId },
    systemPrompt: NEWSROOM_SYSTEM_PROMPT,
    userPrompt: `Summarize what is being reported across these sources about the same story, in 3-5 sentences. Note any point where sources disagree.\n\n${combined}`,
  });
}

export async function extractClaims(params: {
  requestedById: string;
  clusterId: string;
  sourceTexts: { sourceName: string; text: string }[];
}): Promise<AITaskResult> {
  const combined = params.sourceTexts.map((s) => `[${s.sourceName}]\n${s.text}`).join("\n\n");
  return runTask({
    task: "EXTRACT_CLAIMS",
    requestedById: params.requestedById,
    inputRef: { clusterId: params.clusterId },
    systemPrompt: NEWSROOM_SYSTEM_PROMPT,
    userPrompt:
      "List the distinct factual claims made across these sources as a plain numbered list, " +
      "one claim per line. Mark each as [FACT] (independently verifiable / official), [CLAIM] " +
      "(asserted by a source but not independently confirmed), or [SPECULATION] (framed as " +
      `possibility, not asserted as true). Do not invent claims not present in the text.\n\n${combined}`,
  });
}

export async function suggestPakistanImpactNarrative(params: {
  requestedById: string;
  sourceItemId: string;
  headline: string;
  excerpt: string;
  matchedReasons: string[];
}): Promise<AITaskResult> {
  return runTask({
    task: "PAKISTAN_IMPACT",
    requestedById: params.requestedById,
    inputRef: { sourceItemId: params.sourceItemId },
    systemPrompt: NEWSROOM_SYSTEM_PROMPT,
    userPrompt:
      `Headline: ${params.headline}\nSummary: ${params.excerpt}\n` +
      `Detected Pakistan-relevance signals: ${params.matchedReasons.join("; ") || "none"}.\n\n` +
      "Draft a short (2-3 sentence) starting point for a 'What This Means for Pakistan' section, " +
      "grounded only in the detected signals and summary above. If the signals don't support a " +
      "genuine Pakistan angle, say so instead of inventing one. This is a draft for a human editor " +
      "to revise, not a final published statement.",
  });
}
