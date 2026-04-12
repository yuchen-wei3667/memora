import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  readTraceSummary,
  reconstructRunState
} from "../../src/trace/explain-service.js";
import {
  createTraceWriter,
  getRunTracePath,
  readRunTrace,
  traceEventSchema
} from "../../src/trace/trace-writer.js";

describe("trace writer", () => {
  it("validates trace events with the schema", () => {
    const parsed = traceEventSchema.parse({
      runId: "run-1",
      timestamp: "2026-01-01T00:00:00.000Z",
      sequence: 0,
      attempt: 1,
      state: "INIT",
      eventType: "run.started",
      payload: { source: "test" }
    });

    expect(parsed.eventType).toBe("run.started");
  });

  it("creates a trace file with ordered events and reconstructs run state", async () => {
    const memoraHome = await mkdtemp(path.join(os.tmpdir(), "memora-trace-"));
    const writer = await createTraceWriter({
      memoraHome,
      repoId: "repo-1",
      repoRoot: "/tmp/repo-1",
      runId: "run-1",
      command: 'memora run "fix tests"',
      taskText: "fix tests",
      startedAt: "2026-01-01T00:00:00.000Z"
    });

    await writer.appendEvent({
      state: "INIT",
      eventType: "run.started",
      payload: { source: "test" },
      timestamp: "2026-01-01T00:00:00.000Z"
    });
    await writer.appendEvent({
      state: "PLAN_READY",
      eventType: "state.changed",
      payload: { from: "INIT", to: "PLAN_READY" },
      timestamp: "2026-01-01T00:00:01.000Z"
    });
    await writer.appendEvent({
      state: "EXECUTING",
      eventType: "step.completed",
      payload: { stepType: "read" },
      timestamp: "2026-01-01T00:00:02.000Z"
    });
    await writer.appendEvent({
      state: "DONE",
      eventType: "run.completed",
      payload: { status: "success" },
      timestamp: "2026-01-01T00:00:03.000Z"
    });

    const tracePath = getRunTracePath("repo-1", "run-1", memoraHome);
    const trace = await readRunTrace(tracePath);

    expect(trace.events.map((event) => event.sequence)).toEqual([0, 1, 2, 3]);
    expect(trace.events.map((event) => event.eventType)).toEqual([
      "run.started",
      "state.changed",
      "step.completed",
      "run.completed"
    ]);
    expect(trace.completedAt).toBe("2026-01-01T00:00:03.000Z");

    const summary = reconstructRunState(trace);
    expect(summary).toMatchObject({
      runId: "run-1",
      repoId: "repo-1",
      command: 'memora run "fix tests"',
      taskText: "fix tests",
      eventCount: 4,
      attemptCount: 1,
      currentState: "DONE",
      lastEventType: "run.completed"
    });

    const readbackSummary = await readTraceSummary(tracePath);
    expect(readbackSummary).toEqual(summary);
  });
});
