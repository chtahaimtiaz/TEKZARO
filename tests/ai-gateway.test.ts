import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isAIConfigured, activeAIGateway } from "../lib/ai/provider";

const VARS = [
  "OPENROUTER_API_KEY",
  "AI_MODEL_ID",
  "AI_API_KEY",
  "CF_AI_GATEWAY_TOKEN",
  "CF_AI_GATEWAY_ID",
  "CF_AI_GATEWAY_ACCOUNT_ID",
  "R2_ACCOUNT_ID",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of VARS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("AI gateway selection", () => {
  it("reports unconfigured when nothing is set", () => {
    expect(isAIConfigured()).toBe(false);
    expect(activeAIGateway()).toBeNull();
  });

  it("treats an empty AI_API_KEY as unconfigured, not as a usable key", () => {
    // This is the exact production state that silently produced zero drafts:
    // the variable existed, so it looked configured in a dashboard, but its
    // value was empty.
    process.env.AI_API_KEY = "";
    expect(isAIConfigured()).toBe(false);
  });

  it("uses Vercel AI Gateway when only AI_API_KEY is set", () => {
    process.env.AI_API_KEY = "vck_example";
    expect(isAIConfigured()).toBe(true);
    expect(activeAIGateway()).toBe("vercel");
  });

  it("uses Cloudflare when its token, gateway id and account are all present", () => {
    process.env.CF_AI_GATEWAY_TOKEN = "cfut_example";
    process.env.CF_AI_GATEWAY_ID = "default";
    process.env.CF_AI_GATEWAY_ACCOUNT_ID = "acct123";
    expect(isAIConfigured()).toBe(true);
    expect(activeAIGateway()).toBe("cloudflare");
  });

  it("falls back to R2_ACCOUNT_ID, since both live in the same Cloudflare account", () => {
    process.env.CF_AI_GATEWAY_TOKEN = "cfut_example";
    process.env.CF_AI_GATEWAY_ID = "default";
    process.env.R2_ACCOUNT_ID = "acct-from-r2";
    expect(activeAIGateway()).toBe("cloudflare");
  });

  it("does not treat a partially configured Cloudflare gateway as usable", () => {
    // Partial config must never look configured — that is how a request gets
    // attempted and fails at runtime instead of reporting honestly.
    process.env.CF_AI_GATEWAY_TOKEN = "cfut_example";
    process.env.CF_AI_GATEWAY_ID = "default";
    // no account id anywhere
    expect(isAIConfigured()).toBe(false);
    expect(activeAIGateway()).toBeNull();
  });

  it("prefers Cloudflare over Vercel when both are fully configured", () => {
    process.env.AI_API_KEY = "vck_example";
    process.env.CF_AI_GATEWAY_TOKEN = "cfut_example";
    process.env.CF_AI_GATEWAY_ID = "default";
    process.env.R2_ACCOUNT_ID = "acct123";
    expect(activeAIGateway()).toBe("cloudflare");
  });

  it("falls back to Vercel when Cloudflare is only half configured", () => {
    process.env.AI_API_KEY = "vck_example";
    process.env.CF_AI_GATEWAY_TOKEN = "cfut_example";
    expect(activeAIGateway()).toBe("vercel");
  });
});
