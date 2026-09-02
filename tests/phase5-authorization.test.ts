import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../lib/prisma";
import { ForbiddenError } from "../lib/auth";
import { resetUserPasswordAction, inviteUserAction } from "../lib/user-actions";
import { deleteMediaAction } from "../lib/media-actions";
import { createCampaignAction, sendCampaignAction, sendTestCampaignAction } from "../lib/newsletter-actions";
import { markNotificationReadAction } from "../lib/notification-actions";
import { createTestUser, loginAs, clearSession, trackUser, cleanupTestData } from "./helpers";

afterAll(cleanupTestData);

describe("unauthorized access — media, newsletter, user administration", () => {
  it("a REPORTER cannot reset another user's password", async () => {
    const reporter = await createTestUser("REPORTER", "authz-reporter-reset");
    const target = await createTestUser("REPORTER", "authz-reset-target");
    trackUser(reporter.id);
    trackUser(target.id);
    await loginAs(reporter.id);

    await expect(resetUserPasswordAction(target.id)).rejects.toThrow(ForbiddenError);
    clearSession();
  });

  it("a REPORTER cannot invite a new user", async () => {
    const reporter = await createTestUser("REPORTER", "authz-reporter-invite");
    trackUser(reporter.id);
    await loginAs(reporter.id);

    const form = new FormData();
    form.set("name", "Nope");
    form.set("email", `nope-${Date.now()}@example.com`);
    form.set("role", "REPORTER");

    await expect(inviteUserAction(form)).rejects.toThrow(ForbiddenError);
    clearSession();
  });

  it("a REPORTER cannot delete media", async () => {
    const reporter = await createTestUser("REPORTER", "authz-reporter-media");
    trackUser(reporter.id);
    await loginAs(reporter.id);

    await expect(deleteMediaAction("does-not-matter")).rejects.toThrow(ForbiddenError);
    clearSession();
  });

  it("a REPORTER cannot create or send a newsletter campaign", async () => {
    const reporter = await createTestUser("REPORTER", "authz-reporter-newsletter");
    trackUser(reporter.id);
    await loginAs(reporter.id);

    const form = new FormData();
    form.set("subject", "Nope");
    form.set("bodyHtml", "<p>Nope</p>");
    await expect(createCampaignAction(form)).rejects.toThrow(ForbiddenError);
    await expect(sendCampaignAction("does-not-matter")).rejects.toThrow(ForbiddenError);
    await expect(sendTestCampaignAction("does-not-matter")).rejects.toThrow(ForbiddenError);
    clearSession();
  });

  it("an unauthenticated caller cannot mark a notification read", async () => {
    clearSession();
    await expect(markNotificationReadAction("does-not-matter")).rejects.toThrow(ForbiddenError);
  });

  it("an EDITOR can send a newsletter campaign but not manage users", async () => {
    const editor = await createTestUser("EDITOR", "authz-editor-newsletter");
    trackUser(editor.id);
    await loginAs(editor.id);

    const form = new FormData();
    form.set("subject", `Test Subject ${Date.now()}`);
    form.set("bodyHtml", "<p>Body</p>");
    const created = await createCampaignAction(form);
    expect(created.ok).toBe(true);

    await expect(inviteUserAction(new FormData())).rejects.toThrow(ForbiddenError);
    clearSession();

    if (created.data?.id) {
      await prisma.newsletterCampaign.delete({ where: { id: created.data.id } }).catch(() => {});
    }
  });
});
