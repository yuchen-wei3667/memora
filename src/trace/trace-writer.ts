import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { z } from "zod";

import { resolveMemoraHome } from "../config/loader.js";

export const traceStateSchema = z.enum([
  "INIT",
  "CONTEXT_READY",
  "PLAN_READY",
  "EXECUTING",
  "VERIFYING",
  "RETRY_DECISION",
  "REFLECTING",
  "DONE"
]);

export const traceEventTypeSchema = z.enum([
  "run.started",
  "state.changed",
  "step.started",
  "step.completed",
  "step.failed",
  "verification.completed",
  "retry.decided",
  "run.completed",
  "note.logged"
]);

export const traceEventSchema = z.object({
  runId: z.string().min(1),
  timestamp: z.string().datetime({ offset: true }),
  sequence: z.number().int().nonnegative(),
  attempt: z.number().int().min(1),
  state: traceStateSchema,
  eventType: traceEventTypeSchema,
  payload: z.record(z.string(), z.unknown())
});

export const runTraceSchema = z.object({
  runId: z.string().min(1),
  repoId: z.string().min(1),
  repoRoot: z.string().min(1),
  command: z.string().min(1),
  taskText: z.string().min(1).optional(),
  startedAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }).optional(),
  events: z.array(traceEventSchema)
});

export type TraceState = z.infer<typeof traceStateSchema>;
export type TraceEventType = z.infer<typeof traceEventTypeSchema>;
export type TraceEvent = z.infer<typeof traceEventSchema>;
export type RunTrace = z.infer<typeof runTraceSchema>;

export interface CreateTraceWriterOptions {
  memoraHome?: string;
  repoId: string;
  repoRoot: string;
  command: string;
  taskText?: string;
  runId?: string;
  startedAt?: string;
}

export interface AppendTraceEventInput {
  attempt?: number;
  state: TraceState;
  eventType: TraceEventType;
  payload?: Record<string, unknown>;
  timestamp?: string;
}

const withNewline = (value: string): string => {
  return value.endsWith("\n") ? value : `${value}\n`;
};

export const getRunTracePath = (
  repoId: string,
  runId: string,
  memoraHome?: string
): string => {
  return path.join(
    resolveMemoraHome(memoraHome),
    "repos",
    repoId,
    "runs",
    `${runId}.json`
  );
};

export const readRunTrace = async (tracePath: string): Promise<RunTrace> => {
  const raw = await readFile(tracePath, "utf8");
  return runTraceSchema.parse(JSON.parse(raw));
};

const writeRunTrace = async (
  tracePath: string,
  trace: RunTrace
): Promise<void> => {
  await mkdir(path.dirname(tracePath), { recursive: true });
  await writeFile(
    tracePath,
    withNewline(JSON.stringify(trace, null, 2)),
    "utf8"
  );
};

export class TraceWriter {
  private trace: RunTrace;

  readonly tracePath: string;

  constructor(options: CreateTraceWriterOptions) {
    const startedAt = options.startedAt ?? new Date().toISOString();
    const runId = options.runId ?? randomUUID();

    this.trace = runTraceSchema.parse({
      runId,
      repoId: options.repoId,
      repoRoot: options.repoRoot,
      command: options.command,
      taskText: options.taskText,
      startedAt,
      updatedAt: startedAt,
      events: []
    });
    this.tracePath = getRunTracePath(options.repoId, runId, options.memoraHome);
  }

  async initialize(): Promise<RunTrace> {
    await writeRunTrace(this.tracePath, this.trace);
    return this.getTrace();
  }

  async appendEvent(input: AppendTraceEventInput): Promise<TraceEvent> {
    const timestamp = input.timestamp ?? new Date().toISOString();
    const nextEvent = traceEventSchema.parse({
      runId: this.trace.runId,
      timestamp,
      sequence: this.trace.events.length,
      attempt: input.attempt ?? 1,
      state: input.state,
      eventType: input.eventType,
      payload: input.payload ?? {}
    });

    this.trace.events.push(nextEvent);
    this.trace.updatedAt = timestamp;

    if (nextEvent.eventType === "run.completed") {
      this.trace.completedAt = timestamp;
    }

    await writeRunTrace(this.tracePath, this.trace);
    return nextEvent;
  }

  getTrace(): RunTrace {
    return runTraceSchema.parse(this.trace);
  }
}

export const createTraceWriter = async (
  options: CreateTraceWriterOptions
): Promise<TraceWriter> => {
  const writer = new TraceWriter(options);
  await writer.initialize();
  return writer;
};
