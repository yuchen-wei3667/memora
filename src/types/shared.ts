export type RepoId = string;

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunContext {
  repoId: RepoId;
  repoRoot: string;
  command: string;
  taskText?: string;
}
