import ky from "ky";
import { Octokit } from "octokit";
import { isBinaryFile } from "isbinaryfile";
import { NonRetriableError } from "inngest";

import { convex } from "@/lib/convex-client";
import { inngest } from "@/inngest/client";

import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { mapWithConcurrency, withExponentialBackoff } from "./utils";

interface ImportGithubRepoEvent {
  owner: string;
  repo: string;
  projectId: Id<"projects">;
  githubToken: string;
}

// Configurable constants for chunking and concurrency
export const IMPORT_BATCH_SIZE = 50;
export const IMPORT_CONCURRENCY_LIMIT = 5;

export const importGithubRepo = inngest.createFunction(
  {
    id: "import-github-repo",
    onFailure: async ({ event, step }) => {
      const internalKey = process.env.NEXUS_CONVEX_INTERNAL_KEY;
      if (!internalKey) return;

      const { projectId } = event.data.event.data as ImportGithubRepoEvent;
      const errorMsg = event.data.error?.message || "Import failed";

      await step.run("set-failed-status", async () => {
        await convex.mutation(api.system.updateImportStatus, {
          internalKey,
          projectId,
          status: "failed",
        });

        await convex.mutation(api.system.updateImportProgress, {
          internalKey,
          projectId,
          progress: {
            status: "failed",
            totalFiles: 0,
            processedFiles: 0,
            successfulFiles: 0,
            failedFiles: 1,
            skippedFiles: 0,
            currentBatch: 0,
            totalBatches: 0,
            errorMessage: errorMsg,
          },
        });
      });
    },
  },
  { event: "github/import.repo" },
  async ({ event, step }) => {
    const { owner, repo, projectId, githubToken } =
      event.data as ImportGithubRepoEvent;

    const internalKey = process.env.NEXUS_CONVEX_INTERNAL_KEY;
    if (!internalKey) {
      throw new NonRetriableError(
        "NEXUS_CONVEX_INTERNAL_KEY is not configured",
      );
    }

    const octokit = new Octokit({ auth: githubToken });

    // Cleanup any existing files in the project
    await step.run("cleanup-project", async () => {
      await convex.mutation(api.system.cleanup, {
        internalKey,
        projectId,
      });
    });

    const tree = await step.run("fetch-repo-tree", async () => {
      return await withExponentialBackoff(async () => {
        try {
          const { data } = await octokit.rest.git.getTree({
            owner,
            repo,
            tree_sha: "main",
            recursive: "1",
          });

          return data;
        } catch {
          // Fallback to master branch
          const { data } = await octokit.rest.git.getTree({
            owner,
            repo,
            tree_sha: "master",
            recursive: "1",
          });

          return data;
        }
      });
    });

    // Sort folders by depth so parents are created before children
    const folders = tree.tree
      .filter((item) => item.type === "tree" && item.path)
      .sort((a, b) => {
        const aDepth = a.path ? a.path.split("/").length : 0;
        const bDepth = b.path ? b.path.split("/").length : 0;

        return aDepth - bDepth;
      });

    // Create folders sequentially by depth to maintain hierarchical parentId mapping
    const folderIdMap = await step.run("create-folders", async () => {
      const map: Record<string, Id<"files">> = {};

      for (const folder of folders) {
        if (!folder.path) continue;

        const pathParts = folder.path.split("/");
        const name = pathParts.pop()!;
        const parentPath = pathParts.join("/");
        const parentId = parentPath ? map[parentPath] : undefined;

        const folderId = await convex.mutation(api.system.createFolder, {
          internalKey,
          projectId,
          name,
          parentId,
        });

        map[folder.path] = folderId;
      }

      return map;
    });

    // Get all files (blobs) from the tree
    const allFiles = tree.tree.filter(
      (item) => item.type === "blob" && item.path && item.sha,
    );

    const totalFiles = allFiles.length;
    const totalBatches = Math.max(1, Math.ceil(totalFiles / IMPORT_BATCH_SIZE));

    // Initialize progress record in Convex
    await step.run("init-progress", async () => {
      await convex.mutation(api.system.updateImportProgress, {
        internalKey,
        projectId,
        progress: {
          status: totalFiles === 0 ? "completed" : "running",
          totalFiles,
          processedFiles: 0,
          successfulFiles: 0,
          failedFiles: 0,
          skippedFiles: 0,
          currentBatch: 0,
          totalBatches,
        },
      });
    });

    let overallProcessed = 0;
    let overallSuccessful = 0;
    let overallFailed = 0;
    let overallSkipped = 0;

    // Process files in chunked batches across Inngest steps
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const start = batchIndex * IMPORT_BATCH_SIZE;
      const end = Math.min(start + IMPORT_BATCH_SIZE, totalFiles);
      const batchFiles = allFiles.slice(start, end);

      if (batchFiles.length === 0) continue;

      const batchResult = await step.run(
        `process-file-batch-${batchIndex + 1}-of-${totalBatches}`,
        async () => {
          let batchSuccess = 0;
          let batchFailed = 0;
          let batchSkipped = 0;

          await mapWithConcurrency(
            batchFiles,
            IMPORT_CONCURRENCY_LIMIT,
            async (file) => {
              if (!file.path || !file.sha) {
                batchSkipped++;
                return;
              }

              try {
                // Fetch blob with exponential backoff & rate-limit handling
                const { data: blob } = await withExponentialBackoff(
                  async () => {
                    return await octokit.rest.git.getBlob({
                      owner,
                      repo,
                      file_sha: file.sha!,
                    });
                  },
                );

                const buffer = Buffer.from(blob.content, "base64");
                let isBinary = false;
                try {
                  isBinary = await isBinaryFile(buffer);
                } catch {
                  isBinary = false;
                }

                const pathParts = file.path.split("/");
                const name = pathParts.pop()!;
                const parentPath = pathParts.join("/");
                const parentId = parentPath
                  ? folderIdMap[parentPath]
                  : undefined;

                if (isBinary) {
                  try {
                    const uploadUrl = await convex.mutation(
                      api.system.generateUploadUrl,
                      { internalKey },
                    );

                    const { storageId } = await ky
                      .post(uploadUrl, {
                        headers: { "Content-Type": "application/octet-stream" },
                        body: buffer,
                      })
                      .json<{ storageId: Id<"_storage"> }>();

                    await convex.mutation(api.system.createBinaryFile, {
                      internalKey,
                      projectId,
                      name,
                      storageId,
                      parentId,
                    });
                    batchSuccess++;
                  } catch (binErr) {
                    // Non-critical binary file failure should not abort the whole import
                    console.warn(
                      `Binary file upload skipped/failed for ${file.path}:`,
                      binErr,
                    );
                    batchFailed++;
                  }
                } else {
                  const content = buffer.toString("utf-8");

                  await convex.mutation(api.system.createFile, {
                    internalKey,
                    projectId,
                    name,
                    content,
                    parentId,
                  });
                  batchSuccess++;
                }
              } catch (err) {
                console.error(`Failed to import file: ${file.path}`, err);
                batchFailed++;
              }
            },
          );

          return {
            processed: batchFiles.length,
            success: batchSuccess,
            failed: batchFailed,
            skipped: batchSkipped,
          };
        },
      );

      overallProcessed += batchResult.processed;
      overallSuccessful += batchResult.success;
      overallFailed += batchResult.failed;
      overallSkipped += batchResult.skipped;

      // Update progress in Convex after each batch
      await step.run(
        `update-progress-batch-${batchIndex + 1}-of-${totalBatches}`,
        async () => {
          await convex.mutation(api.system.updateImportProgress, {
            internalKey,
            projectId,
            progress: {
              status: "running",
              totalFiles,
              processedFiles: overallProcessed,
              successfulFiles: overallSuccessful,
              failedFiles: overallFailed,
              skippedFiles: overallSkipped,
              currentBatch: batchIndex + 1,
              totalBatches,
            },
          });
        },
      );
    }

    // Terminal completion status
    await step.run("set-completed-status", async () => {
      await convex.mutation(api.system.updateImportStatus, {
        internalKey,
        projectId,
        status: "completed",
      });

      await convex.mutation(api.system.updateImportProgress, {
        internalKey,
        projectId,
        progress: {
          status: "completed",
          totalFiles,
          processedFiles: overallProcessed,
          successfulFiles: overallSuccessful,
          failedFiles: overallFailed,
          skippedFiles: overallSkipped,
          currentBatch: totalBatches,
          totalBatches,
        },
      });
    });

    return {
      success: true,
      projectId,
      totalFiles,
      importedFiles: overallSuccessful,
      failedFiles: overallFailed,
    };
  },
);
