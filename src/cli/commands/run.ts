import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { Command } from "commander";

import { initializeRepo } from "./init.js";
import { loadConfig, resolveMemoraHome } from "../../config/loader.js";
import { type MemoraConfig, type ProviderName } from "../../config/schema.js";
import { assertSupportedProvider } from "../../providers/registry.js";
import { runTask } from "../../runtime/orchestrator.js";
import { type SkillId } from "../../skills/types.js";

export interface RunCommandOptions {
  memoraHome?: string;
  cwd?: string;
  skill?: SkillId;
  provider?: string;
  model?: string;
}

export interface ResolvedRunInput {
  taskText: string;
  provider: ProviderName;
  model: string;
}

export interface RunPrompter {
  ask(question: string): Promise<string>;
  close(): void;
}

const createRunPrompter = (): RunPrompter => {
  const readline = createInterface({ input, output });
  return {
    ask: async (question: string) => readline.question(question),
    close: () => readline.close()
  };
};

const getProviderModels = (
  config: MemoraConfig,
  provider: ProviderName
): string[] => {
  return (
    config.providers[provider].models ?? [config.providers[provider].model]
  );
};

const resolveProvider = (
  config: MemoraConfig,
  providerInput?: string
): ProviderName => {
  if (!providerInput) {
    return config.defaultProvider;
  }

  return assertSupportedProvider(providerInput);
};

const assertValidModel = (
  config: MemoraConfig,
  provider: ProviderName,
  model: string
): string => {
  const availableModels = getProviderModels(config, provider);
  if (!availableModels.includes(model)) {
    throw new Error(
      `Unsupported model '${model}' for provider '${provider}'. Supported models: ${availableModels.join(", ")}`
    );
  }

  return model;
};

const promptForProvider = async (
  prompter: RunPrompter,
  config: MemoraConfig
): Promise<ProviderName> => {
  const answer = (
    await prompter.ask(
      `Provider [${config.defaultProvider}] (${[
        "openai-codex",
        "github-copilot"
      ].join(", ")}): `
    )
  ).trim();

  return resolveProvider(config, answer || config.defaultProvider);
};

const promptForModel = async (
  prompter: RunPrompter,
  config: MemoraConfig,
  provider: ProviderName
): Promise<string> => {
  const defaultModel = config.providers[provider].model;
  const availableModels = getProviderModels(config, provider);
  const answer = (
    await prompter.ask(
      `Model [${defaultModel}] (${availableModels.join(", ")}): `
    )
  ).trim();

  return assertValidModel(config, provider, answer || defaultModel);
};

const promptForTaskText = async (prompter: RunPrompter): Promise<string> => {
  const taskText = (await prompter.ask("Task: ")).trim();
  if (taskText.length === 0) {
    throw new Error("Task text cannot be empty.");
  }

  return taskText;
};

export const resolveRunInput = async (
  task: string | undefined,
  options: RunCommandOptions,
  config: MemoraConfig,
  inputOptions?: {
    isInteractive?: boolean;
    prompter?: RunPrompter;
  }
): Promise<ResolvedRunInput> => {
  const isInteractive =
    inputOptions?.isInteractive ?? Boolean(input.isTTY && output.isTTY);
  const providedTask = task?.trim();
  let provider = resolveProvider(config, options.provider);
  let model = options.model
    ? assertValidModel(config, provider, options.model)
    : config.providers[provider].model;

  if (providedTask) {
    return {
      taskText: providedTask,
      provider,
      model
    };
  }

  if (!isInteractive) {
    throw new Error(
      "Task text is required when stdin is not interactive. Use `memora run <task>` for non-interactive runs."
    );
  }

  const prompter = inputOptions?.prompter ?? createRunPrompter();
  try {
    if (!options.provider) {
      provider = await promptForProvider(prompter, config);
      if (options.model) {
        model = assertValidModel(config, provider, options.model);
      } else {
        model = config.providers[provider].model;
      }
    }

    if (!options.model) {
      model = await promptForModel(prompter, config, provider);
    }

    return {
      taskText: await promptForTaskText(prompter),
      provider,
      model
    };
  } finally {
    prompter.close();
  }
};

export const createRunCommand = (): Command => {
  return new Command("run")
    .description("Run a single-attempt memora task")
    .argument("[task]", "Task text to execute")
    .option("--memora-home <path>", "Override ~/.memora data root")
    .option(
      "--skill <skillId>",
      "Force a skill id (fix_failing_tests|implement_feature_safely|refactor_preserve_behavior|generic_implementation)"
    )
    .option("--provider <provider>", "Override provider for this run")
    .option("--model <model>", "Override model for this run")
    .option(
      "--cwd <path>",
      "Override working directory for repository detection"
    )
    .action(async (task: string | undefined, options: RunCommandOptions) => {
      const memoraHome = resolveMemoraHome(options.memoraHome);
      const loadedConfig = await loadConfig({
        memoraHome,
        createIfMissing: true
      });
      const resolvedInput = await resolveRunInput(
        task,
        options,
        loadedConfig.config
      );

      await initializeRepo({ memoraHome, cwd: options.cwd });

      const result = await runTask({
        taskText: resolvedInput.taskText,
        memoraHome,
        cwd: options.cwd,
        mode: "run",
        forceSkillId: options.skill,
        provider: resolvedInput.provider,
        model: resolvedInput.model
      });

      console.log(result.summary);
      console.log(`run_id: ${result.runId}`);
      console.log(`trace: ${result.tracePath}`);

      if (!result.success) {
        throw new Error(result.summary);
      }
    });
};
