import { Command } from "commander";

import { initializeRepo } from "./init.js";
import { resolveMemoraHome } from "../../config/loader.js";
import { buildRunContext } from "../../runtime/context-builder.js";
import { runVerification } from "../../verify/verify-service.js";

export const createTestCommand = (): Command => {
  return new Command("test")
    .description("Run repository verification commands")
    .option("--memora-home <path>", "Override ~/.memora data root")
    .option(
      "--cwd <path>",
      "Override working directory for repository detection"
    )
    .action(async (options: { memoraHome?: string; cwd?: string }) => {
      const memoraHome = resolveMemoraHome(options.memoraHome);
      await initializeRepo({ memoraHome, cwd: options.cwd });
      const context = await buildRunContext({
        taskText: "run verification",
        memoraHome,
        cwd: options.cwd
      });

      const result = await runVerification({
        cwd: context.repoRoot,
        commands: context.verificationCommands
      });

      console.log(`status: ${result.status}`);
      for (const command of result.commands) {
        console.log(
          `${command.command} | exit=${String(command.exitCode)} | failures=${command.failures.length}`
        );
      }

      if (result.status !== "passed") {
        throw new Error("Verification failed.");
      }
    });
};
