import { Command } from "commander";

import { initializeRepo } from "./init.js";
import { resolveMemoraHome } from "../../config/loader.js";
import { resolveRepo } from "../../repo/resolver.js";
import {
  buildExplainOutput,
  formatExplainOutput,
  resolveExplainTrace
} from "../../trace/explain-service.js";

export const createExplainCommand = (): Command => {
  return new Command("explain")
    .description("Explain run decisions and outcomes")
    .argument("[runId]", "Run ID to explain")
    .option("--memora-home <path>", "Override ~/.memora data root")
    .option("--cwd <path>", "Override repository detection directory")
    .action(
      async (
        runId: string | undefined,
        options: { memoraHome?: string; cwd?: string }
      ) => {
        const memoraHome = resolveMemoraHome(options.memoraHome);
        await initializeRepo({ memoraHome, cwd: options.cwd });
        const repo = await resolveRepo(options.cwd);
        const trace = await resolveExplainTrace({
          memoraHome,
          repoId: repo.repoId,
          runId
        });

        const explained = buildExplainOutput(trace);
        console.log(`run_id: ${trace.runId}`);
        process.stdout.write(formatExplainOutput(explained));
      }
    );
};
