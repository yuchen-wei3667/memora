import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

import {
  runVerification,
  type VerificationRunResult
} from "../verify/verify-service.js";

import { type RunTaskContext } from "./context-builder.js";
import { type PlannedStep } from "./planner.js";

export interface StepExecutionResult {
  step: PlannedStep;
  status: "completed" | "failed";
  output: Record<string, unknown>;
}

const runShellCommand = async (
  cwd: string,
  command: string
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> => {
  return await new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/bash", ["-lc", command], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
};

export const executePlannedStep = async (
  context: RunTaskContext,
  step: PlannedStep
): Promise<StepExecutionResult> => {
  if (step.type === "read") {
    const content = await readFile(step.filePath!, "utf8");
    return {
      step,
      status: "completed",
      output: { filePath: step.filePath, content }
    };
  }

  if (step.type === "edit") {
    const current = await readFile(step.filePath!, "utf8");

    let next = current;
    if (step.operation === "append") {
      const suffix = current.endsWith("\n") ? "" : "\n";
      next = `${current}${suffix}${step.appendText ?? ""}\n`;
    } else if (step.operation === "replace") {
      next = current.replace(step.replaceFrom ?? "", step.replaceTo ?? "");
    }

    await writeFile(step.filePath!, next, "utf8");
    return {
      step,
      status: "completed",
      output: { filePath: step.filePath, changed: current !== next }
    };
  }

  if (step.type === "shell") {
    const result = await runShellCommand(context.repoRoot, step.command!);
    if (result.exitCode !== 0) {
      return {
        step,
        status: "failed",
        output: result
      };
    }

    return {
      step,
      status: "completed",
      output: result
    };
  }

  if (step.type === "verify") {
    const verification = await runVerification({
      cwd: context.repoRoot,
      commands: context.verificationCommands
    });

    return {
      step,
      status: verification.status === "passed" ? "completed" : "failed",
      output: { verification }
    };
  }

  throw new Error(`Unsupported step type: ${String(step.type)}`);
};

export const getVerificationFromStepResult = (
  result: StepExecutionResult
): VerificationRunResult | null => {
  return (
    (result.output.verification as VerificationRunResult | undefined) ?? null
  );
};
