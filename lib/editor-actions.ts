"use server";

import { getSessionUser, requireRole } from "./auth";
import { CAN_WRITE } from "./permissions";
import { suggestInternalLinks, type InternalLinkSuggestion } from "./internal-links";

export async function suggestInternalLinksAction(params: {
  excludeArticleId?: string;
  categoryId: string | null;
  tagNames: string[];
  title: string;
}): Promise<InternalLinkSuggestion[]> {
  const sessionUser = await getSessionUser();
  requireRole(sessionUser, CAN_WRITE);
  return suggestInternalLinks(params);
}
