import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readEnvSecret } from "../lib/env-secret";

const BOM = String.fromCharCode(0xfeff);
const VAR = "TEST_ENV_SECRET_VALUE";
const saved: string | undefined = process.env[VAR];

beforeEach(() => delete process.env[VAR]);
afterEach(() => {
  if (saved === undefined) delete process.env[VAR];
  else process.env[VAR] = saved;
});

describe("readEnvSecret", () => {
  it("returns undefined when the variable is not set at all", () => {
    expect(readEnvSecret(VAR)).toBeUndefined();
  });

  it("returns a clean value unchanged", () => {
    process.env[VAR] = "tvly-realkey-abc123";
    expect(readEnvSecret(VAR)).toBe("tvly-realkey-abc123");
  });

  it("strips a leading BOM — the exact production failure this exists to fix", () => {
    process.env[VAR] = `${BOM}tvly-realkey-abc123`;
    expect(readEnvSecret(VAR)).toBe("tvly-realkey-abc123");
  });

  it("strips a BOM landing anywhere in the value, not only at the start", () => {
    process.env[VAR] = `tvly-real${BOM}key-abc123`;
    expect(readEnvSecret(VAR)).toBe("tvly-realkey-abc123");
  });

  it("strips multiple BOM occurrences", () => {
    process.env[VAR] = `${BOM}${BOM}tvly-key${BOM}`;
    expect(readEnvSecret(VAR)).toBe("tvly-key");
  });

  it("trims ordinary leading/trailing whitespace, another routine paste artifact", () => {
    process.env[VAR] = "  tvly-realkey-abc123  \n";
    expect(readEnvSecret(VAR)).toBe("tvly-realkey-abc123");
  });

  it("treats a BOM-only or whitespace-only value as unset, not as an empty configured secret", () => {
    process.env[VAR] = BOM;
    expect(readEnvSecret(VAR)).toBeUndefined();
    process.env[VAR] = "   ";
    expect(readEnvSecret(VAR)).toBeUndefined();
  });

  it("treats a plain empty string as unset", () => {
    process.env[VAR] = "";
    expect(readEnvSecret(VAR)).toBeUndefined();
  });

  it("the cleaned value never throws when used in a fetch Headers object — the actual bug reproduced and fixed", () => {
    process.env[VAR] = `${BOM}tvly-realkey-abc123`;
    const cleaned = readEnvSecret(VAR)!;
    expect(() => new Headers({ authorization: `Bearer ${cleaned}` })).not.toThrow();

    // And confirm the RAW value (pre-fix) really does reproduce the exact
    // production error, so this test would have caught the original bug.
    const raw = process.env[VAR]!;
    expect(() => new Headers({ authorization: `Bearer ${raw}` })).toThrow(/ByteString/);
  });
});
