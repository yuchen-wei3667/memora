import {
  readRunTrace,
  traceStateSchema,
  type RunTrace,
  type TraceState
} from "./trace-writer.js";

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
