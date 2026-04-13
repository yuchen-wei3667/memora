import { Command } from "commander";

import { initializeRepo } from "./init.js";
import { resolveMemoraHome } from "../../config/loader.js";
import { runTask } from "../../runtime/orchestrator.js";

export const createFixCommand = (): Command => {
  return new Command("fix")
    .description("Attempt to fix failing verification/tests with retries")
    .argument("[task]", "Optional fix task text", "run npm test")
    .option("--memora-home <path>", "Override ~/.memora data root")
    .option(
      "--cwd <path>",
      "Override working directory for repository detection"
    )
    .action(
      async (task: string, options: { memoraHome?: string; cwd?: string }) => {
        const memoraHome = resolveMemoraHome(options.memoraHome);
        await initializeRepo({ memoraHome, cwd: options.cwd });

        const result = await runTask({
          taskText: task,
          memoraHome,
          cwd: options.cwd,
          mode: "fix"
        });

        console.log(result.summary);
        console.log(`run_id: ${result.runId}`);
        console.log(`trace: ${result.tracePath}`);

        if (!result.success) {
          throw new Error(result.summary);
        }
      }
    );
};
