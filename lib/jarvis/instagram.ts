import "server-only";
import { readEnvSecret } from "../env-secret";
import { generateSocialPosts } from "../social-posts";
import { prisma } from "../prisma";
import { logSystemEvent } from "../monitoring";
import { getInstagramConfig } from "./config";
import * as Errors from "./errors";

export function isInstagramConfigured(): boolean {
  const config = getInstagramConfig();
  if (!config.enabled) return false;
  const token = readEnvSecret("INSTAGRAM_ACCESS_TOKEN");
  const accountId = readEnvSecret("INSTAGRAM_ACCOUNT_ID");
  return Boolean(token && accountId);
}

export function isInstagramAutoPublishEnabled(): boolean {
  return getInstagramConfig().autoPublish;
}

export async function createInstagramMediaContainer(mediaUrl: string, caption: string): Promise<{ id: string }> {
  const token = readEnvSecret("INSTAGRAM_ACCESS_TOKEN");
  const accountId = readEnvSecret("INSTAGRAM_ACCOUNT_ID");
  if (!token || !accountId) throw new Error(Errors.INSTAGRAM_AUTH_ERROR);

  const url = `https://graph.facebook.com/v22.0/${accountId}/media`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: mediaUrl,
      caption: caption,
      access_token: token,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error(Errors.INSTAGRAM_AUTH_ERROR);
    if (response.status === 429 || data?.error?.code === 32 || data?.error?.code === 4) throw new Error(Errors.INSTAGRAM_RATE_LIMIT_ERROR);
    throw new Error(Errors.INSTAGRAM_MEDIA_ERROR);
  }
  return { id: data.id };
}

export async function checkContainerStatus(containerId: string): Promise<"FINISHED" | "IN_PROGRESS" | "ERROR"> {
  const token = readEnvSecret("INSTAGRAM_ACCESS_TOKEN");
  if (!token) throw new Error(Errors.INSTAGRAM_AUTH_ERROR);

  const url = `https://graph.facebook.com/v22.0/${containerId}?fields=status_code&access_token=${token}`;
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error(Errors.INSTAGRAM_AUTH_ERROR);
    if (response.status === 429) throw new Error(Errors.INSTAGRAM_RATE_LIMIT_ERROR);
    return "ERROR";
  }
  return data.status_code;
}

export async function publishInstagramContainer(containerId: string): Promise<{ id: string }> {
  const token = readEnvSecret("INSTAGRAM_ACCESS_TOKEN");
  const accountId = readEnvSecret("INSTAGRAM_ACCOUNT_ID");
  if (!token || !accountId) throw new Error(Errors.INSTAGRAM_AUTH_ERROR);

  const url = `https://graph.facebook.com/v22.0/${accountId}/media_publish`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creation_id: containerId,
      access_token: token,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error(Errors.INSTAGRAM_AUTH_ERROR);
    if (response.status === 429 || data?.error?.code === 32 || data?.error?.code === 4) throw new Error(Errors.INSTAGRAM_RATE_LIMIT_ERROR);
    throw new Error(Errors.INSTAGRAM_PUBLISH_ERROR);
  }
  return { id: data.id };
}

export async function publishArticleToInstagram(params: {
  articleId: string;
  jobId: string;
  title: string;
  excerpt: string;
  categoryName: string;
  tagNames: string[];
  url: string;
  pakistanRelevance: number;
  featuredImageUrl: string;
}): Promise<{ ok: boolean; postId?: string; error?: string; errorCode?: string }> {
  if (!isInstagramConfigured()) {
    return { ok: false, error: "Instagram not configured", errorCode: Errors.INSTAGRAM_AUTH_ERROR };
  }

  const posts = generateSocialPosts({
    title: params.title,
    excerpt: params.excerpt,
    categoryName: params.categoryName,
    tagNames: params.tagNames,
    url: params.url,
    pakistanRelevance: params.pakistanRelevance,
  });
  const caption = posts.find(p => p.platform === "instagram")?.text || params.title;

  await prisma.socialPost.update({
    where: { jobId: params.jobId },
    data: {
      status: "CREATING",
      caption: caption,
      mediaUrl: params.featuredImageUrl,
    },
  });

  try {
    const container = await createInstagramMediaContainer(params.featuredImageUrl, caption);

    await prisma.socialPost.update({
      where: { jobId: params.jobId },
      data: {
        status: "PROCESSING",
        externalMediaId: container.id,
      },
    });

    let status = "IN_PROGRESS";
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      status = await checkContainerStatus(container.id);
      if (status !== "IN_PROGRESS") break;
    }

    if (status === "ERROR" || status === "IN_PROGRESS") {
      await prisma.socialPost.update({
        where: { jobId: params.jobId },
        data: { status: "FAILED", error: "Container processing failed or timed out" },
      });
      return { ok: false, error: "Container processing failed or timed out", errorCode: Errors.INSTAGRAM_MEDIA_ERROR };
    }

    await prisma.socialPost.update({
      where: { jobId: params.jobId },
      data: { status: "PUBLISHING" },
    });

    const post = await publishInstagramContainer(container.id);

    await prisma.socialPost.update({
      where: { jobId: params.jobId },
      data: {
        status: "PUBLISHED",
        externalPostId: post.id,
        publishedAt: new Date(),
      },
    });

    await logSystemEvent({
      level: "INFO",
      source: "jarvis.instagram",
      message: `Instagram post published for article ${params.articleId}`,
      context: { articleId: params.articleId, postId: post.id },
    });

    return { ok: true, postId: post.id };
  } catch (error: any) {
    await prisma.socialPost.update({
      where: { jobId: params.jobId },
      data: { status: "FAILED", error: error.message },
    });
    return { ok: false, error: error.message, errorCode: error.message };
  }
}
