import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createRepoScopedDb,
  closeDatabase,
  openDatabase,
  upsertRepo,
  type MemoryItemRecord,
  type CreateMemoryItemInput
} from "../storage/db.js";

import { isNearDuplicate, normalizeMemoryContent } from "./dedupe.js";

export interface MemoryRecord {
  memoryId: string;
  category: string;
  content: string;
  contentHash: string;
  score: number;
  confidence: number;
  useCount: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AddMemoryInput {
  category: string;
  content: string;
  score?: number;
  confidence?: number;
}

export interface MemoryServiceOptions {
  memoraHome: string;
  repoId: string;
  repoRoot?: string;
}

const computeHash = (value: string): string => {
  return createHash("sha256").update(value).digest("hex");
};

const mapRecord = (record: MemoryItemRecord): MemoryRecord => ({
  memoryId: record.memoryId,
  category: record.category,
  content: record.content,
  contentHash: record.contentHash,
  score: record.score,
  confidence: record.confidence,
  useCount: record.useCount,
  archived: record.archived,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt
});

const nowIso = (): string => new Date().toISOString();

const buildEmbedding = (normalized: string): number[] => {
  const tokens = normalized.split(" ").filter(Boolean);
  const dims = 8;
  const vector = new Array<number>(dims).fill(0);

  for (const token of tokens) {
    const hash = createHash("sha256").update(token).digest();
    for (let index = 0; index < dims; index += 1) {
      vector[index] += hash[index] / 255;
    }
  }

  if (tokens.length === 0) {
    return vector;
  }

  return vector.map((value) => value / tokens.length);
};

const toEmbeddingBlob = (embedding: number[]): Buffer => {
  return Buffer.from(Float32Array.from(embedding).buffer);
};

const getEmbeddingCachePath = (
  memoraHome: string,
  repoId: string,
  contentHash: string
): string => {
  return path.join(
    memoraHome,
    "repos",
    repoId,
    "cache",
    "embeddings",
    `${contentHash}.json`
  );
};

const loadOrCreateEmbedding = async (
  memoraHome: string,
  repoId: string,
  contentHash: string,
  normalized: string
): Promise<number[]> => {
  const cachePath = getEmbeddingCachePath(memoraHome, repoId, contentHash);

  try {
    const raw = await readFile(cachePath, "utf8");
    const parsed = JSON.parse(raw) as { embedding?: number[] };
    if (Array.isArray(parsed.embedding)) {
      return parsed.embedding;
    }
  } catch {
    // Continue to create embedding.
  }

  const embedding = buildEmbedding(normalized);
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify({ embedding })}\n`, "utf8");
  return embedding;
};

const upsertMemoryEmbedding = (input: {
  db: ReturnType<typeof openDatabase>;
  repoId: string;
  memoryId: string;
  embedding: number[];
}): void => {
  input.db
    .prepare(
      `
        INSERT INTO memory_embeddings (memory_id, repo_id, embedding_blob, dims, updated_at)
        VALUES (:memory_id, :repo_id, :embedding_blob, :dims, :updated_at)
        ON CONFLICT(memory_id) DO UPDATE SET
          repo_id = excluded.repo_id,
          embedding_blob = excluded.embedding_blob,
          dims = excluded.dims,
          updated_at = excluded.updated_at
      `
    )
    .run({
      memory_id: input.memoryId,
      repo_id: input.repoId,
      embedding_blob: toEmbeddingBlob(input.embedding),
      dims: input.embedding.length,
      updated_at: nowIso()
    });
};

export class MemoryService {
  private readonly memoraHome: string;
  private readonly repoId: string;
  private readonly repoRoot: string;

  constructor(options: MemoryServiceOptions) {
    this.memoraHome = options.memoraHome;
    this.repoId = options.repoId;
    this.repoRoot = options.repoRoot ?? `repo://${options.repoId}`;
  }

  private ensureRepoRecord(db: ReturnType<typeof openDatabase>): void {
    const timestamp = nowIso();
    upsertRepo(db, {
      repoId: this.repoId,
      repoRoot: this.repoRoot,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  async list(
    input: { category?: string; limit?: number; minScore?: number } = {}
  ): Promise<MemoryRecord[]> {
    const db = openDatabase({ memoraHome: this.memoraHome });
    try {
      this.ensureRepoRecord(db);
      const repoDb = createRepoScopedDb(db, this.repoId);
      const all = repoDb.listMemoryItems().map(mapRecord);

      const filtered = all.filter((item) => {
        if (input.category && item.category !== input.category) {
          return false;
        }
        if (typeof input.minScore === "number" && item.score < input.minScore) {
          return false;
        }
        return true;
      });

      const sorted = filtered.sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return left.createdAt.localeCompare(right.createdAt);
      });

      return typeof input.limit === "number"
        ? sorted.slice(0, input.limit)
        : sorted;
    } finally {
      closeDatabase(db);
    }
  }

  async add(input: AddMemoryInput): Promise<{
    record: MemoryRecord;
    deduped: boolean;
    reason?: "exact" | "near";
  }> {
    const normalized = normalizeMemoryContent(input.content);
    const contentHash = computeHash(normalized);

    const db = openDatabase({ memoraHome: this.memoraHome });
    try {
      this.ensureRepoRecord(db);
      const repoDb = createRepoScopedDb(db, this.repoId);
      const existing = repoDb.listMemoryItems();

      const exact = existing.find((item) => item.contentHash === contentHash);
      if (exact) {
        const embedding = await loadOrCreateEmbedding(
          this.memoraHome,
          this.repoId,
          contentHash,
          normalized
        );
        const updated = repoDb.updateMemoryItem(exact.memoryId, {
          score: Math.max(exact.score, input.score ?? exact.score),
          confidence: Math.max(
            exact.confidence,
            input.confidence ?? exact.confidence
          ),
          useCount: exact.useCount + 1,
          updatedAt: nowIso()
        });
        upsertMemoryEmbedding({
          db,
          repoId: this.repoId,
          memoryId: updated.memoryId,
          embedding
        });
        return { record: mapRecord(updated), deduped: true, reason: "exact" };
      }

      const near = existing.find((item) =>
        isNearDuplicate(item.content, input.content, 0.8)
      );
      if (near) {
        const embedding = await loadOrCreateEmbedding(
          this.memoraHome,
          this.repoId,
          near.contentHash,
          normalizeMemoryContent(near.content)
        );
        const updated = repoDb.updateMemoryItem(near.memoryId, {
          score: Math.max(near.score, input.score ?? near.score),
          confidence: Math.max(
            near.confidence,
            input.confidence ?? near.confidence
          ),
          useCount: near.useCount + 1,
          updatedAt: nowIso()
        });
        upsertMemoryEmbedding({
          db,
          repoId: this.repoId,
          memoryId: updated.memoryId,
          embedding
        });
        return { record: mapRecord(updated), deduped: true, reason: "near" };
      }

      const now = nowIso();
      const created = repoDb.insertMemoryItem({
        memoryId: randomUUID(),
        category: input.category,
        content: input.content,
        contentHash,
        score: input.score ?? 0.5,
        confidence: input.confidence ?? 0.5,
        createdAt: now,
        updatedAt: now
      } as CreateMemoryItemInput);

      const embedding = await loadOrCreateEmbedding(
        this.memoraHome,
        this.repoId,
        contentHash,
        normalized
      );
      upsertMemoryEmbedding({
        db,
        repoId: this.repoId,
        memoryId: created.memoryId,
        embedding
      });

      return { record: mapRecord(created), deduped: false };
    } finally {
      closeDatabase(db);
    }
  }

  async remove(memoryId: string): Promise<boolean> {
    const db = openDatabase({ memoraHome: this.memoraHome });
    try {
      this.ensureRepoRecord(db);
      const repoDb = createRepoScopedDb(db, this.repoId);
      return repoDb.deleteMemoryItem(memoryId);
    } finally {
      closeDatabase(db);
    }
  }
}
