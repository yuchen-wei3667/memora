import { similarityScore } from "./dedupe.js";
import { MemoryService, type MemoryRecord } from "./memory-service.js";

export interface RetrievedMemory {
  memory: MemoryRecord;
  score: number;
}

const recencyBoost = (createdAt: string): number => {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const ageDays = Math.max(0, ageMs / dayMs);
  return Math.max(0, 1 - ageDays / 365);
};

const categoryPrior = (category: string): number => {
  switch (category) {
    case "workflow":
      return 0.15;
    case "bugfix":
      return 0.2;
    default:
      return 0.1;
  }
};

export const retrieveMemories = async (input: {
  service: MemoryService;
  query: string;
  limit?: number;
}): Promise<RetrievedMemory[]> => {
  const all = await input.service.list();

  const scored = all.map((memory) => {
    const semantic = similarityScore(input.query, memory.content);
    const score =
      semantic * 0.6 +
      memory.score * 0.2 +
      memory.confidence * 0.1 +
      recencyBoost(memory.createdAt) * 0.05 +
      categoryPrior(memory.category) * 0.05;
    return { memory, score };
  });

  scored.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.memory.memoryId.localeCompare(right.memory.memoryId);
  });

  return scored.slice(0, input.limit ?? 8);
};
