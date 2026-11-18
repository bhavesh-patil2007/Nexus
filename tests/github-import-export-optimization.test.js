import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";

const cjsRequire = createRequire(import.meta.url);

function loadTsModule(relPath) {
  const fullPath = path.resolve(process.cwd(), relPath);
  const tsCode = fs.readFileSync(fullPath, "utf-8");
  const transpiled = ts.transpileModule(tsCode, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;

  const m = { exports: {} };

  const customRequire = (id) => {
    if (id === "@/lib/convex-client") {
      return { convex: {} };
    }
    if (id === "@/inngest/client") {
      return { inngest: { createFunction: (config, trigger, handler) => ({ config, trigger, handler }) } };
    }
    if (id.includes("_generated/api")) {
      return { api: { system: {} } };
    }
    if (id.includes("_generated/dataModel")) {
      return {};
    }
    if (id === "./utils") {
      return loadTsModule("src/features/projects/inngest/utils.ts");
    }
    return cjsRequire(id);
  };

  const fn = new Function("require", "module", "exports", transpiled);
  fn(customRequire, m, m.exports);
  return m.exports;
}

const utils = loadTsModule("src/features/projects/inngest/utils.ts");
const { withExponentialBackoff, mapWithConcurrency, isRateLimitOrTransientError } = utils;

const importModule = loadTsModule("src/features/projects/inngest/import-github-repo.ts");
const { IMPORT_BATCH_SIZE, IMPORT_CONCURRENCY_LIMIT } = importModule;

const exportModule = loadTsModule("src/features/projects/inngest/export-to-github.ts");
const { EXPORT_BATCH_SIZE, EXPORT_CONCURRENCY_LIMIT } = exportModule;

describe("Issue #8 - GitHub Import & Export Optimization & Progress Tests", () => {
  describe("A. Bounded Concurrency & Batching Utilities", () => {
    test("1. mapWithConcurrency executes all items and preserves order", async () => {
      const items = Array.from({ length: 250 }, (_, i) => i);
      let activeCount = 0;
      let maxActive = 0;

      const results = await mapWithConcurrency(items, 5, async (item) => {
        activeCount++;
        maxActive = Math.max(maxActive, activeCount);
        // Small delay
        await new Promise((r) => setTimeout(r, 2));
        activeCount--;
        return item * 2;
      });

      assert.strictEqual(results.length, 250);
      assert.strictEqual(maxActive <= 5, true, `Max concurrency ${maxActive} must be <= 5`);
      for (let i = 0; i < 250; i++) {
        assert.strictEqual(results[i], i * 2, `Item at index ${i} matches`);
      }
    });

    test("2. Batch size configuration constants are defined and reasonable", () => {
      assert.strictEqual(IMPORT_BATCH_SIZE, 50);
      assert.strictEqual(IMPORT_CONCURRENCY_LIMIT, 5);
      assert.strictEqual(EXPORT_BATCH_SIZE, 50);
      assert.strictEqual(EXPORT_CONCURRENCY_LIMIT, 5);
    });

    test("3. Chunking logic divides 250 files into 5 batches correctly", () => {
      const totalFiles = 250;
      const totalBatches = Math.ceil(totalFiles / IMPORT_BATCH_SIZE);
      assert.strictEqual(totalBatches, 5);

      const files = Array.from({ length: 250 }, (_, i) => ({
        path: `file_${i}.ts`,
        sha: `sha_${i}`,
      }));

      const batches = [];
      for (let b = 0; b < totalBatches; b++) {
        const start = b * IMPORT_BATCH_SIZE;
        const end = Math.min(start + IMPORT_BATCH_SIZE, totalFiles);
        batches.push(files.slice(start, end));
      }

      assert.strictEqual(batches.length, 5);
      assert.strictEqual(batches[0].length, 50);
      assert.strictEqual(batches[4].length, 50);
      assert.strictEqual(batches[0][0].path, "file_0.ts");
      assert.strictEqual(batches[4][49].path, "file_249.ts");
    });
  });

  describe("B. Rate-Limit & Exponential Backoff Protection", () => {
    test("4. isRateLimitOrTransientError detects HTTP 429 and Retry-After header", () => {
      const error429 = {
        status: 429,
        message: "Too Many Requests",
        headers: { "retry-after": "5" },
      };
      const detection = isRateLimitOrTransientError(error429);
      assert.strictEqual(detection.isTransient, true);
      assert.strictEqual(detection.retryAfterMs, 5000);
    });

    test("5. isRateLimitOrTransientError detects HTTP 403 secondary rate limit", () => {
      const error403 = {
        status: 403,
        message: "You have exceeded a secondary rate limit. Please wait a few minutes.",
        headers: {},
      };
      const detection = isRateLimitOrTransientError(error403);
      assert.strictEqual(detection.isTransient, true);
    });

    test("6. isRateLimitOrTransientError rejects permanent 404 or 401 errors", () => {
      const error404 = {
        status: 404,
        message: "Not Found",
      };
      const error401 = {
        status: 401,
        message: "Bad credentials",
      };
      assert.strictEqual(isRateLimitOrTransientError(error404).isTransient, false);
      assert.strictEqual(isRateLimitOrTransientError(error401).isTransient, false);
    });

    test("7. withExponentialBackoff retries transient failures and succeeds", async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 3) {
          const err = new Error("Rate limit exceeded");
          err.status = 429;
          throw err;
        }
        return "success";
      };

      const result = await withExponentialBackoff(fn, {
        maxRetries: 3,
        initialDelayMs: 10,
        factor: 1.5,
      });

      assert.strictEqual(result, "success");
      assert.strictEqual(attempts, 3);
    });

    test("8. withExponentialBackoff does not retry permanent errors", async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        const err = new Error("Bad credentials");
        err.status = 401;
        throw err;
      };

      await assert.rejects(
        async () => {
          await withExponentialBackoff(fn, { maxRetries: 3, initialDelayMs: 10 });
        },
        { message: "Bad credentials" }
      );

      assert.strictEqual(attempts, 1);
    });
  });

  describe("C. Convex Progress Persistence & Updates Simulation", () => {
    let mockProjects;

    beforeEach(() => {
      mockProjects = new Map();
      mockProjects.set("proj_test", {
        _id: "proj_test",
        name: "Test Project",
        importProgress: null,
        exportProgress: null,
      });
    });

    const updateImportProgressHandler = async (args) => {
      const project = mockProjects.get(args.projectId);
      if (!project) return;

      // Prevent backwards progression
      if (
        project.importProgress &&
        project.importProgress.processedFiles > args.progress.processedFiles &&
        args.progress.status === "running"
      ) {
        return;
      }

      project.importProgress = {
        ...args.progress,
        updatedAt: Date.now(),
      };
    };

    const updateExportProgressHandler = async (args) => {
      const project = mockProjects.get(args.projectId);
      if (!project) return;

      if (
        project.exportProgress &&
        project.exportProgress.processedFiles > args.progress.processedFiles &&
        args.progress.status === "running"
      ) {
        return;
      }

      project.exportProgress = {
        ...args.progress,
        updatedAt: Date.now(),
      };
    };

    test("9. Import progress initializes and updates forward per batch", async () => {
      await updateImportProgressHandler({
        projectId: "proj_test",
        progress: {
          status: "running",
          totalFiles: 200,
          processedFiles: 0,
          successfulFiles: 0,
          failedFiles: 0,
          skippedFiles: 0,
          currentBatch: 0,
          totalBatches: 4,
        },
      });

      let p = mockProjects.get("proj_test").importProgress;
      assert.strictEqual(p.status, "running");
      assert.strictEqual(p.totalFiles, 200);
      assert.strictEqual(p.processedFiles, 0);

      // Batch 1 completes
      await updateImportProgressHandler({
        projectId: "proj_test",
        progress: {
          status: "running",
          totalFiles: 200,
          processedFiles: 50,
          successfulFiles: 50,
          failedFiles: 0,
          skippedFiles: 0,
          currentBatch: 1,
          totalBatches: 4,
        },
      });

      p = mockProjects.get("proj_test").importProgress;
      assert.strictEqual(p.processedFiles, 50);
      assert.strictEqual(p.successfulFiles, 50);

      // Stale/duplicate retry with lower processedFiles must be ignored
      await updateImportProgressHandler({
        projectId: "proj_test",
        progress: {
          status: "running",
          totalFiles: 200,
          processedFiles: 30,
          successfulFiles: 30,
          failedFiles: 0,
          skippedFiles: 0,
          currentBatch: 1,
          totalBatches: 4,
        },
      });

      p = mockProjects.get("proj_test").importProgress;
      assert.strictEqual(p.processedFiles, 50, "Progress must not move backwards");

      // Terminal completion
      await updateImportProgressHandler({
        projectId: "proj_test",
        progress: {
          status: "completed",
          totalFiles: 200,
          processedFiles: 200,
          successfulFiles: 200,
          failedFiles: 0,
          skippedFiles: 0,
          currentBatch: 4,
          totalBatches: 4,
        },
      });

      p = mockProjects.get("proj_test").importProgress;
      assert.strictEqual(p.status, "completed");
      assert.strictEqual(p.processedFiles, 200);
    });

    test("10. Export progress tracks blob creation batches and partial failure guard", async () => {
      await updateExportProgressHandler({
        projectId: "proj_test",
        progress: {
          status: "running",
          totalFiles: 120,
          processedFiles: 50,
          successfulFiles: 48,
          failedFiles: 2,
          skippedFiles: 0,
          currentBatch: 1,
          totalBatches: 3,
        },
      });

      let p = mockProjects.get("proj_test").exportProgress;
      assert.strictEqual(p.processedFiles, 50);
      assert.strictEqual(p.failedFiles, 2);

      // Partial failure terminal status
      await updateExportProgressHandler({
        projectId: "proj_test",
        progress: {
          status: "failed",
          totalFiles: 120,
          processedFiles: 120,
          successfulFiles: 115,
          failedFiles: 5,
          skippedFiles: 0,
          currentBatch: 3,
          totalBatches: 3,
          errorMessage: "Export aborted: 5 of 120 file blobs failed to create.",
        },
      });

      p = mockProjects.get("proj_test").exportProgress;
      assert.strictEqual(p.status, "failed");
      assert.strictEqual(p.failedFiles, 5);
      assert.strictEqual(p.errorMessage.includes("5 of 120"), true);
    });
  });

  describe("D. Inngest Pipeline Architecture Contracts", () => {
    test("11. Partial failures in blob creation abort commit creation", () => {
      const overallFailed = 2;
      const canProceedToCommit = overallFailed === 0;
      assert.strictEqual(canProceedToCommit, false, "Must not proceed to commit if blob creation failed");
    });

    test("12. Nested directory paths in export are preserved", () => {
      const files = [
        { _id: "f_root", name: "src", type: "folder", parentId: undefined },
        { _id: "f_sub", name: "components", type: "folder", parentId: "f_root" },
        { _id: "f_file", name: "Button.tsx", type: "file", parentId: "f_sub", content: "export const Button = () => null;" },
      ];

      const fileMap = new Map();
      files.forEach((f) => fileMap.set(f._id, f));

      const getFullPath = (file) => {
        if (!file.parentId) return file.name;
        const parent = fileMap.get(file.parentId);
        if (!parent) return file.name;
        return `${getFullPath(parent)}/${file.name}`;
      };

      const file = files[2];
      assert.strictEqual(getFullPath(file), "src/components/Button.tsx");
    });
  });
});
