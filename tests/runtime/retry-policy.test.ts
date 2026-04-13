import { describe, expect, it } from "vitest";

import { decideRetry } from "../../src/runtime/retry-policy.js";

describe("retry policy", () => {
  it("continues when failure is actionable and budget remains", () => {
    const decision = decideRetry({
      attempt: 1,
      maxAttempts: 3,
      noProgressAbort: 2,
      diff: {
        preExisting: [],
        introduced: [
          {
            command: "npm test",
            message: "x",
            fingerprint: "x",
            signature: "x"
          }
        ],
        resolved: [],
        classified: []
      },
      verificationPassed: false,
      previousNoProgressCount: 0
    });

    expect(decision.shouldRetry).toBe(true);
    expect(decision.nextAttempt).toBe(2);
    expect(decision.reason).toBe("actionable_failure");
  });

  it("stops when max attempts is reached", () => {
    const decision = decideRetry({
      attempt: 3,
      maxAttempts: 3,
      noProgressAbort: 2,
      diff: null,
      verificationPassed: false,
      previousNoProgressCount: 0
    });

    expect(decision.shouldRetry).toBe(false);
    expect(decision.reason).toBe("max_attempts_reached");
  });

  it("stops on no-progress threshold", () => {
    const decision = decideRetry({
      attempt: 1,
      maxAttempts: 3,
      noProgressAbort: 2,
      diff: null,
      verificationPassed: false,
      previousNoProgressCount: 1
    });

    expect(decision.shouldRetry).toBe(false);
    expect(decision.reason).toBe("no_progress");
    expect(decision.noProgressCount).toBe(2);
  });
});
