#!/usr/bin/env node
import { Command } from "commander";
import { pathToFileURL } from "node:url";

import { createAuthCommand } from "./commands/auth.js";
import { createExplainCommand } from "./commands/explain.js";
import { createFixCommand } from "./commands/fix.js";
import { createInitCommand } from "./commands/init.js";
import { createMemoryCommand } from "./commands/memory.js";
import { createRunCommand } from "./commands/run.js";
import { createSkillsCommand } from "./commands/skills.js";
import { createTestCommand } from "./commands/test.js";
import { createToolsCommand } from "./commands/tools.js";

export const createCli = (): Command => {
  const program = new Command();

  program
    .name("memora")
    .description("Local-first autonomous coding agent")
    .version("0.0.0")
    .addCommand(createInitCommand())
    .addCommand(createRunCommand())
    .addCommand(createFixCommand())
    .addCommand(createTestCommand())
    .addCommand(createMemoryCommand())
    .addCommand(createToolsCommand())
    .addCommand(createSkillsCommand())
    .addCommand(createExplainCommand())
    .addCommand(createAuthCommand());

  return program;
};

export const runCli = async (argv = process.argv): Promise<void> => {
  const cli = createCli();
  await cli.parseAsync(argv);
};

const isMain =
  typeof process.argv[1] === "string" &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  runCli().catch((error: unknown) => {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(String(error));
    }
    process.exitCode = 1;
  });
}
