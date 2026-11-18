import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

import { convex } from "@/lib/convex-client";

import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { ToolExecutionContext } from "./types";
import { runTrackedTool } from "./tracker";

interface ReadFilesToolOptions {
  internalKey: string;
  context?: ToolExecutionContext;
}

const paramsSchema = z.object({
  fileIds: z
    .array(z.string().min(1, "File ID cannot be empty"))
    .min(1, "Provide at least one file ID"),
});

export const createReadFilesTool = ({
  internalKey,
  context,
}: ReadFilesToolOptions) => {
  return createTool({
    name: "readFiles",
    description:
      "Read the content of files from the project. Returns file contents.",
    parameters: z.object({
      fileIds: z.array(z.string()).describe("Array of file IDs to read"),
    }),
    handler: async (params, { step: toolStep }) => {
      const parsed = paramsSchema.safeParse(params);
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const { fileIds } = parsed.data;

      try {
        return await runTrackedTool(
          context,
          {
            toolName: "readFiles",
            description:
              fileIds.length === 1
                ? `Reading file ${fileIds[0]}...`
                : `Reading ${fileIds.length} files...`,
          },
          async () => {
            const runner = toolStep?.run
              ? (name: string, fn: () => Promise<string>) =>
                  toolStep.run(name, fn)
              : (_: string, fn: () => Promise<string>) => fn();

            const filePaths: string[] = [];

            const jsonOutput = await runner("read-files", async () => {
              const results: { id: string; name: string; content: string }[] =
                [];

              for (const fileId of fileIds) {
                const file = await convex.query(api.system.getFileById, {
                  internalKey,
                  fileId: fileId as Id<"files">,
                });

                if (file && file.content) {
                  results.push({
                    id: file._id,
                    name: file.name,
                    content: file.content,
                  });
                  filePaths.push(file.name);
                }
              }

              if (results.length === 0) {
                throw new Error(
                  "No files found with provided IDs. Use listFiles to get valid fileIDs.",
                );
              }

              return JSON.stringify(results);
            });

            return {
              result: jsonOutput,
              summary:
                filePaths.length === 1
                  ? `Read ${filePaths[0]}`
                  : `Read ${filePaths.length} files (${filePaths.join(", ")})`,
              filePaths: filePaths.length > 0 ? filePaths : fileIds,
            };
          },
        );
      } catch (error) {
        return `Error reading files: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    },
  });
};
