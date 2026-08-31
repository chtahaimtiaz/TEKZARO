import type { ArticleStatus, Role } from "@prisma/client";

export type TransitionName =
  | "submit"
  | "requestChanges"
  | "approve"
  | "schedule"
  | "publish"
  | "archive"
  | "reopen";

/** Roles that may only act on their own articles for a given transition —
 * mirrors lib/permissions.ts's OWN_DRAFT_ONLY_ROLES. */
const OWN_ONLY_ROLES: Role[] = ["REPORTER", "RESEARCHER"];

interface TransitionRule {
  from: ArticleStatus[];
  to: ArticleStatus;
  allowedRoles: Role[];
  /** REPORTER/RESEARCHER may only perform this transition on articles they created. */
  ownOnlyForReporter?: boolean;
}

export const TRANSITIONS: Record<TransitionName, TransitionRule> = {
  submit: {
    from: ["DRAFT", "CHANGES_REQUESTED"],
    to: "IN_REVIEW",
    allowedRoles: ["ADMIN", "EDITOR", "REPORTER", "RESEARCHER"],
    ownOnlyForReporter: true,
  },
  requestChanges: {
    from: ["IN_REVIEW"],
    to: "CHANGES_REQUESTED",
    allowedRoles: ["ADMIN", "EDITOR"],
  },
  approve: {
    from: ["IN_REVIEW"],
    to: "APPROVED",
    allowedRoles: ["ADMIN", "EDITOR"],
  },
  schedule: {
    from: ["APPROVED"],
    to: "SCHEDULED",
    allowedRoles: ["ADMIN", "EDITOR"],
  },
  publish: {
    from: ["APPROVED", "SCHEDULED"],
    to: "PUBLISHED",
    allowedRoles: ["ADMIN", "EDITOR"],
  },
  archive: {
    from: ["PUBLISHED"],
    to: "ARCHIVED",
    allowedRoles: ["ADMIN", "EDITOR"],
  },
  reopen: {
    from: ["ARCHIVED"],
    to: "DRAFT",
    allowedRoles: ["ADMIN", "EDITOR"],
  },
};

export class WorkflowError extends Error {}

/** Which transition buttons a given role may see for an article in `status`. */
export function legalTransitionsFor(
  status: ArticleStatus,
  role: Role,
  isOwner: boolean,
): TransitionName[] {
  return (Object.keys(TRANSITIONS) as TransitionName[]).filter((name) => {
    const rule = TRANSITIONS[name];
    if (!rule.from.includes(status)) return false;
    if (!rule.allowedRoles.includes(role)) return false;
    if (rule.ownOnlyForReporter && OWN_ONLY_ROLES.includes(role) && !isOwner) return false;
    return true;
  });
}

export const TRANSITION_LABELS: Record<TransitionName, string> = {
  submit: "Submit for review",
  requestChanges: "Request changes",
  approve: "Approve",
  schedule: "Schedule",
  publish: "Publish",
  archive: "Archive",
  reopen: "Reopen",
};

interface TransitionActor {
  id: string;
  role: Role;
}

interface TransitionSubject {
  status: ArticleStatus;
  createdById: string | null;
}

/**
 * The only place transition legality is decided. Keyed off the article's
 * *current* DB status and the caller's *DB* role — never a client-supplied
 * target status. Throws WorkflowError with a specific reason on failure.
 */
export function assertTransition(name: TransitionName, article: TransitionSubject, actor: TransitionActor): ArticleStatus {
  const rule = TRANSITIONS[name];

  if (!rule.from.includes(article.status)) {
    throw new WorkflowError(
      `Cannot ${name}: article is ${article.status}, expected one of ${rule.from.join(", ")}.`,
    );
  }
  if (!rule.allowedRoles.includes(actor.role)) {
    throw new WorkflowError(`Your role (${actor.role}) cannot perform "${name}".`);
  }
  if (rule.ownOnlyForReporter && OWN_ONLY_ROLES.includes(actor.role) && article.createdById !== actor.id) {
    throw new WorkflowError("You can only submit your own drafts.");
  }

  return rule.to;
}
