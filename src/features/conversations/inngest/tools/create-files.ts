import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

import { convex } from "@/lib/convex-client";

import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { ToolExecutionContext } from "./types";
import { runTrackedTool } from "./tracker";

interface CreateFilesToolOptions {
  projectId: Id<"projects">;
  internalKey: string;
  context?: ToolExecutionContext;
}

const paramsSchema = z.object({
  parentId: z.string(),
  files: z
    .array(
      z.object({
        name: z.string().min(1, "File name cannot be empty"),
        content: z.string(),
      }),
    )
    .min(1, "Provide at least one file to create"),
});

export const createCreateFilesTool = ({
  projectId,
  internalKey,
  context,
}: CreateFilesToolOptions) => {
  return createTool({
    name: "createFiles",
    description:
      "Create multiple files at once in the same folder. Use this to batch create files that share the same parent folder. More efficient than creating files one by one.",
    parameters: z.object({
      parentId: z
        .string()
        .describe(
          "The ID of the parent folder. Use empty string for root level. Must be a valid folder ID from listFiles.",
        ),
      files: z
        .array(
          z.object({
            name: z.string().describe("The file name including extension"),
            content: z.string().describe("The file content"),
          }),
        )
        .describe("Array of files to create"),
    }),
    handler: async (params, { step: toolStep }) => {
      const parsed = paramsSchema.safeParse(params);
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const { parentId, files } = parsed.data;
      const fileNames = files.map((f) => f.name);

      try {
        return await runTrackedTool(
          context,
          {
            toolName: "createFiles",
            description:
              files.length === 1
                ? `Creating ${files[0].name}...`
                : `Creating ${files.length} files...`,
            filePaths: fileNames,
          },
          async () => {
            const runner = toolStep?.run
              ? (name: string, fn: () => Promise<string>) =>
                  toolStep.run(name, fn)
              : (_: string, fn: () => Promise<string>) => fn();

            let createdPaths: string[] = [];

            const response = await runner("create-files", async () => {
              let resolvedParentId: Id<"files"> | undefined;

              if (parentId && parentId !== "") {
                try {
                  resolvedParentId = parentId as Id<"files">;
                  const parentFolder = await convex.query(
                    api.system.getFileById,
                    {
                      internalKey,
                      fileId: resolvedParentId,
                    },
                  );
                  if (!parentFolder) {
                    throw new Error(
                      `Parent folder with ID "${parentId}" not found. Use listFiles to get valid folder IDs.`,
                    );
                  }
                  if (parentFolder.type !== "folder") {
                    throw new Error(
                      `The ID "${parentId}" is a file, not a folder. Use a folder ID as parentId.`,
                    );
                  }
                } catch (err) {
                  if (err instanceof Error) throw err;
                  throw new Error(
                    `Invalid parentId "${parentId}". Use listFiles to get valid folder IDs, or use empty string for root level.`,
                  );
                }
              }

              const results = await convex.mutation(api.system.createFiles, {
                internalKey,
                projectId,
                parentId: resolvedParentId,
                files,
              });

              const created = results.filter((r) => !r.error);
              const failed = results.filter((r) => r.error);

              let resMsg = `Created ${created.length} file(s)`;
              if (created.length > 0) {
                resMsg += `: ${created.map((r) => r.name).join(", ")}`;
              }
              if (failed.length > 0) {
                resMsg += `. Failed: ${failed.map((r) => `${r.name} (${r.error})`).join(", ")}`;
              }

              createdPaths = created.map((r) => r.name);
              return resMsg;
            });

            return {
              result: response,
              summary: response,
              filePaths: createdPaths.length > 0 ? createdPaths : fileNames,
            };
          },
        );
      } catch (error) {
        return `Error creating files: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    },
  });
};
