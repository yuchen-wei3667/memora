import { randomUUID } from "node:crypto";

import {
  closeDatabase,
  openDatabase,
  upsertFailurePattern,
  upsertSkillMetric
} from "../storage/db.js";
import { type RunTrace } from "../trace/trace-writer.js";
import { MemoryService } from "../memory/memory-service.js";

import { extractLearningFromTrace } from "./learning-extractor.js";

export interface ReflectionResult {
  persistedMemories: number;
  persistedFailurePatterns: number;
  skillMetricUpdated: boolean;
}

export const reflectRun = async (input: {
  memoraHome: string;
  repoId: string;
  repoRoot: string;
  trace: RunTrace;
  selectedSkillId: string;
  selectedSkillName: string;
  selectedSkillVersion: string;
  runSuccess: boolean;
  runSummary: string;
}): Promise<ReflectionResult> => {
  const extracted = extractLearningFromTrace(input.trace);

  const memoryService = new MemoryService({
    memoraHome: input.memoraHome,
    repoId: input.repoId,
    repoRoot: input.repoRoot
  });

  let persistedMemories = 0;
  const memoryCandidates = [...extracted.memories];
  if (input.runSuccess && input.runSummary.length >= 12) {
    memoryCandidates.push({
      category: "learning",
      content: input.runSummary,
      score: 0.75,
      confidence: 0.7
    });
  }

  for (const memory of memoryCandidates) {
    if (memory.content.length < 12) {
      continue;
    }

    await memoryService.add({
      category: memory.category,
      content: memory.content,
      score: memory.score,
      confidence: memory.confidence
    });
    persistedMemories += 1;
  }

  const db = openDatabase({ memoraHome: input.memoraHome });
  try {
    const now = new Date().toISOString();
    for (const signature of extracted.failureSignatures) {
      upsertFailurePattern(db, input.repoId, {
        patternId: randomUUID(),
        signature,
        contextJson: JSON.stringify({ runId: input.trace.runId }),
        lastSeenAt: now
      });
    }

    upsertSkillMetric(db, {
      skillId: input.selectedSkillId,
      name: input.selectedSkillName,
      version: input.selectedSkillVersion,
      successDelta: input.runSuccess ? 1 : 0,
      failureDelta: input.runSuccess ? 0 : 1,
      updatedAt: now
    });
  } finally {
    closeDatabase(db);
  }

  return {
    persistedMemories,
    persistedFailurePatterns: extracted.failureSignatures.length,
    skillMetricUpdated: true
  };
};
