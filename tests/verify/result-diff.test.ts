import { describe, expect, it } from "vitest";

import { diffVerificationFailures } from "../../src/verify/result-diff.js";
import { createFailureSignature } from "../../src/verify/verify-service.js";

describe("verification diff", () => {
  it("classifies pre-existing, introduced, and resolved failures", () => {
    const preExisting = createFailureSignature({
      command: "npm test",
      filePath: "tests/a.test.ts",
      testName: "keeps failing",
      message: "Expected true to be false"
    });
    const resolved = createFailureSignature({
      command: "npm test",
      filePath: "tests/b.test.ts",
      testName: "used to fail",
      message: "Expected 1 to equal 2"
    });
    const introduced = createFailureSignature({
      command: "npm test",
      filePath: "tests/c.test.ts",
      testName: "new failure",
      message: "ReferenceError: missingValue is not defined"
    });

    const diff = diffVerificationFailures(
      [preExisting, resolved],
      [preExisting, introduced]
    );

    expect(diff.preExisting).toEqual([preExisting]);
    expect(diff.introduced).toEqual([introduced]);
    expect(diff.resolved).toEqual([resolved]);
  });
});
