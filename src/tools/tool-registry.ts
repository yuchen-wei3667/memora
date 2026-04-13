import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  closeDatabase,
  insertTool,
  listToolsByRepoId,
  openDatabase,
  getRunById,
  updateToolStats,
  upsertRepo,
  type ToolApprovalState,
  type ToolRecord
} from "../storage/db.js";

export interface RegisterToolInput {
  memoraHome: string;
  repoId: string;
  repoRoot: string;
  runId: string;
  name: string;
  description: string;
  language: "bash";
  script: string;
  approvalState: ToolApprovalState;
}

const nowIso = (): string => new Date().toISOString();

export const registerTool = async (
  input: RegisterToolInput
): Promise<ToolRecord> => {
  const toolId = randomUUID();
  const repoToolsDir = path.join(
    input.memoraHome,
    "repos",
    input.repoId,
    "tools"
  );
  await mkdir(repoToolsDir, { recursive: true });
  const extension = input.language === "bash" ? "sh" : "txt";
  const filePath = path.join(repoToolsDir, `${toolId}.${extension}`);
  await writeFile(filePath, input.script, { encoding: "utf8", mode: 0o755 });

  const db = openDatabase({ memoraHome: input.memoraHome });
  try {
    const timestamp = nowIso();
    upsertRepo(db, {
      repoId: input.repoId,
      repoRoot: input.repoRoot,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    const createdByRunId = getRunById(db, input.repoId, input.runId)
      ? input.runId
      : null;

    return insertTool(db, input.repoId, {
      toolId,
      name: input.name,
      description: input.description,
      path: filePath,
      language: input.language,
      approvalState: input.approvalState,
      createdByRunId,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  } finally {
    closeDatabase(db);
  }
};

export const listTools = (input: {
  memoraHome: string;
  repoId: string;
}): ToolRecord[] => {
  const db = openDatabase({ memoraHome: input.memoraHome });
  try {
    return listToolsByRepoId(db, input.repoId);
  } finally {
    closeDatabase(db);
  }
};

export const recordToolExecution = (input: {
  memoraHome: string;
  repoId: string;
  toolId: string;
  success: boolean;
}): ToolRecord => {
  const db = openDatabase({ memoraHome: input.memoraHome });
  try {
    const tools = listToolsByRepoId(db, input.repoId);
    const existing = tools.find((tool) => tool.toolId === input.toolId);
    if (!existing) {
      throw new Error(`Tool not found: ${input.toolId}`);
    }

    return updateToolStats(db, input.repoId, input.toolId, {
      successCount: input.success
        ? existing.successCount + 1
        : existing.successCount,
      failureCount: input.success
        ? existing.failureCount
        : existing.failureCount + 1,
      updatedAt: nowIso()
    });
  } finally {
    closeDatabase(db);
  }
};
