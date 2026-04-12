import { spawn } from "node:child_process";

import { type FailureSignature } from "./result-diff.js";

export interface VerificationCommandInput {
  command: string;
  cwd: string;
  timeoutMs?: number;
}

export interface VerificationCommandResult {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  failures: FailureSignature[];
}

export interface VerificationRunResult {
  status: "passed" | "failed" | "timed_out";
  commands: VerificationCommandResult[];
  failures: FailureSignature[];
}

const normalizeWhitespace = (value: string): string => {
  return value.trim().replace(/\s+/g, " ");
};

export const fingerprintMessage = (message: string): string => {
  return normalizeWhitespace(message).toLowerCase();
};

export const createFailureSignature = (input: {
  command: string;
  message: string;
  filePath?: string;
  testName?: string;
}): FailureSignature => {
  const normalizedMessage = normalizeWhitespace(input.message);
  const fingerprint = fingerprintMessage(normalizedMessage);
  const location = [
    input.filePath ?? "unknown-file",
    input.testName ?? "unknown-test"
  ].join("::");

  return {
    command: input.command,
    filePath: input.filePath,
    testName: input.testName,
    message: normalizedMessage,
    fingerprint,
    signature: `${input.command}::${location}::${fingerprint}`
  };
};

const parseStructuredFailures = (
  command: string,
  output: string
): FailureSignature[] => {
  const lines = output.split(/\r?\n/);
  const failures: FailureSignature[] = [];
  let currentFilePath: string | undefined;
  let currentTestName: string | undefined;

  for (const line of lines) {
    const failMatch = line.match(/^\s*(?:FAIL|✖)\s+(.+?)(?:\s+>\s+(.+))?\s*$/);
    if (failMatch) {
      currentFilePath = failMatch[1]?.trim() || undefined;
      currentTestName = failMatch[2]?.trim() || undefined;
      continue;
    }

    const messageMatch = line.match(
      /^\s*(?:AssertionError|TypeError|ReferenceError|Error):\s+(.+)$/
    );
    if (messageMatch) {
      failures.push(
        createFailureSignature({
          command,
          filePath: currentFilePath,
          testName: currentTestName,
          message: messageMatch[1]
        })
      );
    }
  }

  return failures;
};

export const parseVerificationFailures = (
  command: string,
  stdout: string,
  stderr: string,
  exitCode: number | null,
  timedOut: boolean
): FailureSignature[] => {
  if (timedOut) {
    return [
      createFailureSignature({
        command,
        message: "verification command timed out"
      })
    ];
  }

  if (exitCode === 0) {
    return [];
  }

  const combined = [stdout, stderr].filter(Boolean).join("\n");
  const structured = parseStructuredFailures(command, combined);
  if (structured.length > 0) {
    return structured;
  }

  const fallbackLine = combined
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return [
    createFailureSignature({
      command,
      message:
        fallbackLine ?? `command failed with exit code ${String(exitCode)}`
    })
  ];
};

export const runVerificationCommand = async (
  input: VerificationCommandInput
): Promise<VerificationCommandResult> => {
  const startedAt = Date.now();

  return await new Promise<VerificationCommandResult>((resolve, reject) => {
    const child = spawn("/usr/bin/bash", ["-lc", input.command], {
      cwd: input.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, input.timeoutMs ?? 900_000);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });

    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      if (settled) {
        return;
      }
      settled = true;

      const durationMs = Date.now() - startedAt;
      resolve({
        command: input.command,
        exitCode,
        stdout,
        stderr,
        durationMs,
        timedOut,
        failures: parseVerificationFailures(
          input.command,
          stdout,
          stderr,
          exitCode,
          timedOut
        )
      });
    });
  });
};

export const runVerification = async (input: {
  cwd: string;
  commands: string[];
  timeoutMs?: number;
}): Promise<VerificationRunResult> => {
  const results: VerificationCommandResult[] = [];

  for (const command of input.commands) {
    const result = await runVerificationCommand({
      command,
      cwd: input.cwd,
      timeoutMs: input.timeoutMs
    });
    results.push(result);

    if (result.timedOut) {
      return {
        status: "timed_out",
        commands: results,
        failures: results.flatMap((item) => item.failures)
      };
    }
  }

  const failures = results.flatMap((result) => result.failures);
  return {
    status: failures.length > 0 ? "failed" : "passed",
    commands: results,
    failures
  };
};
