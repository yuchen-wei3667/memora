import { describe, expect, it } from "vitest";

import { evaluateSafetyPolicy } from "../../src/tools/safety-policy.js";

describe("tool safety policy", () => {
  it("blocks dangerous destructive scripts", () => {
    const result = evaluateSafetyPolicy({
      scriptContent: "rm -rf /",
      allowNetwork: false
    });

    expect(result.allowed).toBe(false);
    expect(
      result.reasons.some((reason) => reason.includes("recursive root delete"))
    ).toBe(true);
  });

  it("blocks network usage when disallowed", () => {
    const result = evaluateSafetyPolicy({
      scriptContent: "curl https://example.com",
      allowNetwork: false
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("curl"))).toBe(true);
  });

  it("allows ordinary local scripts", () => {
    const result = evaluateSafetyPolicy({
      scriptContent: "npm test",
      allowNetwork: false
    });

    expect(result.allowed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });
});
