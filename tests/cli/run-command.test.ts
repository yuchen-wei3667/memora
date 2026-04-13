import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  resolveRunInput,
  type RunPrompter
} from "../../src/cli/commands/run.js";
import { DEFAULT_CONFIG } from "../../src/config/schema.js";
import { readRunTrace } from "../../src/trace/trace-writer.js";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const tsxCliPath = path.join(
  workspaceRoot,
  "node_modules",
  "tsx",
  "dist",
  "cli.mjs"
);

const createRunnableRepo = async (expectedText: string): Promise<string> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "memora-run-repo-"));
  execFileSync("git", ["init"], { cwd: repoRoot, stdio: "ignore" });

  await writeFile(path.join(repoRoot, "notes.txt"), "hello\n", "utf8");
  await writeFile(
    path.join(repoRoot, "package.json"),
    JSON.stringify(
      {
        name: "run-fixture",
        private: true,
        packageManager: "npm@10.0.0",
        scripts: {
          test: `node -e \"const fs = require('node:fs'); const text = fs.readFileSync('notes.txt', 'utf8'); if (!text.includes('${expectedText}')) { console.error('Error: missing expected text'); process.exit(1); }\"`
        }
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  return repoRoot;
};

const runMemoraCli = (args: string[], cwd: string) => {
  return spawnSync(
    process.execPath,
    [tsxCliPath, path.join(workspaceRoot, "src", "cli", "index.ts"), ...args],
    {
      cwd: workspaceRoot,
      encoding: "utf8",
      env: { ...process.env, FORCE_COLOR: "0" }
    }
  );
};

describe("run CLI command", () => {
  it("executes a simple edit task, writes a trace, and exits successfully", async () => {
    const repoRoot = await createRunnableRepo("world");
    const memoraHome = await mkdtemp(
      path.join(os.tmpdir(), "memora-run-home-")
    );

    const result = runMemoraCli(
      [
        "run",
        'append "world" to notes.txt',
        "--cwd",
        repoRoot,
        "--memora-home",
        memoraHome
      ],
      workspaceRoot
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Task completed successfully.");

    const fileContents = await readFile(
      path.join(repoRoot, "notes.txt"),
      "utf8"
    );
    expect(fileContents).toContain("world");

    const runFiles = await readdir(path.join(memoraHome, "repos"));
    expect(runFiles).toHaveLength(1);

    const traceDir = path.join(memoraHome, "repos", runFiles[0], "runs");
    const traceFiles = await readdir(traceDir);
    expect(traceFiles).toHaveLength(1);

    const trace = await readRunTrace(path.join(traceDir, traceFiles[0]));
    expect(
      trace.events.some((event) => event.eventType === "verification.completed")
    ).toBe(true);
    expect(
      trace.events.some((event) => event.eventType === "step.completed")
    ).toBe(true);
  });

  it("returns a failing exit code when verification fails", async () => {
    const repoRoot = await createRunnableRepo("planet");
    const memoraHome = await mkdtemp(
      path.join(os.tmpdir(), "memora-run-home-")
    );

    const result = runMemoraCli(
      [
        "run",
        'append "world" to notes.txt',
        "--cwd",
        repoRoot,
        "--memora-home",
        memoraHome
      ],
      workspaceRoot
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Verification failed.");
  });

  it("supports provider and model overrides for non-interactive runs", async () => {
    const repoRoot = await createRunnableRepo("world");
    const memoraHome = await mkdtemp(
      path.join(os.tmpdir(), "memora-run-home-")
    );

    const result = runMemoraCli(
      [
        "run",
        'append "world" to notes.txt',
        "--provider",
        "openai-codex",
        "--model",
        "gpt-5-codex",
        "--cwd",
        repoRoot,
        "--memora-home",
        memoraHome
      ],
      workspaceRoot
    );

    expect(result.status).toBe(0);

    const repoIds = await readdir(path.join(memoraHome, "repos"));
    const traceDir = path.join(memoraHome, "repos", repoIds[0], "runs");
    const traceFiles = await readdir(traceDir);
    const trace = await readRunTrace(path.join(traceDir, traceFiles[0]));
    const runStartedEvent = trace.events.find(
      (event) => event.eventType === "run.started"
    );

    expect(runStartedEvent?.payload.provider).toBe("openai-codex");
    expect(runStartedEvent?.payload.model).toBe("gpt-5-codex");
  });

  it("fails clearly when task text is omitted in non-interactive mode", async () => {
    const repoRoot = await createRunnableRepo("world");
    const memoraHome = await mkdtemp(
      path.join(os.tmpdir(), "memora-run-home-")
    );

    const result = runMemoraCli(
      ["run", "--cwd", repoRoot, "--memora-home", memoraHome],
      workspaceRoot
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Task text is required when stdin is not interactive"
    );
  });

  it("prompts for provider and model before task text", async () => {
    const prompts: string[] = [];
    const answers = [
      "github-copilot",
      "gpt-5-codex",
      'append "world" to notes.txt'
    ];
    const prompter: RunPrompter = {
      ask: async (question: string) => {
        prompts.push(question);
        return answers.shift() ?? "";
      },
      close: () => undefined
    };

    const resolved = await resolveRunInput(undefined, {}, DEFAULT_CONFIG, {
      isInteractive: true,
      prompter
    });

    expect(prompts).toEqual([
      "Provider [openai-codex] (openai-codex, github-copilot): ",
      "Model [gpt-5-codex] (gpt-5-codex): ",
      "Task: "
    ]);
    expect(resolved.provider).toBe("github-copilot");
    expect(resolved.model).toBe("gpt-5-codex");
    expect(resolved.taskText).toBe('append "world" to notes.txt');
  });

  it("includes retrieved memory context in trace on subsequent runs", async () => {
    const repoRoot = await createRunnableRepo("world");
    const memoraHome = await mkdtemp(
      path.join(os.tmpdir(), "memora-run-home-")
    );

    const addMemory = runMemoraCli(
      [
        "memory",
        "add",
        "--category",
        "workflow",
        "--content",
        "Prefer running npm test before commits",
        "--cwd",
        repoRoot,
        "--memora-home",
        memoraHome
      ],
      workspaceRoot
    );
    expect(addMemory.status).toBe(0);

    const runResult = runMemoraCli(
      [
        "run",
        'append "world" to notes.txt',
        "--cwd",
        repoRoot,
        "--memora-home",
        memoraHome
      ],
      workspaceRoot
    );
    expect(runResult.status).toBe(0);

    const repoIds = await readdir(path.join(memoraHome, "repos"));
    const traceDir = path.join(memoraHome, "repos", repoIds[0], "runs");
    const traceFiles = await readdir(traceDir);
    const latestTraceFile = traceFiles.sort().at(-1)!;
    const trace = await readRunTrace(path.join(traceDir, latestTraceFile));

    const contextEvent = trace.events.find(
      (event) =>
        event.eventType === "state.changed" && event.state === "CONTEXT_READY"
    );
    expect(contextEvent).toBeDefined();
    const memoryContext =
      (contextEvent?.payload.memoryContext as
        | Array<{ content: string }>
        | undefined) ?? [];
    expect(memoryContext.length).toBeGreaterThan(0);
    expect(
      memoryContext.some((entry) => entry.content.includes("running npm test"))
    ).toBe(true);

    const skillEvent = trace.events.find(
      (event) =>
        event.eventType === "note.logged" && event.state === "CONTEXT_READY"
    );
    expect(skillEvent).toBeDefined();
    expect(
      (skillEvent?.payload.selectedSkill as { skillId: string } | undefined)
        ?.skillId
    ).toBeDefined();
  });
});
