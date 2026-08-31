import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { ForbiddenError } from "../lib/auth";
import { createTestUser, loginAs, clearSession, trackUser, cleanupTestData } from "./helpers";

const deleteUploadMock = vi.fn(async () => undefined);
vi.mock("../lib/media/storage", () => ({
  deleteUpload: deleteUploadMock,
}));

const { deleteMediaAction, approveMediaAction, rejectMediaAction } = await import("../lib/media-actions");
const { prisma } = await import("../lib/prisma");
const { getSystemUserId } = await import("../lib/system-actor");

const createdMediaIds: string[] = [];

async function makeMedia(overrides: Partial<{ reuseStatus: "UNKNOWN" | "ALLOWED" | "REQUIRES_REVIEW" | "REJECTED" }> = {}) {
  const uploadedById = await getSystemUserId();
  const media = await prisma.media.create({
    data: {
      url: `https://blob.example/test-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
      altText: "Test image",
      filename: "test.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      uploadedById,
      reuseStatus: overrides.reuseStatus ?? "REQUIRES_REVIEW",
    },
  });
  createdMediaIds.push(media.id);
  return media;
}

beforeEach(() => {
  deleteUploadMock.mockClear();
});

afterAll(async () => {
  if (createdMediaIds.length) await prisma.media.deleteMany({ where: { id: { in: createdMediaIds } } });
  clearSession();
  await cleanupTestData();
});

describe("authorization", () => {
  it("rejects a REPORTER calling any media action", async () => {
    const reporter = await createTestUser("REPORTER", "media-unauth");
    trackUser(reporter.id);
    await loginAs(reporter.id);

    const media = await makeMedia();
    await expect(deleteMediaAction(media.id)).rejects.toThrow(ForbiddenError);
    await expect(approveMediaAction(media.id)).rejects.toThrow(ForbiddenError);
    await expect(rejectMediaAction(media.id)).rejects.toThrow(ForbiddenError);
    clearSession();
  });

  it("rejects an unauthenticated call", async () => {
    clearSession();
    const media = await makeMedia();
    await expect(approveMediaAction(media.id)).rejects.toThrow(ForbiddenError);
  });
});

describe("approveMediaAction", () => {
  it("sets reuseStatus to ALLOWED — an editor is real, human-vouched-for permission", async () => {
    const editor = await createTestUser("EDITOR", "media-approve");
    trackUser(editor.id);
    await loginAs(editor.id);

    const media = await makeMedia({ reuseStatus: "REQUIRES_REVIEW" });
    await approveMediaAction(media.id);

    const updated = await prisma.media.findUniqueOrThrow({ where: { id: media.id } });
    expect(updated.reuseStatus).toBe("ALLOWED");
    clearSession();
  });
});

describe("rejectMediaAction", () => {
  it("sets reuseStatus to REJECTED and deletes the underlying stored file (rejection has teeth)", async () => {
    const editor = await createTestUser("EDITOR", "media-reject");
    trackUser(editor.id);
    await loginAs(editor.id);

    const media = await makeMedia({ reuseStatus: "REQUIRES_REVIEW" });
    await rejectMediaAction(media.id);

    expect(deleteUploadMock).toHaveBeenCalledWith(media.url);
    const updated = await prisma.media.findUniqueOrThrow({ where: { id: media.id } });
    expect(updated.reuseStatus).toBe("REJECTED");
    // The row itself survives (audit trail) — only the file is removed.
    clearSession();
  });
});

describe("deleteMediaAction", () => {
  it("deletes the underlying file and removes the row entirely", async () => {
    const editor = await createTestUser("EDITOR", "media-delete");
    trackUser(editor.id);
    await loginAs(editor.id);

    const media = await makeMedia();
    await deleteMediaAction(media.id);

    expect(deleteUploadMock).toHaveBeenCalledWith(media.url);
    const gone = await prisma.media.findUnique({ where: { id: media.id } });
    expect(gone).toBeNull();
    createdMediaIds.splice(createdMediaIds.indexOf(media.id), 1); // already gone, don't try to delete it again in afterAll
    clearSession();
  });
});
