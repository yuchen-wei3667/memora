import { spawn } from "node:child_process";

import { recordToolExecution } from "./tool-registry.js";

export interface ToolExecutionResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export const executeRegisteredTool = async (input: {
  memoraHome: string;
  repoId: string;
  toolId: string;
  toolPath: string;
  cwd: string;
}): Promise<ToolExecutionResult> => {
  const result = await new Promise<ToolExecutionResult>((resolve, reject) => {
    const child = spawn("/usr/bin/bash", ["-lc", input.toolPath], {
      cwd: input.cwd,
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

  recordToolExecution({
    memoraHome: input.memoraHome,
    repoId: input.repoId,
    toolId: input.toolId,
    success: result.exitCode === 0
  });

  return result;
};
