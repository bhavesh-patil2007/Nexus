import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  projects: defineTable({
    name: v.string(),
    ownerId: v.string(),
    updatedAt: v.number(),
    importStatus: v.optional(
      v.union(
        v.literal("importing"),
        v.literal("completed"),
        v.literal("failed"),
      ),
    ),
    exportStatus: v.optional(
      v.union(
        v.literal("exporting"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled"),
      ),
    ),
    exportRepoUrl: v.optional(v.string()),
    importProgress: v.optional(
      v.object({
        status: v.union(
          v.literal("pending"),
          v.literal("running"),
          v.literal("completed"),
          v.literal("failed"),
        ),
        totalFiles: v.number(),
        processedFiles: v.number(),
        successfulFiles: v.number(),
        failedFiles: v.number(),
        skippedFiles: v.number(),
        currentBatch: v.number(),
        totalBatches: v.number(),
        errorMessage: v.optional(v.string()),
        updatedAt: v.number(),
      }),
    ),
    exportProgress: v.optional(
      v.object({
        status: v.union(
          v.literal("pending"),
          v.literal("running"),
          v.literal("completed"),
          v.literal("failed"),
          v.literal("cancelled"),
        ),
        totalFiles: v.number(),
        processedFiles: v.number(),
        successfulFiles: v.number(),
        failedFiles: v.number(),
        skippedFiles: v.number(),
        currentBatch: v.number(),
        totalBatches: v.number(),
        errorMessage: v.optional(v.string()),
        updatedAt: v.number(),
      }),
    ),
    settings: v.optional(
      v.object({
        installCommand: v.optional(v.string()),
        devCommand: v.optional(v.string()),
        envVariables: v.optional(v.record(v.string(), v.string())),
      }),
    ),
  }).index("by_owner", ["ownerId"]),

  files: defineTable({
    projectId: v.id("projects"),
    parentId: v.optional(v.id("files")),
    name: v.string(),
    type: v.union(v.literal("file"), v.literal("folder")),
    content: v.optional(v.string()), // Text files only
    storageId: v.optional(v.id("_storage")), // Binary files only
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_parent", ["parentId"])
    .index("by_project_parent", ["projectId", "parentId"]),

  conversations: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    projectId: v.id("projects"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    status: v.optional(
      v.union(
        v.literal("processing"),
        v.literal("completed"),
        v.literal("cancelled"),
      ),
    ),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_project_status", ["projectId", "status"]),

  executionEvents: defineTable({
    conversationId: v.id("conversations"),
    projectId: v.id("projects"),
    messageId: v.id("messages"),
    executionId: v.string(), // Unique execution run id
    iteration: v.number(),
    eventType: v.union(
      v.literal("tool_start"),
      v.literal("tool_complete"),
      v.literal("tool_fail"),
      v.literal("execution_start"),
      v.literal("execution_complete"),
      v.literal("execution_cancel"),
      v.literal("execution_fail"),
    ),
    toolExecutionId: v.optional(v.string()),
    toolName: v.optional(v.string()),
    description: v.optional(v.string()),
    filePaths: v.optional(v.array(v.string())),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    summary: v.optional(v.string()),
    error: v.optional(v.string()),
  })
    .index("by_message", ["messageId"])
    .index("by_conversation", ["conversationId"])
    .index("by_execution", ["executionId"])
    .index("by_tool_execution", ["toolExecutionId"]),
});
