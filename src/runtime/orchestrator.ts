import {
  closeDatabase,
  openDatabase,
  upsertRepo,
  insertRun
} from "../storage/db.js";
import { createSkillRunMetadata } from "../skills/runner.js";
import { selectSkill } from "../skills/selector.js";
import { createTraceWriter } from "../trace/trace-writer.js";

import { buildRunContext } from "./context-builder.js";
import {
  executePlannedStep,
  getVerificationFromStepResult
} from "./executor.js";
import { createExecutionPlan } from "./planner.js";

export interface RunTaskOptions {
  taskText: string;
  memoraHome: string;
  cwd?: string;
}

export interface RunTaskResult {
  runId: string;
  tracePath: string;
  success: boolean;
  summary: string;
}

export const runTask = async (
  options: RunTaskOptions
): Promise<RunTaskResult> => {
  const context = await buildRunContext(options);
  const traceWriter = await createTraceWriter({
    memoraHome: options.memoraHome,
    repoId: context.repoId,
    repoRoot: context.repoRoot,
    command: `memora run ${JSON.stringify(options.taskText)}`,
    taskText: options.taskText
  });

  await traceWriter.appendEvent({
    state: "INIT",
    eventType: "run.started",
    payload: { taskText: options.taskText }
  });
  await traceWriter.appendEvent({
    state: "CONTEXT_READY",
    eventType: "state.changed",
    payload: {
      verificationCommands: context.verificationCommands,
      memoryContext: context.memoryContext
    }
  });

  const selectedSkill = selectSkill({
    taskText: options.taskText,
    repoSignals: [
      ...context.verificationCommands,
      ...context.memoryContext.map((item) => item.content)
    ]
  });
  await traceWriter.appendEvent({
    state: "CONTEXT_READY",
    eventType: "note.logged",
    payload: {
      selectedSkill: createSkillRunMetadata(selectedSkill.skill),
      score: selectedSkill.score,
      fallbackUsed: selectedSkill.fallbackUsed,
      reason: selectedSkill.reason
    }
  });

  const plan = createExecutionPlan(context);
  await traceWriter.appendEvent({
    state: "PLAN_READY",
    eventType: "state.changed",
    payload: {
      steps: plan.steps.map((step) => ({
        type: step.type,
        description: step.description
      }))
    }
  });

  let success = true;
  let summary = "Task completed successfully.";

  for (const step of plan.steps) {
    const state = step.type === "verify" ? "VERIFYING" : "EXECUTING";
    await traceWriter.appendEvent({
      state,
      eventType: "step.started",
      payload: { type: step.type, description: step.description }
    });

    const result = await executePlannedStep(context, step);
    const verification = getVerificationFromStepResult(result);

    if (verification) {
      await traceWriter.appendEvent({
        state: "VERIFYING",
        eventType: "verification.completed",
        payload: {
          status: verification.status,
          failureCount: verification.failures.length
        }
      });
    }

    await traceWriter.appendEvent({
      state,
      eventType:
        result.status === "completed" ? "step.completed" : "step.failed",
      payload: { type: step.type, output: result.output }
    });

    if (result.status === "failed") {
      success = false;
      summary =
        step.type === "verify"
          ? "Verification failed."
          : `Step failed: ${step.description}`;
      break;
    }
  }

  await traceWriter.appendEvent({
    state: "DONE",
    eventType: "run.completed",
    payload: { success, summary }
  });

  const db = openDatabase({ memoraHome: options.memoraHome });
  try {
    const now = new Date().toISOString();
    upsertRepo(db, {
      repoId: context.repoId,
      repoRoot: context.repoRoot,
      createdAt: now,
      updatedAt: now
    });
    insertRun(db, context.repoId, {
      runId: traceWriter.getTrace().runId,
      command: `memora run ${JSON.stringify(options.taskText)}`,
      taskText: options.taskText,
      status: success ? "success" : "failed",
      attemptCount: 1,
      selectedSkill: selectedSkill.skill.id,
      summary,
      startedAt: traceWriter.getTrace().startedAt,
      endedAt: traceWriter.getTrace().completedAt ?? new Date().toISOString()
    });
  } finally {
    closeDatabase(db);
  }

  return {
    runId: traceWriter.getTrace().runId,
    tracePath: traceWriter.tracePath,
    success,
    summary
  };
};
