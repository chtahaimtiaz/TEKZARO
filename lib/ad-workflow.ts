import type { AdCampaignStatus, Role } from "@prisma/client";
import { CAN_MANAGE_ADS } from "./permissions";

export type AdTransitionName = "submit" | "approve" | "reject" | "pause" | "resume";

interface AdTransitionRule {
  from: AdCampaignStatus[];
  to: AdCampaignStatus;
}

/** Every transition is gated on the same CAN_MANAGE_ADS role — unlike
 * article workflow there's no reporter-owned-draft concept here, so there's
 * nothing for a per-role table to differentiate. */
export const AD_TRANSITIONS: Record<AdTransitionName, AdTransitionRule> = {
  submit: { from: ["DRAFT"], to: "PENDING_REVIEW" },
  approve: { from: ["PENDING_REVIEW"], to: "APPROVED" },
  reject: { from: ["PENDING_REVIEW"], to: "REJECTED" },
  pause: { from: ["APPROVED"], to: "PAUSED" },
  resume: { from: ["PAUSED"], to: "APPROVED" },
};

export const AD_TRANSITION_LABELS: Record<AdTransitionName, string> = {
  submit: "Submit for review",
  approve: "Approve",
  reject: "Reject",
  pause: "Pause",
  resume: "Resume",
};

export class AdWorkflowError extends Error {}

export function legalAdTransitionsFor(status: AdCampaignStatus, role: Role): AdTransitionName[] {
  if (!CAN_MANAGE_ADS.includes(role)) return [];
  return (Object.keys(AD_TRANSITIONS) as AdTransitionName[]).filter((name) => AD_TRANSITIONS[name].from.includes(status));
}

/** The only place ad-campaign transition legality is decided. Keyed off the
 * campaign's *current* DB status and the caller's *DB* role — never a
 * client-supplied target status. */
export function assertAdTransition(name: AdTransitionName, campaign: { status: AdCampaignStatus }, actor: { role: Role }): AdCampaignStatus {
  const rule = AD_TRANSITIONS[name];
  if (!CAN_MANAGE_ADS.includes(actor.role)) {
    throw new AdWorkflowError(`Your role (${actor.role}) cannot manage ad campaigns.`);
  }
  if (!rule.from.includes(campaign.status)) {
    throw new AdWorkflowError(`Cannot ${name}: campaign is ${campaign.status}, expected one of ${rule.from.join(", ")}.`);
  }
  return rule.to;
}
