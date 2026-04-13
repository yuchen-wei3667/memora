import { randomUUID } from "node:crypto";

import { type PlannedStep } from "../runtime/planner.js";

export interface ToolCandidate {
  name: string;
  description: string;
  script: string;
  language: "bash";
}

export const detectToolCandidate = (
  steps: PlannedStep[]
): ToolCandidate | null => {
  const shellSteps = steps.filter(
    (step) => step.type === "shell" && step.command
  );

  const commandFrequency = new Map<string, number>();
  for (const step of shellSteps) {
    const command = step.command!;
    commandFrequency.set(command, (commandFrequency.get(command) ?? 0) + 1);
  }

  const repeated = Array.from(commandFrequency.entries()).find(
    ([, count]) => count >= 2
  );

  if (!repeated) {
    return null;
  }

  const [command] = repeated;
  const baseName =
    command
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32)
      .toLowerCase() || "generated-tool";

  return {
    name: `${baseName}-${randomUUID().slice(0, 8)}`,
    description: `Generated from repeated command: ${command}`,
    language: "bash",
    script: `#!/usr/bin/env bash\nset -euo pipefail\n${command}\n`
  };
};
