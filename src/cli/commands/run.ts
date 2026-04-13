import { Command } from "commander";

import { initializeRepo } from "./init.js";
import { resolveMemoraHome } from "../../config/loader.js";
import { runTask } from "../../runtime/orchestrator.js";
import { type SkillId } from "../../skills/types.js";

export const createRunCommand = (): Command => {
  return new Command("run")
    .description("Run a single-attempt memora task")
    .argument("<task>", "Task text to execute")
    .option("--memora-home <path>", "Override ~/.memora data root")
    .option(
      "--skill <skillId>",
      "Force a skill id (fix_failing_tests|implement_feature_safely|refactor_preserve_behavior|generic_implementation)"
    )
    .option(
      "--cwd <path>",
      "Override working directory for repository detection"
    )
    .action(
      async (
        task: string,
        options: { memoraHome?: string; cwd?: string; skill?: SkillId }
      ) => {
        const memoraHome = resolveMemoraHome(options.memoraHome);
        await initializeRepo({ memoraHome, cwd: options.cwd });

        const result = await runTask({
          taskText: task,
          memoraHome,
          cwd: options.cwd,
          mode: "run",
          forceSkillId: options.skill
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
