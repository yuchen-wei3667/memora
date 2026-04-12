import type { DatabaseSync } from "node:sqlite";

export const id = "0001_initial";

export const up = async (db: DatabaseSync): Promise<void> => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS repos (
      repo_id TEXT PRIMARY KEY,
      repo_root TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      command TEXT NOT NULL,
      task_text TEXT,
      status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'partial', 'aborted')),
      attempt_count INTEGER NOT NULL,
      selected_skill TEXT,
      summary TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      FOREIGN KEY (repo_id) REFERENCES repos(repo_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS run_steps (
      step_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      attempt INTEGER NOT NULL,
      step_type TEXT NOT NULL CHECK (step_type IN ('retrieve', 'plan', 'read', 'edit', 'shell', 'verify', 'reflect')),
      status TEXT NOT NULL,
      input_json TEXT,
      output_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS memory_items (
      memory_id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0.5,
      confidence REAL NOT NULL DEFAULT 0.5,
      use_count INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT,
      source_run_id TEXT,
      archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (repo_id) REFERENCES repos(repo_id) ON DELETE CASCADE,
      FOREIGN KEY (source_run_id) REFERENCES runs(run_id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS memory_embeddings (
      memory_id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      embedding_blob BLOB NOT NULL,
      dims INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (memory_id) REFERENCES memory_items(memory_id) ON DELETE CASCADE,
      FOREIGN KEY (repo_id) REFERENCES repos(repo_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tools (
      tool_id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      path TEXT NOT NULL,
      language TEXT,
      approval_state TEXT NOT NULL CHECK (approval_state IN ('auto', 'pending', 'approved', 'blocked')),
      success_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      created_by_run_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (repo_id) REFERENCES repos(repo_id) ON DELETE CASCADE,
      FOREIGN KEY (created_by_run_id) REFERENCES runs(run_id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS skills (
      skill_id TEXT PRIMARY KEY,
      repo_id TEXT,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      definition_json TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      success_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (repo_id) REFERENCES repos(repo_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS failure_patterns (
      pattern_id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      signature TEXT NOT NULL,
      context_json TEXT,
      occurrences INTEGER NOT NULL DEFAULT 1,
      last_seen_at TEXT NOT NULL,
      FOREIGN KEY (repo_id) REFERENCES repos(repo_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_runs_repo_started
      ON runs (repo_id, started_at DESC);

    CREATE INDEX IF NOT EXISTS idx_memory_repo_score
      ON memory_items (repo_id, archived, score DESC, last_used_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_repo_hash
      ON memory_items (repo_id, content_hash);

    CREATE INDEX IF NOT EXISTS idx_tools_repo_name
      ON tools (repo_id, name);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_failure_repo_signature
      ON failure_patterns (repo_id, signature);
  `);
};

export const down = async (db: DatabaseSync): Promise<void> => {
  db.exec(`
    DROP INDEX IF EXISTS idx_failure_repo_signature;
    DROP INDEX IF EXISTS idx_tools_repo_name;
    DROP INDEX IF EXISTS idx_memory_repo_hash;
    DROP INDEX IF EXISTS idx_memory_repo_score;
    DROP INDEX IF EXISTS idx_runs_repo_started;

    DROP TABLE IF EXISTS failure_patterns;
    DROP TABLE IF EXISTS skills;
    DROP TABLE IF EXISTS tools;
    DROP TABLE IF EXISTS memory_embeddings;
    DROP TABLE IF EXISTS memory_items;
    DROP TABLE IF EXISTS run_steps;
    DROP TABLE IF EXISTS runs;
    DROP TABLE IF EXISTS repos;
  `);
};
