import path from "node:path";

import { type RunTaskContext } from "./context-builder.js";

export type PlannedStepType = "read" | "edit" | "shell" | "verify";

export interface PlannedStep {
  type: PlannedStepType;
  description: string;
  filePath?: string;
  operation?: "append" | "replace";
  appendText?: string;
  replaceFrom?: string;
  replaceTo?: string;
  command?: string;
}

export interface ExecutionPlan {
  steps: PlannedStep[];
}

const parseAppendTask = (
  taskText: string
): { filePath: string; appendText: string } | null => {
  const match = taskText.match(/^append\s+["'](.+)["']\s+to\s+(.+)$/i);
  if (!match) {
    return null;
  }

  return {
    appendText: match[1],
    filePath: match[2].trim()
  };
};

const parseReplaceTask = (
  taskText: string
): { filePath: string; replaceFrom: string; replaceTo: string } | null => {
  const match = taskText.match(
    /^replace\s+["'](.+)["']\s+with\s+["'](.+)["']\s+in\s+(.+)$/i
  );
  if (!match) {
    return null;
  }

  return {
    replaceFrom: match[1],
    replaceTo: match[2],
    filePath: match[3].trim()
  };
};

const parseShellTask = (taskText: string): string | null => {
  const match = taskText.match(/^run\s+(.+)$/i);
  return match ? match[1].trim() : null;
};

export const createExecutionPlan = (context: RunTaskContext): ExecutionPlan => {
  const appendTask = parseAppendTask(context.taskText);
  if (appendTask) {
    const absolutePath = path.join(context.repoRoot, appendTask.filePath);
    return {
      steps: [
        {
          type: "read",
          description: `Read ${appendTask.filePath}`,
          filePath: absolutePath
        },
        {
          type: "edit",
          description: `Append text to ${appendTask.filePath}`,
          filePath: absolutePath,
          operation: "append",
          appendText: appendTask.appendText
        },
        {
          type: "verify",
          description: "Run verification commands"
        }
      ]
    };
  }

  const replaceTask = parseReplaceTask(context.taskText);
  if (replaceTask) {
    const absolutePath = path.join(context.repoRoot, replaceTask.filePath);
    return {
      steps: [
        {
          type: "read",
          description: `Read ${replaceTask.filePath}`,
          filePath: absolutePath
        },
        {
          type: "edit",
          description: `Replace text in ${replaceTask.filePath}`,
          filePath: absolutePath,
          operation: "replace",
          replaceFrom: replaceTask.replaceFrom,
          replaceTo: replaceTask.replaceTo
        },
        {
          type: "verify",
          description: "Run verification commands"
        }
      ]
    };
  }

  const shellCommand = parseShellTask(context.taskText);
  if (shellCommand) {
    return {
      steps: [
        {
          type: "shell",
          description: `Run shell command: ${shellCommand}`,
          command: shellCommand
        },
        {
          type: "verify",
          description: "Run verification commands"
        }
      ]
    };
  }

  throw new Error(
    'Unsupported task format. Use `append "text" to path`, `replace "from" with "to" in path`, or `run <command>`.'
  );
};
