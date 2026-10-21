import { describe, it, expect } from "vitest";
import { assertTransition, legalTransitionsFor, WorkflowError } from "../lib/workflow";

describe("assertTransition", () => {
  it("allows DRAFT -> IN_REVIEW for the reporter who owns it", () => {
    const result = assertTransition(
      "submit",
      { status: "DRAFT", createdById: "u1" },
      { id: "u1", role: "REPORTER" },
    );
    expect(result).toBe("IN_REVIEW");
  });

  it("rejects a reporter submitting someone else's draft", () => {
    expect(() =>
      assertTransition("submit", { status: "DRAFT", createdById: "someone-else" }, { id: "u1", role: "REPORTER" }),
    ).toThrow(WorkflowError);
  });

  it("rejects REPORTER approving (not an allowed role)", () => {
    expect(() =>
      assertTransition("approve", { status: "IN_REVIEW", createdById: null }, { id: "u1", role: "REPORTER" }),
    ).toThrow(WorkflowError);
  });

  it("allows direct publish for ADMIN from DRAFT", () => {
    const result = assertTransition(
      "publish",
      { status: "DRAFT", createdById: null },
      { id: "a1", role: "ADMIN" },
    );
    expect(result).toBe("PUBLISHED");
  });

  it("allows EDITOR to approve any IN_REVIEW article", () => {
    const result = assertTransition(
      "approve",
      { status: "IN_REVIEW", createdById: "someone-else" },
      { id: "editor-1", role: "EDITOR" },
    );
    expect(result).toBe("APPROVED");
  });

  it("allows EDITOR to publish from APPROVED and SCHEDULED but rejects direct publish from DRAFT", () => {
    expect(assertTransition("publish", { status: "APPROVED", createdById: null }, { id: "e", role: "EDITOR" })).toBe("PUBLISHED");
    expect(assertTransition("publish", { status: "SCHEDULED", createdById: null }, { id: "e", role: "EDITOR" })).toBe("PUBLISHED");
    expect(() => assertTransition("publish", { status: "DRAFT", createdById: null }, { id: "e", role: "EDITOR" })).toThrow(WorkflowError);
    expect(() => assertTransition("publish", { status: "IN_REVIEW", createdById: null }, { id: "e", role: "EDITOR" })).toThrow(WorkflowError);
  });

  it("allows EDITOR to reject from IN_REVIEW or CHANGES_REQUESTED, never from DRAFT/PUBLISHED", () => {
    expect(assertTransition("reject", { status: "IN_REVIEW", createdById: null }, { id: "e", role: "EDITOR" })).toBe("REJECTED");
    expect(assertTransition("reject", { status: "CHANGES_REQUESTED", createdById: null }, { id: "e", role: "EDITOR" })).toBe("REJECTED");
    expect(() => assertTransition("reject", { status: "DRAFT", createdById: null }, { id: "e", role: "EDITOR" })).toThrow(WorkflowError);
    expect(() => assertTransition("reject", { status: "PUBLISHED", createdById: null }, { id: "e", role: "EDITOR" })).toThrow(WorkflowError);
  });

  it("rejects REPORTER/RESEARCHER rejecting — reject is an editorial decision, not an own-draft action", () => {
    expect(() =>
      assertTransition("reject", { status: "IN_REVIEW", createdById: "u1" }, { id: "u1", role: "REPORTER" }),
    ).toThrow(WorkflowError);
  });

  it("a REJECTED article can be reopened to DRAFT, same as ARCHIVED — it's not a dead end", () => {
    expect(assertTransition("reopen", { status: "REJECTED", createdById: null }, { id: "e", role: "EDITOR" })).toBe("DRAFT");
    expect(assertTransition("reopen", { status: "ARCHIVED", createdById: null }, { id: "e", role: "EDITOR" })).toBe("DRAFT");
  });

  it("allows ADMIN to direct publish from DRAFT, IN_REVIEW, or CHANGES_REQUESTED", () => {
    expect(assertTransition("publish", { status: "DRAFT", createdById: null }, { id: "a", role: "ADMIN" })).toBe("PUBLISHED");
    expect(assertTransition("publish", { status: "IN_REVIEW", createdById: null }, { id: "a", role: "ADMIN" })).toBe("PUBLISHED");
    expect(assertTransition("publish", { status: "CHANGES_REQUESTED", createdById: null }, { id: "a", role: "ADMIN" })).toBe("PUBLISHED");
    expect(assertTransition("publish", { status: "APPROVED", createdById: null }, { id: "a", role: "ADMIN" })).toBe("PUBLISHED");
    expect(assertTransition("publish", { status: "SCHEDULED", createdById: null }, { id: "a", role: "ADMIN" })).toBe("PUBLISHED");
  });

  it("rejects non-ADMIN attempting direct publish from DRAFT", () => {
    expect(() =>
      assertTransition("publish", { status: "DRAFT", createdById: null }, { id: "e", role: "EDITOR" }),
    ).toThrow(WorkflowError);
    expect(() =>
      assertTransition("publish", { status: "DRAFT", createdById: "r" }, { id: "r", role: "REPORTER" }),
    ).toThrow(WorkflowError);
  });
});

describe("legalTransitionsFor", () => {
  it("gives an ADMIN direct 'publish' + 'schedule' on DRAFT (no submit or approve buttons)", () => {
    expect(new Set(legalTransitionsFor("DRAFT", "ADMIN", false))).toEqual(
      new Set(["publish", "schedule"]),
    );
  });

  it("gives an EDITOR only 'submit' on DRAFT", () => {
    expect(legalTransitionsFor("DRAFT", "EDITOR", false)).toEqual(["submit"]);
  });

  it("gives an EDITOR 'publish' + 'schedule' on APPROVED", () => {
    expect(new Set(legalTransitionsFor("APPROVED", "EDITOR", false))).toEqual(
      new Set(["publish", "schedule"]),
    );
  });

  it("gives a REPORTER only 'submit' on their own DRAFT", () => {
    expect(legalTransitionsFor("DRAFT", "REPORTER", true)).toEqual(["submit"]);
  });

  it("gives a REPORTER nothing on someone else's DRAFT", () => {
    expect(legalTransitionsFor("DRAFT", "REPORTER", false)).toEqual([]);
  });

  it("gives EDITOR requestChanges + approve + reject on IN_REVIEW", () => {
    expect(new Set(legalTransitionsFor("IN_REVIEW", "EDITOR", false))).toEqual(
      new Set(["requestChanges", "approve", "reject"]),
    );
  });

  it("gives RESEARCHER only 'submit' on their own DRAFT, same as REPORTER (can create draft material, cannot review/publish)", () => {
    expect(legalTransitionsFor("DRAFT", "RESEARCHER", true)).toEqual(["submit"]);
    for (const status of ["IN_REVIEW", "APPROVED", "PUBLISHED"] as const) {
      expect(legalTransitionsFor(status, "RESEARCHER", true)).toEqual([]);
    }
  });

  it("gives RESEARCHER nothing on someone else's DRAFT", () => {
    expect(legalTransitionsFor("DRAFT", "RESEARCHER", false)).toEqual([]);
  });
});
