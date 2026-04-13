import { Command } from "commander";

import { initializeRepo } from "./init.js";
import { resolveMemoraHome } from "../../config/loader.js";
import { resolveRepo } from "../../repo/resolver.js";
import { listTools } from "../../tools/tool-registry.js";

export const createToolsCommand = (): Command => {
  const tools = new Command("tools").description("Inspect generated tools");

  tools
    .command("list")
    .description("List generated tools and health metrics")
    .option("--memora-home <path>", "Override ~/.memora data root")
    .option("--cwd <path>", "Override repository detection directory")
    .action(async (options: { memoraHome?: string; cwd?: string }) => {
      const memoraHome = resolveMemoraHome(options.memoraHome);
      await initializeRepo({ memoraHome, cwd: options.cwd });
      const repo = await resolveRepo(options.cwd);
      const records = listTools({ memoraHome, repoId: repo.repoId });

      if (records.length === 0) {
        console.log("No tools found.");
        return;
      }

      for (const tool of records) {
        console.log(
          `${tool.toolId} | ${tool.name} | approval=${tool.approvalState} | success=${tool.successCount} | failure=${tool.failureCount}`
        );
      }
    });

  return tools;
};
