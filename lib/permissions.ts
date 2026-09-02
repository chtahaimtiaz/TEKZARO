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
/** Roles allowed to upload/manage the media library. */
export const CAN_MANAGE_MEDIA: Role[] = ["ADMIN", "EDITOR"];
/** Roles allowed to compose and send newsletter campaigns. */
export const CAN_SEND_NEWSLETTER: Role[] = ["ADMIN", "EDITOR"];
/** Roles allowed to view operational monitoring (system events, health). */
export const CAN_VIEW_MONITORING: Role[] = ["ADMIN"];
/** Roles allowed to view real analytics (page views, top articles). */
export const CAN_VIEW_ANALYTICS: Role[] = ["ADMIN", "EDITOR"];
/** Roles allowed to run the editorial data export. */
export const CAN_MANAGE_BACKUPS: Role[] = ["ADMIN"];
/** Roles allowed to create/edit authors and set their category eligibility. */
export const CAN_MANAGE_AUTHORS: Role[] = ["ADMIN", "EDITOR"];
/** Roles allowed to save an article with an author ineligible for its
 * category — a rare, explicit bypass, deliberately narrower than
 * CAN_MANAGE_AUTHORS/CAN_WRITE. */
export const CAN_OVERRIDE_AUTHOR_ELIGIBILITY: Role[] = ["ADMIN"];
/** Roles allowed to permanently delete an article. Deliberately narrower
 * than CAN_EDIT_ANY — a hard delete has no undo, unlike every other
 * workflow transition. */
export const CAN_DELETE_ARTICLE: Role[] = ["ADMIN"];
/** Roles allowed to manage advertisers, ad campaigns and creatives —
 * mirrors CAN_MANAGE_AUTHORS/CAN_SEND_NEWSLETTER, day-to-day ad-ops work
 * that doesn't need a narrower carve-out the way delete/override do. */
export const CAN_MANAGE_ADS: Role[] = ["ADMIN", "EDITOR"];

/** SYSTEM is a real Role value but is never assignable through any admin
 * action, never shown in the user list, and can never be deactivated —
 * see lib/system-actor.ts. Every user-admin mutation must reject it. */
export const ASSIGNABLE_ROLES: Role[] = ["ADMIN", "EDITOR", "REPORTER", "RESEARCHER"];

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
