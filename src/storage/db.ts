import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";

import { resolveMemoraHome } from "../config/loader.js";

export const MEMORA_DB_FILENAME = "memora.db";
export const MIGRATIONS_TABLE = "_memora_migrations";

export type RunStatus = "success" | "failed" | "partial" | "aborted";

export interface DbConnectionOptions {
  memoraHome?: string;
  dbPath?: string;
}

export interface RepoRecord {
  repoId: string;
  repoRoot: string;
  createdAt: string;
  updatedAt: string;
}

export interface RunRecord {
  runId: string;
  repoId: string;
  command: string;
  taskText: string | null;
  status: RunStatus;
  attemptCount: number;
  selectedSkill: string | null;
  summary: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface CreateRunInput {
  runId: string;
  command: string;
  taskText?: string | null;
  status: RunStatus;
  attemptCount: number;
  selectedSkill?: string | null;
  summary?: string | null;
  startedAt: string;
  endedAt?: string | null;
}

export interface MemoryItemRecord {
  memoryId: string;
  repoId: string;
  category: string;
  content: string;
  contentHash: string;
  score: number;
  confidence: number;
  useCount: number;
  lastUsedAt: string | null;
  sourceRunId: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMemoryItemInput {
  memoryId: string;
  category: string;
  content: string;
  contentHash: string;
  score?: number;
  confidence?: number;
  useCount?: number;
  lastUsedAt?: string | null;
  sourceRunId?: string | null;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateMemoryItemInput {
  category?: string;
  content?: string;
  contentHash?: string;
  score?: number;
  confidence?: number;
  useCount?: number;
  lastUsedAt?: string | null;
  sourceRunId?: string | null;
  archived?: boolean;
  updatedAt: string;
}

type SqliteRow = Record<string, unknown>;

const prepare = (db: DatabaseSync, sql: string): StatementSync =>
  db.prepare(sql);

const asBoolean = (value: unknown): boolean => value === 1;

const asNullableString = (value: unknown): string | null => {
  return typeof value === "string" ? value : null;
};

const asRunStatus = (value: unknown): RunStatus => {
  if (
    value === "success" ||
    value === "failed" ||
    value === "partial" ||
    value === "aborted"
  ) {
    return value;
  }

  throw new Error(`Invalid run status: ${String(value)}`);
};

const mapRepo = (row: SqliteRow): RepoRecord => ({
  repoId: String(row.repo_id),
  repoRoot: String(row.repo_root),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

const mapRun = (row: SqliteRow): RunRecord => ({
  runId: String(row.run_id),
  repoId: String(row.repo_id),
  command: String(row.command),
  taskText: asNullableString(row.task_text),
  status: asRunStatus(row.status),
  attemptCount: Number(row.attempt_count),
  selectedSkill: asNullableString(row.selected_skill),
  summary: asNullableString(row.summary),
  startedAt: String(row.started_at),
  endedAt: asNullableString(row.ended_at)
});

const mapMemoryItem = (row: SqliteRow): MemoryItemRecord => ({
  memoryId: String(row.memory_id),
  repoId: String(row.repo_id),
  category: String(row.category),
  content: String(row.content),
  contentHash: String(row.content_hash),
  score: Number(row.score),
  confidence: Number(row.confidence),
  useCount: Number(row.use_count),
  lastUsedAt: asNullableString(row.last_used_at),
  sourceRunId: asNullableString(row.source_run_id),
  archived: asBoolean(row.archived),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

export const getDbPath = (memoraHome?: string): string => {
  return path.join(resolveMemoraHome(memoraHome), MEMORA_DB_FILENAME);
};

export const ensureDbDirectory = async (
  options: DbConnectionOptions = {}
): Promise<string> => {
  const dbPath = options.dbPath ?? getDbPath(options.memoraHome);
  await mkdir(path.dirname(dbPath), { recursive: true });
  return dbPath;
};

export const openDatabase = (
  options: DbConnectionOptions = {}
): DatabaseSync => {
  const dbPath = options.dbPath ?? getDbPath(options.memoraHome);
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  return db;
};

export const closeDatabase = (db: DatabaseSync): void => {
  db.close();
};

export const withTransaction = async <T>(
  db: DatabaseSync,
  fn: () => Promise<T> | T
): Promise<T> => {
  db.exec("BEGIN");

  try {
    const result = await fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

export const ensureMigrationLedgerTable = (db: DatabaseSync): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
};

export const listAppliedMigrationIds = (db: DatabaseSync): string[] => {
  ensureMigrationLedgerTable(db);

  const rows = prepare(
    db,
    `SELECT id FROM ${MIGRATIONS_TABLE} ORDER BY id ASC`
  ).all() as SqliteRow[];
  return rows.map((row) => String(row.id));
};

export const getAppliedMigrationsDescending = (
  db: DatabaseSync
): Array<{ id: string; appliedAt: string }> => {
  ensureMigrationLedgerTable(db);

  const rows = prepare(
    db,
    `SELECT id, applied_at FROM ${MIGRATIONS_TABLE} ORDER BY id DESC`
  ).all() as SqliteRow[];

  return rows.map((row) => ({
    id: String(row.id),
    appliedAt: String(row.applied_at)
  }));
};

export const recordAppliedMigration = (
  db: DatabaseSync,
  id: string,
  appliedAt: string
): void => {
  prepare(
    db,
    `INSERT INTO ${MIGRATIONS_TABLE} (id, applied_at) VALUES (:id, :applied_at)`
  ).run({ id, applied_at: appliedAt });
};

export const removeAppliedMigration = (db: DatabaseSync, id: string): void => {
  prepare(db, `DELETE FROM ${MIGRATIONS_TABLE} WHERE id = :id`).run({ id });
};

export const upsertRepo = (db: DatabaseSync, repo: RepoRecord): RepoRecord => {
  prepare(
    db,
    `
      INSERT INTO repos (repo_id, repo_root, created_at, updated_at)
      VALUES (:repo_id, :repo_root, :created_at, :updated_at)
      ON CONFLICT(repo_id) DO UPDATE SET
        repo_root = excluded.repo_root,
        updated_at = excluded.updated_at
    `
  ).run({
    repo_id: repo.repoId,
    repo_root: repo.repoRoot,
    created_at: repo.createdAt,
    updated_at: repo.updatedAt
  });

  const saved = getRepoById(db, repo.repoId);
  if (!saved) {
    throw new Error(`Failed to persist repo ${repo.repoId}`);
  }

  return saved;
};

export const getRepoById = (
  db: DatabaseSync,
  repoId: string
): RepoRecord | null => {
  const row = prepare(
    db,
    `
      SELECT repo_id, repo_root, created_at, updated_at
      FROM repos
      WHERE repo_id = :repo_id
    `
  ).get({ repo_id: repoId }) as SqliteRow | undefined;

  return row ? mapRepo(row) : null;
};

export const insertRun = (
  db: DatabaseSync,
  repoId: string,
  run: CreateRunInput
): RunRecord => {
  prepare(
    db,
    `
      INSERT INTO runs (
        run_id,
        repo_id,
        command,
        task_text,
        status,
        attempt_count,
        selected_skill,
        summary,
        started_at,
        ended_at
      ) VALUES (
        :run_id,
        :repo_id,
        :command,
        :task_text,
        :status,
        :attempt_count,
        :selected_skill,
        :summary,
        :started_at,
        :ended_at
      )
    `
  ).run({
    run_id: run.runId,
    repo_id: repoId,
    command: run.command,
    task_text: run.taskText ?? null,
    status: run.status,
    attempt_count: run.attemptCount,
    selected_skill: run.selectedSkill ?? null,
    summary: run.summary ?? null,
    started_at: run.startedAt,
    ended_at: run.endedAt ?? null
  });

  const saved = getRunById(db, repoId, run.runId);
  if (!saved) {
    throw new Error(`Failed to persist run ${run.runId}`);
  }

  return saved;
};

export const getRunById = (
  db: DatabaseSync,
  repoId: string,
  runId: string
): RunRecord | null => {
  const row = prepare(
    db,
    `
      SELECT
        run_id,
        repo_id,
        command,
        task_text,
        status,
        attempt_count,
        selected_skill,
        summary,
        started_at,
        ended_at
      FROM runs
      WHERE repo_id = :repo_id AND run_id = :run_id
    `
  ).get({ repo_id: repoId, run_id: runId }) as SqliteRow | undefined;

  return row ? mapRun(row) : null;
};

export const listRunsByRepoId = (
  db: DatabaseSync,
  repoId: string
): RunRecord[] => {
  const rows = prepare(
    db,
    `
      SELECT
        run_id,
        repo_id,
        command,
        task_text,
        status,
        attempt_count,
        selected_skill,
        summary,
        started_at,
        ended_at
      FROM runs
      WHERE repo_id = :repo_id
      ORDER BY started_at DESC, run_id DESC
    `
  ).all({ repo_id: repoId }) as SqliteRow[];

  return rows.map(mapRun);
};

export const insertMemoryItem = (
  db: DatabaseSync,
  repoId: string,
  memoryItem: CreateMemoryItemInput
): MemoryItemRecord => {
  prepare(
    db,
    `
      INSERT INTO memory_items (
        memory_id,
        repo_id,
        category,
        content,
        content_hash,
        score,
        confidence,
        use_count,
        last_used_at,
        source_run_id,
        archived,
        created_at,
        updated_at
      ) VALUES (
        :memory_id,
        :repo_id,
        :category,
        :content,
        :content_hash,
        :score,
        :confidence,
        :use_count,
        :last_used_at,
        :source_run_id,
        :archived,
        :created_at,
        :updated_at
      )
    `
  ).run({
    memory_id: memoryItem.memoryId,
    repo_id: repoId,
    category: memoryItem.category,
    content: memoryItem.content,
    content_hash: memoryItem.contentHash,
    score: memoryItem.score ?? 0.5,
    confidence: memoryItem.confidence ?? 0.5,
    use_count: memoryItem.useCount ?? 0,
    last_used_at: memoryItem.lastUsedAt ?? null,
    source_run_id: memoryItem.sourceRunId ?? null,
    archived: memoryItem.archived ? 1 : 0,
    created_at: memoryItem.createdAt,
    updated_at: memoryItem.updatedAt
  });

  const saved = getMemoryItemById(db, repoId, memoryItem.memoryId);
  if (!saved) {
    throw new Error(`Failed to persist memory item ${memoryItem.memoryId}`);
  }

  return saved;
};

export const getMemoryItemById = (
  db: DatabaseSync,
  repoId: string,
  memoryId: string
): MemoryItemRecord | null => {
  const row = prepare(
    db,
    `
      SELECT
        memory_id,
        repo_id,
        category,
        content,
        content_hash,
        score,
        confidence,
        use_count,
        last_used_at,
        source_run_id,
        archived,
        created_at,
        updated_at
      FROM memory_items
      WHERE repo_id = :repo_id AND memory_id = :memory_id
    `
  ).get({ repo_id: repoId, memory_id: memoryId }) as SqliteRow | undefined;

  return row ? mapMemoryItem(row) : null;
};

export const listMemoryItemsByRepoId = (
  db: DatabaseSync,
  repoId: string
): MemoryItemRecord[] => {
  const rows = prepare(
    db,
    `
      SELECT
        memory_id,
        repo_id,
        category,
        content,
        content_hash,
        score,
        confidence,
        use_count,
        last_used_at,
        source_run_id,
        archived,
        created_at,
        updated_at
      FROM memory_items
      WHERE repo_id = :repo_id
      ORDER BY archived ASC, score DESC, updated_at DESC, memory_id DESC
    `
  ).all({ repo_id: repoId }) as SqliteRow[];

  return rows.map(mapMemoryItem);
};

export const updateMemoryItem = (
  db: DatabaseSync,
  repoId: string,
  memoryId: string,
  update: UpdateMemoryItemInput
): MemoryItemRecord => {
  const existing = getMemoryItemById(db, repoId, memoryId);
  if (!existing) {
    throw new Error(`Memory item ${memoryId} not found for repo ${repoId}`);
  }

  prepare(
    db,
    `
      UPDATE memory_items
      SET
        category = :category,
        content = :content,
        content_hash = :content_hash,
        score = :score,
        confidence = :confidence,
        use_count = :use_count,
        last_used_at = :last_used_at,
        source_run_id = :source_run_id,
        archived = :archived,
        updated_at = :updated_at
      WHERE repo_id = :repo_id AND memory_id = :memory_id
    `
  ).run({
    memory_id: memoryId,
    repo_id: repoId,
    category: update.category ?? existing.category,
    content: update.content ?? existing.content,
    content_hash: update.contentHash ?? existing.contentHash,
    score: update.score ?? existing.score,
    confidence: update.confidence ?? existing.confidence,
    use_count: update.useCount ?? existing.useCount,
    last_used_at: update.lastUsedAt ?? existing.lastUsedAt,
    source_run_id: update.sourceRunId ?? existing.sourceRunId,
    archived: (update.archived ?? existing.archived) ? 1 : 0,
    updated_at: update.updatedAt
  });

  const saved = getMemoryItemById(db, repoId, memoryId);
  if (!saved) {
    throw new Error(`Failed to update memory item ${memoryId}`);
  }

  return saved;
};

export const deleteMemoryItem = (
  db: DatabaseSync,
  repoId: string,
  memoryId: string
): boolean => {
  const before = getMemoryItemById(db, repoId, memoryId);
  if (!before) {
    return false;
  }

  prepare(
    db,
    `DELETE FROM memory_items WHERE repo_id = :repo_id AND memory_id = :memory_id`
  ).run({ repo_id: repoId, memory_id: memoryId });

  return getMemoryItemById(db, repoId, memoryId) === null;
};

export interface RepoScopedDb {
  repoId: string;
  insertRun: (run: CreateRunInput) => RunRecord;
  getRunById: (runId: string) => RunRecord | null;
  listRuns: () => RunRecord[];
  insertMemoryItem: (memoryItem: CreateMemoryItemInput) => MemoryItemRecord;
  getMemoryItemById: (memoryId: string) => MemoryItemRecord | null;
  listMemoryItems: () => MemoryItemRecord[];
  updateMemoryItem: (
    memoryId: string,
    update: UpdateMemoryItemInput
  ) => MemoryItemRecord;
  deleteMemoryItem: (memoryId: string) => boolean;
}

export type ToolApprovalState = "auto" | "pending" | "approved" | "blocked";

export interface ToolRecord {
  toolId: string;
  repoId: string;
  name: string;
  description: string | null;
  path: string;
  language: string | null;
  approvalState: ToolApprovalState;
  successCount: number;
  failureCount: number;
  createdByRunId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateToolInput {
  toolId: string;
  name: string;
  description?: string | null;
  path: string;
  language?: string | null;
  approvalState: ToolApprovalState;
  createdByRunId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateToolStatsInput {
  successCount?: number;
  failureCount?: number;
  approvalState?: ToolApprovalState;
  updatedAt: string;
}

export interface FailurePatternRecord {
  patternId: string;
  repoId: string;
  signature: string;
  contextJson: string | null;
  occurrences: number;
  lastSeenAt: string;
}

const asToolApprovalState = (value: unknown): ToolApprovalState => {
  if (
    value === "auto" ||
    value === "pending" ||
    value === "approved" ||
    value === "blocked"
  ) {
    return value;
  }

  throw new Error(`Invalid tool approval state: ${String(value)}`);
};

const mapTool = (row: SqliteRow): ToolRecord => ({
  toolId: String(row.tool_id),
  repoId: String(row.repo_id),
  name: String(row.name),
  description: asNullableString(row.description),
  path: String(row.path),
  language: asNullableString(row.language),
  approvalState: asToolApprovalState(row.approval_state),
  successCount: Number(row.success_count),
  failureCount: Number(row.failure_count),
  createdByRunId: asNullableString(row.created_by_run_id),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

const mapFailurePattern = (row: SqliteRow): FailurePatternRecord => ({
  patternId: String(row.pattern_id),
  repoId: String(row.repo_id),
  signature: String(row.signature),
  contextJson: asNullableString(row.context_json),
  occurrences: Number(row.occurrences),
  lastSeenAt: String(row.last_seen_at)
});

export const createRepoScopedDb = (
  db: DatabaseSync,
  repoId: string
): RepoScopedDb => ({
  repoId,
  insertRun: (run) => insertRun(db, repoId, run),
  getRunById: (runId) => getRunById(db, repoId, runId),
  listRuns: () => listRunsByRepoId(db, repoId),
  insertMemoryItem: (memoryItem) => insertMemoryItem(db, repoId, memoryItem),
  getMemoryItemById: (memoryId) => getMemoryItemById(db, repoId, memoryId),
  listMemoryItems: () => listMemoryItemsByRepoId(db, repoId),
  updateMemoryItem: (memoryId, update) =>
    updateMemoryItem(db, repoId, memoryId, update),
  deleteMemoryItem: (memoryId) => deleteMemoryItem(db, repoId, memoryId)
});

export const insertTool = (
  db: DatabaseSync,
  repoId: string,
  input: CreateToolInput
): ToolRecord => {
  prepare(
    db,
    `
      INSERT INTO tools (
        tool_id,
        repo_id,
        name,
        description,
        path,
        language,
        approval_state,
        created_by_run_id,
        created_at,
        updated_at
      ) VALUES (
        :tool_id,
        :repo_id,
        :name,
        :description,
        :path,
        :language,
        :approval_state,
        :created_by_run_id,
        :created_at,
        :updated_at
      )
      ON CONFLICT(tool_id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        path = excluded.path,
        language = excluded.language,
        approval_state = excluded.approval_state,
        created_by_run_id = excluded.created_by_run_id,
        updated_at = excluded.updated_at
    `
  ).run({
    tool_id: input.toolId,
    repo_id: repoId,
    name: input.name,
    description: input.description ?? null,
    path: input.path,
    language: input.language ?? null,
    approval_state: input.approvalState,
    created_by_run_id: input.createdByRunId ?? null,
    created_at: input.createdAt,
    updated_at: input.updatedAt
  });

  const saved = getToolById(db, repoId, input.toolId);
  if (!saved) {
    throw new Error(`Failed to persist tool ${input.toolId}`);
  }
  return saved;
};

export const getToolById = (
  db: DatabaseSync,
  repoId: string,
  toolId: string
): ToolRecord | null => {
  const row = prepare(
    db,
    `
      SELECT
        tool_id,
        repo_id,
        name,
        description,
        path,
        language,
        approval_state,
        success_count,
        failure_count,
        created_by_run_id,
        created_at,
        updated_at
      FROM tools
      WHERE repo_id = :repo_id AND tool_id = :tool_id
    `
  ).get({ repo_id: repoId, tool_id: toolId }) as SqliteRow | undefined;

  return row ? mapTool(row) : null;
};

export const listToolsByRepoId = (
  db: DatabaseSync,
  repoId: string
): ToolRecord[] => {
  const rows = prepare(
    db,
    `
      SELECT
        tool_id,
        repo_id,
        name,
        description,
        path,
        language,
        approval_state,
        success_count,
        failure_count,
        created_by_run_id,
        created_at,
        updated_at
      FROM tools
      WHERE repo_id = :repo_id
      ORDER BY updated_at DESC, tool_id DESC
    `
  ).all({ repo_id: repoId }) as SqliteRow[];

  return rows.map(mapTool);
};

export const updateToolStats = (
  db: DatabaseSync,
  repoId: string,
  toolId: string,
  input: UpdateToolStatsInput
): ToolRecord => {
  const existing = getToolById(db, repoId, toolId);
  if (!existing) {
    throw new Error(`Tool ${toolId} not found for repo ${repoId}`);
  }

  prepare(
    db,
    `
      UPDATE tools
      SET
        success_count = :success_count,
        failure_count = :failure_count,
        approval_state = :approval_state,
        updated_at = :updated_at
      WHERE repo_id = :repo_id AND tool_id = :tool_id
    `
  ).run({
    repo_id: repoId,
    tool_id: toolId,
    success_count: input.successCount ?? existing.successCount,
    failure_count: input.failureCount ?? existing.failureCount,
    approval_state: input.approvalState ?? existing.approvalState,
    updated_at: input.updatedAt
  });

  const saved = getToolById(db, repoId, toolId);
  if (!saved) {
    throw new Error(`Failed to update tool ${toolId}`);
  }
  return saved;
};

export const listFailurePatternsByRepoId = (
  db: DatabaseSync,
  repoId: string
): FailurePatternRecord[] => {
  const rows = prepare(
    db,
    `
      SELECT pattern_id, repo_id, signature, context_json, occurrences, last_seen_at
      FROM failure_patterns
      WHERE repo_id = :repo_id
      ORDER BY last_seen_at DESC
    `
  ).all({ repo_id: repoId }) as SqliteRow[];

  return rows.map(mapFailurePattern);
};

export const upsertFailurePattern = (
  db: DatabaseSync,
  repoId: string,
  input: {
    patternId: string;
    signature: string;
    contextJson?: string | null;
    lastSeenAt: string;
  }
): FailurePatternRecord => {
  prepare(
    db,
    `
      INSERT INTO failure_patterns (pattern_id, repo_id, signature, context_json, occurrences, last_seen_at)
      VALUES (:pattern_id, :repo_id, :signature, :context_json, 1, :last_seen_at)
      ON CONFLICT(repo_id, signature) DO UPDATE SET
        context_json = excluded.context_json,
        occurrences = failure_patterns.occurrences + 1,
        last_seen_at = excluded.last_seen_at
    `
  ).run({
    pattern_id: input.patternId,
    repo_id: repoId,
    signature: input.signature,
    context_json: input.contextJson ?? null,
    last_seen_at: input.lastSeenAt
  });

  const row = prepare(
    db,
    `
      SELECT pattern_id, repo_id, signature, context_json, occurrences, last_seen_at
      FROM failure_patterns
      WHERE repo_id = :repo_id AND signature = :signature
    `
  ).get({ repo_id: repoId, signature: input.signature }) as
    | SqliteRow
    | undefined;

  if (!row) {
    throw new Error(`Failed to persist failure pattern ${input.signature}`);
  }

  return mapFailurePattern(row);
};

export const upsertSkillMetric = (
  db: DatabaseSync,
  input: {
    skillId: string;
    name: string;
    version: string;
    successDelta: number;
    failureDelta: number;
    updatedAt: string;
  }
): void => {
  prepare(
    db,
    `
      INSERT INTO skills (
        skill_id,
        repo_id,
        name,
        version,
        definition_json,
        enabled,
        success_count,
        failure_count,
        created_at,
        updated_at
      ) VALUES (
        :skill_id,
        NULL,
        :name,
        :version,
        :definition_json,
        1,
        :success_delta,
        :failure_delta,
        :updated_at,
        :updated_at
      )
      ON CONFLICT(skill_id) DO UPDATE SET
        success_count = skills.success_count + :success_delta,
        failure_count = skills.failure_count + :failure_delta,
        updated_at = :updated_at
    `
  ).run({
    skill_id: input.skillId,
    name: input.name,
    version: input.version,
    definition_json: "{}",
    success_delta: input.successDelta,
    failure_delta: input.failureDelta,
    updated_at: input.updatedAt
  });
};

export const getLatestRunByRepoId = (
  db: DatabaseSync,
  repoId: string
): RunRecord | null => {
  const row = prepare(
    db,
    `
      SELECT
        run_id,
        repo_id,
        command,
        task_text,
        status,
        attempt_count,
        selected_skill,
        summary,
        started_at,
        ended_at
      FROM runs
      WHERE repo_id = :repo_id
      ORDER BY started_at DESC, run_id DESC
      LIMIT 1
    `
  ).get({ repo_id: repoId }) as SqliteRow | undefined;

  return row ? mapRun(row) : null;
};
