import { describe, expect, it } from "vitest";

import { extractLearningFromTrace } from "../../src/reflection/learning-extractor.js";

describe("learning extractor", () => {
  it("extracts failure signatures and retry stop reason", () => {
    const extracted = extractLearningFromTrace({
      runId: "run-1",
      repoId: "repo-1",
      repoRoot: "/tmp/repo",
      command: 'memora run "run npm test"',
      taskText: "run npm test",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      events: [
        {
          runId: "run-1",
          timestamp: "2026-01-01T00:00:00.000Z",
          sequence: 0,
          attempt: 1,
          state: "VERIFYING",
          eventType: "verification.completed",
          payload: {
            failureSignatures: ["sig-a", "sig-b"]
          }
        },
        {
          runId: "run-1",
          timestamp: "2026-01-01T00:00:00.000Z",
          sequence: 1,
          attempt: 1,
          state: "RETRY_DECISION",
          eventType: "retry.decided",
          payload: {
            reason: "no_progress"
          }
        },
        {
          runId: "run-1",
          timestamp: "2026-01-01T00:00:00.000Z",
          sequence: 2,
          attempt: 1,
          state: "DONE",
          eventType: "run.completed",
          payload: {
            success: false,
            summary: "Run stopped"
          }
        }
      ]
    });

    expect(extracted.failureSignatures).toEqual(["sig-a", "sig-b"]);
    expect(extracted.retryStopReason).toBe("no_progress");
  });
});
