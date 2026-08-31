import type { ArticleStatus, Role } from "@prisma/client";

export const ALL_STAFF_ROLES: Role[] = ["ADMIN", "EDITOR", "REPORTER", "RESEARCHER"];

/** Roles allowed to create/edit their own drafts. RESEARCHER can create
 * research/draft material (from discovery) but never publish it. */
export const CAN_WRITE: Role[] = ["ADMIN", "EDITOR", "REPORTER", "RESEARCHER"];
/** Roles allowed to edit any article, not just their own. */
export const CAN_EDIT_ANY: Role[] = ["ADMIN", "EDITOR"];
/** Roles allowed to move a submission through review (request changes / approve). */
export const CAN_REVIEW: Role[] = ["ADMIN", "EDITOR"];
/** Roles allowed to schedule, publish or archive. */
export const CAN_PUBLISH: Role[] = ["ADMIN", "EDITOR"];
/** Roles allowed to view the audit log. */
export const CAN_VIEW_AUDIT_LOG: Role[] = ["ADMIN", "EDITOR"];
/** Roles allowed to manage users and roles. */
export const CAN_MANAGE_USERS: Role[] = ["ADMIN"];
/** Roles allowed to add/edit/enable/disable ingestion sources. */
export const CAN_MANAGE_SOURCES: Role[] = ["ADMIN", "EDITOR"];
/** Roles allowed to view the discovery queue and story clusters. */
export const CAN_VIEW_DISCOVERY: Role[] = ["ADMIN", "EDITOR", "RESEARCHER"];
/** Roles allowed to research: notes, claims, status changes, clustering. */
export const CAN_RESEARCH: Role[] = ["ADMIN", "EDITOR", "RESEARCHER"];
/** Roles allowed to turn a discovery item/cluster into an article draft. */
export const CAN_CREATE_DRAFT_FROM_DISCOVERY: Role[] = ["ADMIN", "EDITOR", "RESEARCHER"];
/** Roles allowed to manage the discovery keyword list. */
export const CAN_MANAGE_KEYWORDS: Role[] = ["ADMIN", "EDITOR"];
/** Roles allowed to build the Pakistan Tech Daily digest. */
export const CAN_BUILD_DIGEST: Role[] = ["ADMIN", "EDITOR"];

/** REPORTER/RESEARCHER may edit only their own article, and only while it's
 * still in an editor-owned state — once submitted for review it becomes
 * read-only to them (an editor can still bounce it back with
 * CHANGES_REQUESTED, which is also editable by the owner so the loop isn't
 * a dead end). ADMIN/EDITOR can always edit anything. */
const OWN_DRAFT_ONLY_ROLES: Role[] = ["REPORTER", "RESEARCHER"];
const EDITABLE_STATUSES_FOR_OWNER: ArticleStatus[] = ["DRAFT", "CHANGES_REQUESTED"];

export function canEditArticle(
  role: Role,
  article: { createdById: string | null; status: ArticleStatus },
  userId: string,
): boolean {
  if (CAN_EDIT_ANY.includes(role)) return true;
  if (OWN_DRAFT_ONLY_ROLES.includes(role)) {
    return article.createdById === userId && EDITABLE_STATUSES_FOR_OWNER.includes(article.status);
  }
  return false;
}

/** Broader than canEditArticle — an owner can still preview/view history for
 * their own article after submitting it, even though it's read-only. */
export function canViewArticle(
  role: Role,
  article: { createdById: string | null },
  userId: string,
): boolean {
  if (CAN_EDIT_ANY.includes(role)) return true;
  if (OWN_DRAFT_ONLY_ROLES.includes(role)) return article.createdById === userId;
  return false;
}
