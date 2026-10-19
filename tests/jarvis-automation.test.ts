import { describe, it, expect, vi, beforeEach } from "vitest";
import { runFullAutomationCycle } from "@/lib/jarvis/automation";
import { prisma } from "@/lib/prisma";
import * as config from "@/lib/jarvis/config";
import * as instagram from "@/lib/jarvis/instagram";

vi.mock("@/lib/jarvis/config");
vi.mock("@/lib/jarvis/instagram");
vi.mock("@/lib/ingestion/batch-fetch", () => ({
  runBatchIngestion: vi.fn().mockResolvedValue({ itemsCreated: 5, sourcesChecked: 1 }),
  getEligibleActiveSources: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/verification-actions", () => ({
  processVerificationBatch: vi.fn().mockResolvedValue({ itemsProcessed: 5, autoPublished: 2, failed: 0 }),
}));
vi.mock("@/lib/monitoring", () => ({
  logSystemEvent: vi.fn(),
}));

describe("JARVIS Automation", () => {
  beforeEach(async () => {
    await prisma.automationRun.deleteMany();
    await prisma.automationJob.deleteMany();
    await prisma.socialPost.deleteMany();
    vi.clearAllMocks();
    
    vi.mocked(config.isEnabled).mockReturnValue(true);
    vi.mocked(config.isEmergencyStop).mockReturnValue(false);
    vi.mocked(config.isDryRun).mockReturnValue(false);
    vi.mocked(config.isApprovalMode).mockReturnValue(false);
    vi.mocked(instagram.isInstagramConfigured).mockReturnValue(false);
  });

  it("should block concurrent runs", async () => {
    await prisma.automationRun.create({ data: { status: "RUNNING", triggeredBy: "test" } });
    const result = await runFullAutomationCycle("cron");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("ANOTHER_RUN_ACTIVE");
  });

  it("should respect emergency stop", async () => {
    vi.mocked(config.isEmergencyStop).mockReturnValue(true);
    const result = await runFullAutomationCycle("cron");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("EMERGENCY_STOP_ACTIVE");
  });

  it("should respect automation disabled", async () => {
    vi.mocked(config.isEnabled).mockReturnValue(false);
    const result = await runFullAutomationCycle("cron");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("AUTOMATION_DISABLED");
  });

  it("should execute a full successful run", async () => {
    const result = await runFullAutomationCycle("cron");
    expect(result.ok).toBe(true);

    const run = await prisma.automationRun.findUnique({ where: { id: result.runId } });
    expect(run?.status).toBe("COMPLETED");
    expect(run?.storiesFetched).toBe(5);
    expect(run?.articlesCreated).toBe(5);
    expect(run?.articlesPublished).toBe(2);
  });
});
