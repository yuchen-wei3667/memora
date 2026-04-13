import {
  closeDatabase,
  openDatabase,
  upsertRepo,
  insertRun
} from "../storage/db.js";
import { loadConfig } from "../config/loader.js";
import { reflectRun } from "../reflection/reflector.js";
import { createSkillRunMetadata } from "../skills/runner.js";
import { getSkillById } from "../skills/registry.js";
import { selectSkill } from "../skills/selector.js";
import { createTraceWriter } from "../trace/trace-writer.js";
import {
  diffVerificationFailures,
  type VerificationDiff
} from "../verify/result-diff.js";
import { runVerification } from "../verify/verify-service.js";
import { evaluateSafetyPolicy } from "../tools/safety-policy.js";
import { detectToolCandidate } from "../tools/tool-generator.js";
import { registerTool } from "../tools/tool-registry.js";

import { buildRunContext } from "./context-builder.js";
import { decideRetry } from "./retry-policy.js";
import {
  executePlannedStep,
  getVerificationFromStepResult
} from "./executor.js";
import { createExecutionPlan } from "./planner.js";

export interface RunTaskOptions {
  taskText: string;
  memoraHome: string;
  cwd?: string;
  mode?: "run" | "fix";
  maxAttempts?: number;
  forceSkillId?:
    | "fix_failing_tests"
    | "implement_feature_safely"
    | "refactor_preserve_behavior"
    | "generic_implementation";
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
  const loadedConfig = await loadConfig({
    memoraHome: options.memoraHome,
    createIfMissing: true
  });
  const context = await buildRunContext(options);
  const maxAttempts =
    options.maxAttempts ??
    (options.mode === "fix" ? loadedConfig.config.retry.maxAttempts : 1);
  const noProgressAbort = loadedConfig.config.retry.noProgressAbort;

  const baselineVerification = loadedConfig.config.verification
    .runBaselineBeforeEdit
    ? await runVerification({
        cwd: context.repoRoot,
        commands: context.verificationCommands,
        timeoutMs: loadedConfig.config.verification.defaultTimeoutSec * 1000
      })
    : {
        status: "passed" as const,
        commands: [],
        failures: []
      };

