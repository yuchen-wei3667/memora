import {
  readRunTrace,
  traceStateSchema,
  type RunTrace,
  type TraceState
} from "./trace-writer.js";
import {
  closeDatabase,
  getLatestRunByRepoId,
  openDatabase
} from "../storage/db.js";
import { resolveMemoraHome } from "../config/loader.js";

export interface ReconstructedRunState {
  runId: string;
  repoId: string;
  command: string;
  taskText?: string;
  eventCount: number;
  attemptCount: number;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  currentState: TraceState;
  lastEventType?: string;
}

export const reconstructRunState = (trace: RunTrace): ReconstructedRunState => {
  const lastEvent = trace.events.at(-1);
  const currentState = lastEvent
    ? traceStateSchema.parse(lastEvent.state)
    : "INIT";
  const attemptCount = trace.events.reduce(
    (max, event) => Math.max(max, event.attempt),
    1
  );

  return {
    runId: trace.runId,
    repoId: trace.repoId,
    command: trace.command,
    taskText: trace.taskText,
    eventCount: trace.events.length,
    attemptCount,
    startedAt: trace.startedAt,
    updatedAt: trace.updatedAt,
    completedAt: trace.completedAt,
    currentState,
    lastEventType: lastEvent?.eventType
  };
};

export const readTraceSummary = async (
  tracePath: string
): Promise<ReconstructedRunState> => {
  const trace = await readRunTrace(tracePath);
  return reconstructRunState(trace);
};

export interface ExplainOutput {
  objective: string;
  provider: string;
  model: string;
  selectedSkill: string;
  memories: string[];
  tools: string[];
  retries: string[];
  verificationDelta: string;
}

export const buildExplainOutput = (trace: RunTrace): ExplainOutput => {
  const runStartedEvent = trace.events.find(
    (event) => event.eventType === "run.started"
  );
  const selectedSkillEvent = trace.events.find(
    (event) =>
      event.eventType === "note.logged" && "selectedSkill" in event.payload
  );
  const contextEvent = trace.events.find(
    (event) =>
      event.eventType === "state.changed" && event.state === "CONTEXT_READY"
  );
  const retries = trace.events
    .filter((event) => event.eventType === "retry.decided")
    .map((event) => {
      const reason =
        typeof event.payload.reason === "string"
          ? event.payload.reason
          : "unknown";
      const shouldRetry =
        typeof event.payload.shouldRetry === "boolean"
          ? String(event.payload.shouldRetry)
          : "unknown";
      return `attempt=${event.attempt} shouldRetry=${shouldRetry} reason=${reason}`;
    });
  const verification = [...trace.events]
    .reverse()
    .find((event) => event.eventType === "verification.completed");

  const memoryContext =
    (contextEvent?.payload.memoryContext as
      | Array<{ content: string }>
      | undefined) ?? [];

  const selectedSkill =
    (
      selectedSkillEvent?.payload.selectedSkill as
        | { skillId?: string }
        | undefined
    )?.skillId ?? "unknown";

  const verificationDelta = verification
    ? `status=${String(verification.payload.status)} failures=${String(verification.payload.failureCount ?? 0)}`
    : "no verification event";

  return {
    objective: trace.taskText ?? trace.command,
    provider: String(runStartedEvent?.payload.provider ?? "unknown"),
    model: String(runStartedEvent?.payload.model ?? "unknown"),
    selectedSkill,
    memories: memoryContext.map((item) => item.content),
    tools: [],
    retries,
    verificationDelta
  };
};

export const resolveExplainTrace = async (input: {
  memoraHome?: string;
  repoId: string;
  runId?: string;
}): Promise<RunTrace> => {
  const memoraHome = resolveMemoraHome(input.memoraHome);
  const db = openDatabase({ memoraHome });
  try {
    const resolvedRunId =
      input.runId ?? getLatestRunByRepoId(db, input.repoId)?.runId;
    if (!resolvedRunId) {
      throw new Error("No runs found for repository.");
    }

    const tracePath = `${memoraHome}/repos/${input.repoId}/runs/${resolvedRunId}.json`;
    return await readRunTrace(tracePath);
  } finally {
    closeDatabase(db);
  }
};

export const formatExplainOutput = (explained: ExplainOutput): string => {
  const lines = [
    `objective: ${explained.objective}`,
    `provider: ${explained.provider}`,
    `model: ${explained.model}`,
    `selected_skill: ${explained.selectedSkill}`,
    `memory_hits: ${explained.memories.length}`,
    `tools_used: ${explained.tools.length}`,
    `retry_events: ${explained.retries.length}`,
    `verification_delta: ${explained.verificationDelta}`
  ];

  if (explained.memories.length > 0) {
    lines.push("memories:");
    for (const memory of explained.memories) {
      lines.push(`- ${memory}`);
    }
  }

  if (explained.retries.length > 0) {
    lines.push("retries:");
    for (const retry of explained.retries) {
      lines.push(`- ${retry}`);
    }
  }

  return `${lines.join("\n")}\n`;
};
