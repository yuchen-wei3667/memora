import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  fingerprintMessage,
  parseVerificationFailures,
  runVerification,
  runVerificationCommand
} from "../../src/verify/verify-service.js";

describe("verify service", () => {
  it("normalizes failure output into signatures", () => {
    const failures = parseVerificationFailures(
      "npm test",
      "FAIL tests/example.test.ts > suite > fails\nAssertionError: Expected true to be false",
      "",
      1,
      false
    );

    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      command: "npm test",
      filePath: "tests/example.test.ts",
      testName: "suite > fails",
      message: "Expected true to be false"
    });
    expect(fingerprintMessage(" Expected  TRUE   to be false ")).toBe(
      "expected true to be false"
    );
  });

  it("marks timed out verification commands safely", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "memora-verify-timeout-"));
    const result = await runVerificationCommand({
      cwd,
      command: 'node -e "setTimeout(() => console.log(\"done\"), 1000)"',
      timeoutMs: 50
    });

    expect(result.timedOut).toBe(true);
    expect(result.failures[0]?.message).toBe("verification command timed out");
  });

  it("runs multiple commands and returns machine-readable results", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "memora-verify-run-"));
    await writeFile(path.join(cwd, "sample.txt"), "hello\n", "utf8");

    const result = await runVerification({
      cwd,
      commands: [
        'node -e "process.exit(0)"',
        'node -e \'console.log("FAIL tests/example.test.ts > suite > breaks"); console.log("Error: boom"); process.exit(1)\''
      ]
    });

    expect(result.status).toBe("failed");
    expect(result.commands).toHaveLength(2);
    expect(result.failures[0]).toMatchObject({
      filePath: "tests/example.test.ts",
      testName: "suite > breaks",
      message: "boom"
    });
  });
});