  const traceWriter = await createTraceWriter({
    memoraHome: options.memoraHome,
    repoId: context.repoId,
    repoRoot: context.repoRoot,
    command: `memora ${options.mode ?? "run"} ${JSON.stringify(options.taskText)}`,
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
      memoryContext: context.memoryContext,
      baselineFailureCount: baselineVerification.failures.length
    }
  });

  const selectedSkill =
    options.forceSkillId && getSkillById(options.forceSkillId)
      ? {
          skill: getSkillById(options.forceSkillId)!,
          score: {
            triggerMatch: 1,
            historicalSuccess: 0.5,
            repoFit: 0.5,
            recencyBoost: 0.5,
            final: 0.75
          },
          fallbackUsed: false,
          reason: "forced by command"
        }
      : selectSkill({
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
  let attempt = 1;
  let noProgressCount = 0;
  let stopReason = "verification_passed";
  let lastDiff: VerificationDiff | null = null;
  const executedSteps = [] as typeof plan.steps;

  while (attempt <= maxAttempts) {
    let attemptFailed = false;
    let attemptVerificationPassed = true;

    for (const step of plan.steps) {
      const state = step.type === "verify" ? "VERIFYING" : "EXECUTING";
      await traceWriter.appendEvent({
        state,
        attempt,
        eventType: "step.started",
        payload: { type: step.type, description: step.description }
      });

      const result = await executePlannedStep(context, step);
      if (step.type === "shell") {
        executedSteps.push(step);
      }
      const verification = getVerificationFromStepResult(result);

      if (verification) {
        lastDiff = diffVerificationFailures(
          baselineVerification.failures,
          verification.failures
        );
        attemptVerificationPassed = verification.status === "passed";

        await traceWriter.appendEvent({
          state: "VERIFYING",
          attempt,
          eventType: "verification.completed",
          payload: {
            status: verification.status,
            failureCount: verification.failures.length,
            failureSignatures: verification.failures.map(
              (failure) => failure.signature
            ),
            introduced: lastDiff.introduced.length,
            resolved: lastDiff.resolved.length,
            preExisting: lastDiff.preExisting.length
          }
        });
      }

      await traceWriter.appendEvent({
        state,
        attempt,
        eventType:
          result.status === "completed" ? "step.completed" : "step.failed",
        payload: { type: step.type, output: result.output }
      });

      if (result.status === "failed") {
        attemptFailed = true;
        summary =
          step.type === "verify"
            ? "Verification failed."
            : `Step failed: ${step.description}`;
        break;
      }
    }

    if (!attemptFailed) {
      success = true;
      stopReason = "verification_passed";
      break;
    }

    success = false;
    const decision = decideRetry({
      attempt,
      maxAttempts,
      noProgressAbort,
      diff: lastDiff,
      verificationPassed: attemptVerificationPassed,
      previousNoProgressCount: noProgressCount
    });
    noProgressCount = decision.noProgressCount;
    stopReason = decision.reason;

    await traceWriter.appendEvent({
      state: "RETRY_DECISION",
      attempt,
      eventType: "retry.decided",
      payload: {
        shouldRetry: decision.shouldRetry,
        reason: decision.reason,
        noProgressCount: decision.noProgressCount,
        nextAttempt: decision.nextAttempt
      }
    });

    if (!decision.shouldRetry) {
      if (options.mode === "fix") {
        summary = `Run stopped: ${decision.reason}`;
      }
      break;
    }

    attempt = decision.nextAttempt;
  }

  await traceWriter.appendEvent({
    state: "REFLECTING",
    eventType: "state.changed",
    payload: { stopReason }
  });

  const reflection = await reflectRun({
    memoraHome: options.memoraHome,
    repoId: context.repoId,
    repoRoot: context.repoRoot,
    trace: traceWriter.getTrace(),
    selectedSkillId: selectedSkill.skill.id,
    selectedSkillName: selectedSkill.skill.name,
    selectedSkillVersion: selectedSkill.skill.version,
    runSuccess: success,
    runSummary: summary
  });

  const toolCandidate = detectToolCandidate(executedSteps);
  if (toolCandidate) {
    const safety = evaluateSafetyPolicy({
      scriptContent: toolCandidate.script,
      allowNetwork: loadedConfig.config.safety.allowNetworkInGeneratedTools
    });
    if (safety.allowed) {
      const registered = await registerTool({
        memoraHome: options.memoraHome,
        repoId: context.repoId,
        repoRoot: context.repoRoot,
        runId: traceWriter.getTrace().runId,
        name: toolCandidate.name,
        description: toolCandidate.description,
        language: toolCandidate.language,
        script: toolCandidate.script,
        approvalState: loadedConfig.config.safety.requireToolApproval
          ? "pending"
          : "auto"
      });
      await traceWriter.appendEvent({
        state: "REFLECTING",
        eventType: "note.logged",
        payload: {
          toolGenerated: true,
          toolId: registered.toolId,
          toolPath: registered.path
        }
      });
    } else {
      await traceWriter.appendEvent({
        state: "REFLECTING",
        eventType: "note.logged",
        payload: {
          toolGenerated: false,
          blockedBySafetyPolicy: true,
          reasons: safety.reasons
        }
      });
    }
  }

  await traceWriter.appendEvent({
    state: "REFLECTING",
    eventType: "note.logged",
    payload: {
      reflection
    }
  });

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
      command: `memora ${options.mode ?? "run"} ${JSON.stringify(options.taskText)}`,
      taskText: options.taskText,
      status: success ? "success" : "failed",
      attemptCount: attempt,
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
