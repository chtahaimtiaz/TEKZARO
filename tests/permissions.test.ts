import { describe, it, expect } from "vitest";
import { canEditArticle, canViewArticle, CAN_MANAGE_AUTHORS, CAN_OVERRIDE_AUTHOR_ELIGIBILITY } from "../lib/permissions";

const draft = (createdById: string | null) => ({ createdById, status: "DRAFT" as const });
const inReview = (createdById: string | null) => ({ createdById, status: "IN_REVIEW" as const });
const changesRequested = (createdById: string | null) => ({ createdById, status: "CHANGES_REQUESTED" as const });
const approved = (createdById: string | null) => ({ createdById, status: "APPROVED" as const });
const published = (createdById: string | null) => ({ createdById, status: "PUBLISHED" as const });

describe("canEditArticle", () => {
  it("lets ADMIN edit any article regardless of creator or status", () => {
    expect(canEditArticle("ADMIN", draft("someone-else"), "me")).toBe(true);
    expect(canEditArticle("ADMIN", published(null), "me")).toBe(true);
  });

  it("lets EDITOR edit any article regardless of creator or status", () => {
    expect(canEditArticle("EDITOR", published("someone-else"), "me")).toBe(true);
  });

  for (const role of ["REPORTER", "RESEARCHER"] as const) {
    it(`lets ${role} edit their own DRAFT`, () => {
      expect(canEditArticle(role, draft("me"), "me")).toBe(true);
    });

    it(`lets ${role} edit their own CHANGES_REQUESTED (so "request changes" isn't a dead end)`, () => {
      expect(canEditArticle(role, changesRequested("me"), "me")).toBe(true);
    });

    it(`makes ${role}'s own article read-only once submitted for review`, () => {
      expect(canEditArticle(role, inReview("me"), "me")).toBe(false);
      expect(canEditArticle(role, approved("me"), "me")).toBe(false);
      expect(canEditArticle(role, published("me"), "me")).toBe(false);
    });

    it(`never lets ${role} edit someone else's article, in any status`, () => {
      expect(canEditArticle(role, draft("someone-else"), "me")).toBe(false);
      expect(canEditArticle(role, inReview("someone-else"), "me")).toBe(false);
    });

    it(`never lets ${role} edit a demo/unowned article (createdById null)`, () => {
      expect(canEditArticle(role, draft(null), "me")).toBe(false);
    });
  }
});

describe("canViewArticle", () => {
  it("is broader than canEditArticle — an owner keeps view access after submission", () => {
    expect(canViewArticle("REPORTER", inReview("me"), "me")).toBe(true);
    expect(canViewArticle("REPORTER", published("me"), "me")).toBe(true);
    expect(canViewArticle("RESEARCHER", approved("me"), "me")).toBe(true);
  });

  it("still refuses another user's article", () => {
    expect(canViewArticle("REPORTER", draft("someone-else"), "me")).toBe(false);
  });
});

describe("CAN_MANAGE_AUTHORS / CAN_OVERRIDE_AUTHOR_ELIGIBILITY", () => {
  it("ADMIN and EDITOR can manage authors; REPORTER/RESEARCHER cannot", () => {
    expect(CAN_MANAGE_AUTHORS).toContain("ADMIN");
    expect(CAN_MANAGE_AUTHORS).toContain("EDITOR");
    expect(CAN_MANAGE_AUTHORS).not.toContain("REPORTER");
    expect(CAN_MANAGE_AUTHORS).not.toContain("RESEARCHER");
  });

  it("only ADMIN can override author-category eligibility — deliberately narrower than CAN_MANAGE_AUTHORS", () => {
    expect(CAN_OVERRIDE_AUTHOR_ELIGIBILITY).toEqual(["ADMIN"]);
  });
});
