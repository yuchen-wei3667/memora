import { Command } from "commander";

import { resolveMemoraHome } from "../../config/loader.js";
import { resolveRepo } from "../../repo/resolver.js";
import { initializeRepo } from "./init.js";
import { MemoryService } from "../../memory/memory-service.js";

const createMemoryService = async (options: {
  memoraHome?: string;
  cwd?: string;
}): Promise<MemoryService> => {
  const memoraHome = resolveMemoraHome(options.memoraHome);
  await initializeRepo({ memoraHome, cwd: options.cwd });
  const resolved = await resolveRepo(options.cwd);
  return new MemoryService({
    memoraHome,
    repoId: resolved.repoId,
    repoRoot: resolved.repoRoot
  });
};

export const createMemoryCommand = (): Command => {
  const memory = new Command("memory").description("Manage repo-scoped memory");

  memory
    .command("list")
    .option("--category <category>", "Filter by category")
    .option("--limit <limit>", "Limit number of rows")
    .option("--min-score <score>", "Minimum score")
    .option("--memora-home <path>", "Override ~/.memora data root")
    .option("--cwd <path>", "Override repository detection directory")
    .action(
      async (options: {
        category?: string;
        limit?: string;
        minScore?: string;
        memoraHome?: string;
        cwd?: string;
      }) => {
        const service = await createMemoryService(options);
        const items = await service.list({
          category: options.category,
          limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
          minScore: options.minScore
            ? Number.parseFloat(options.minScore)
            : undefined
        });

        if (items.length === 0) {
          console.log("No memory items found.");
          return;
        }

        for (const item of items) {
          console.log(
            `${item.memoryId} | ${item.category} | score=${item.score.toFixed(3)} | ${item.content}`
          );
        }
      }
    );

  memory
    .command("add")
    .requiredOption("--category <category>", "Memory category")
    .requiredOption("--content <content>", "Memory content")
    .option("--score <score>", "Optional score")
    .option("--confidence <confidence>", "Optional confidence")
    .option("--memora-home <path>", "Override ~/.memora data root")
    .option("--cwd <path>", "Override repository detection directory")
    .action(
      async (options: {
        category: string;
        content: string;
        score?: string;
        confidence?: string;
        memoraHome?: string;
        cwd?: string;
      }) => {
        const service = await createMemoryService(options);
        const result = await service.add({
          category: options.category,
          content: options.content,
          score: options.score ? Number.parseFloat(options.score) : undefined,
          confidence: options.confidence
            ? Number.parseFloat(options.confidence)
            : undefined
        });

        if (result.deduped) {
          console.log(
            `Updated existing memory (${result.reason}) ${result.record.memoryId}`
          );
        } else {
          console.log(`Added memory ${result.record.memoryId}`);
        }
      }
    );

  memory
    .command("delete")
    .argument("<memoryId>", "Memory ID")
    .option("--memora-home <path>", "Override ~/.memora data root")
    .option("--cwd <path>", "Override repository detection directory")
    .action(
      async (
        memoryId: string,
        options: { memoraHome?: string; cwd?: string }
      ) => {
        const service = await createMemoryService(options);
        const deleted = await service.remove(memoryId);
        if (!deleted) {
          throw new Error(`Memory item not found: ${memoryId}`);
        }
        console.log(`Deleted memory ${memoryId}`);
      }
    );

  return memory;
};
