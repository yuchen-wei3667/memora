import { describe, expect, it } from "vitest";

import { buildExplainOutput } from "../../src/trace/explain-service.js";

describe("explain service", () => {
  it("builds explain output sections from trace", () => {
    const explained = buildExplainOutput({
      runId: "run-1",
      repoId: "repo-1",
      repoRoot: "/tmp/repo",
      command: "memora run task",
      taskText: "run npm test",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      events: [
        {
          runId: "run-1",
          timestamp: "2026-01-01T00:00:00.000Z",
          sequence: 0,
          attempt: 1,
          state: "INIT",
          eventType: "run.started",
          payload: {
            provider: "openai-codex",
            model: "gpt-5-codex",
            taskText: "run npm test"
          }
        },
        {
          runId: "run-1",
          timestamp: "2026-01-01T00:00:00.000Z",
          sequence: 1,
          attempt: 1,
          state: "CONTEXT_READY",
          eventType: "state.changed",
          payload: {
            memoryContext: [{ content: "Use npm test" }]
          }
        },
        {
          runId: "run-1",
          timestamp: "2026-01-01T00:00:00.000Z",
          sequence: 2,
          attempt: 1,
          state: "CONTEXT_READY",
          eventType: "note.logged",
          payload: {
            selectedSkill: { skillId: "fix_failing_tests" }
          }
        },
        {
          runId: "run-1",
          timestamp: "2026-01-01T00:00:00.000Z",
          sequence: 3,
          attempt: 1,
          state: "RETRY_DECISION",
          eventType: "retry.decided",
          payload: {
            shouldRetry: false,
            reason: "max_attempts_reached"
          }
        },
        {
          runId: "run-1",
          timestamp: "2026-01-01T00:00:00.000Z",
          sequence: 4,
          attempt: 1,
          state: "VERIFYING",
          eventType: "verification.completed",
          payload: {
            status: "failed",
            failureCount: 1
          }
        }
      ]
    });

    expect(explained.objective).toBe("run npm test");
    expect(explained.provider).toBe("openai-codex");
    expect(explained.model).toBe("gpt-5-codex");
    expect(explained.selectedSkill).toBe("fix_failing_tests");
    expect(explained.memories).toEqual(["Use npm test"]);
    expect(explained.retries.length).toBe(1);
    expect(explained.verificationDelta).toContain("status=failed");
  });
});
