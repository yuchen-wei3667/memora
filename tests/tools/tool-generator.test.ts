import { describe, expect, it } from "vitest";

import { detectToolCandidate } from "../../src/tools/tool-generator.js";

describe("tool candidate detection", () => {
  it("creates candidate when shell command repeats", () => {
    const candidate = detectToolCandidate([
      {
        type: "shell",
        description: "first",
        command: "npm test"
      },
      {
        type: "shell",
        description: "second",
        command: "npm test"
      }
    ]);

    expect(candidate).not.toBeNull();
    expect(candidate?.script).toContain("npm test");
  });

  it("does not create candidate when no repetition exists", () => {
    const candidate = detectToolCandidate([
      {
        type: "shell",
        description: "first",
        command: "npm test"
      },
      {
        type: "shell",
        description: "second",
        command: "npm run lint"
      }
    ]);

    expect(candidate).toBeNull();
  });
});
