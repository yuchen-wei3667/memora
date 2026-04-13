import { MemoryService } from "./memory-service.js";

export const decayMemoryScores = async (
  service: MemoryService
): Promise<number> => {
  const items = await service.list();
  let updated = 0;

  for (const item of items) {
    if (item.score > 0.05) {
      await service.add({
        category: item.category,
        content: item.content,
        score: Math.max(0.05, item.score * 0.99),
        confidence: item.confidence
      });
      updated += 1;
    }
  }

  return updated;
};
