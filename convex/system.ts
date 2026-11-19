import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

const validateInternalKey = (key: string) => {
  const internalKey = process.env.NEXUS_CONVEX_INTERNAL_KEY;

  if (!internalKey)
    throw new Error("NEXUS_CONVEX_INTERNAL_KEY is not configured");

  if (key !== internalKey) throw new Error("Invalid internal key");
};

export const getConversationById = query({
  args: {
    conversationId: v.id("conversations"),
    internalKey: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    return await ctx.db.get(args.conversationId);
  },
});

export const getProjectById = query({
  args: {
    projectId: v.id("projects"),
    internalKey: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    return await ctx.db.get(args.projectId);
  },
});

export const createMessage = mutation({
  args: {
    internalKey: v.string(),
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
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      projectId: args.projectId,
      role: args.role,
      content: args.content,
      status: args.status,
    });

    await ctx.db.patch(args.conversationId, {
      updatedAt: Date.now(),
    });

    return messageId;
  },
});

export const updateMessageContent = mutation({
  args: {
    internalKey: v.string(),
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const message = await ctx.db.get("messages", args.messageId);
    if (!message) return;

    // Prevent overwriting a terminal state
    if (message.status === "cancelled") {
      return;
    }

    await ctx.db.patch(args.messageId, {
      content: args.content,
      status: "completed" as const,
    });
  },
});

export const updateMessageStreamContent = mutation({
  args: {
    internalKey: v.string(),
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const message = await ctx.db.get("messages", args.messageId);
    if (!message) return;

    // Do not stream into cancelled or already completed message
    if (message.status === "cancelled" || message.status === "completed") {
      return;
    }

    await ctx.db.patch(args.messageId, {
      content: args.content,
      // Keep status as processing while streaming
      status: "processing" as const,
    });
  },
});

export const updateMessageStatus = mutation({
  args: {
    internalKey: v.string(),
    messageId: v.id("messages"),
    status: v.union(
      v.literal("processing"),
      v.literal("completed"),
      v.literal("cancelled"),
    ),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const message = await ctx.db.get("messages", args.messageId);
    if (!message) return;

    // Terminal state protection: if already cancelled, ignore stale transitions
    if (message.status === "cancelled" && args.status !== "cancelled") {
      return;
    }

    await ctx.db.patch(args.messageId, {
      status: args.status,
    });
  },
});

export const getProcessingMessages = query({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    return await ctx.db
      .query("messages")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "processing"),
      )
      .collect();
  },
});

// Used for Agent conversation context
export const getRecentMessages = query({
  args: {
    internalKey: v.string(),
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("asc")
      .collect();

    const limit = args.limit ?? 10;
    return messages.slice(-limit);
  },
});

// Used for Agent to update conversation title
export const updateConversationTitle = mutation({
  args: {
    internalKey: v.string(),
    conversationId: v.id("conversations"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    await ctx.db.patch(args.conversationId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

// Used for Agent "ListFiles" tool
export const getProjectFiles = query({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    return await ctx.db
      .query("files")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

// Used for Agent "ReadFiles" tool
export const getFileById = query({
  args: {
    internalKey: v.string(),
    fileId: v.id("files"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    return await ctx.db.get(args.fileId);
  },
});

// Used for Agent "UpdateFile" tool
export const updateFile = mutation({
  args: {
    internalKey: v.string(),
    fileId: v.id("files"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const file = await ctx.db.get(args.fileId);

    if (!file) {
      throw new Error("File not found");
    }

    await ctx.db.patch(args.fileId, {
      content: args.content,
      updatedAt: Date.now(),
    });

    return args.fileId;
  },
});

// Used for Agent "CreateFile" tool
export const createFile = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    name: v.string(),
    content: v.string(),
    parentId: v.optional(v.id("files")),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const files = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", args.projectId).eq("parentId", args.parentId),
      )
      .collect();

    const existing = files.find(
      (file) => file.name === args.name,
    );

    if (existing) throw new Error("An item with this name already exists");

    const fileId = await ctx.db.insert("files", {
      projectId: args.projectId,
      name: args.name,
      content: args.content,
      type: "file",
      parentId: args.parentId,
      updatedAt: Date.now(),
    });

    return fileId;
  },
});

// Used for Agent bulk "CreateFiles" tool
export const createFiles = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    parentId: v.optional(v.id("files")),
    files: v.array(
      v.object({
        name: v.string(),
        content: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const existingFiles = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", args.projectId).eq("parentId", args.parentId),
      )
      .collect();

    const results: { name: string; fileId: string; error?: string }[] = [];

    for (const file of args.files) {
      const existing = existingFiles.find(
        (f) => f.name === file.name,
      );

      if (existing) {
        results.push({
          name: file.name,
          fileId: existing._id,
          error: "An item with this name already exists",
        });
        continue;
      }

      const fileId = await ctx.db.insert("files", {
        projectId: args.projectId,
        name: file.name,
        content: file.content,
        type: "file",
        parentId: args.parentId,
        updatedAt: Date.now(),
      });

      results.push({ name: file.name, fileId });
    }

    return results;
  },
});

// Used for Agent "CreateFolder" tool
export const createFolder = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    name: v.string(),
    parentId: v.optional(v.id("files")),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const files = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", args.projectId).eq("parentId", args.parentId),
      )
      .collect();

    const existing = files.find(
      (file) => file.name === args.name,
    );

    if (existing) {
      throw new Error("An item with this name already exists");
    }

    const fileId = await ctx.db.insert("files", {
      projectId: args.projectId,
      name: args.name,
      type: "folder",
      parentId: args.parentId,
      updatedAt: Date.now(),
    });

    return fileId;
  },
});

// Used for Agent "RenameFile" tool
export const renameFile = mutation({
  args: {
    internalKey: v.string(),
    fileId: v.id("files"),
    newName: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const file = await ctx.db.get(args.fileId);
    if (!file) {
      throw new Error("File not found");
    }

    const siblings = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", file.projectId).eq("parentId", file.parentId),
      )
      .collect();

    const existing = siblings.find(
      (sibling) =>
        sibling.name === args.newName &&
        sibling._id !== args.fileId,
    );

    if (existing) {
      throw new Error(`An item named "${args.newName}" already exists`);
    }

    await ctx.db.patch(args.fileId, {
      name: args.newName,
      updatedAt: Date.now(),
    });

    return args.fileId;
  },
});

// Used for Agent "DeleteFile" tool
export const deleteFile = mutation({
  args: {
    internalKey: v.string(),
    fileId: v.id("files"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const file = await ctx.db.get(args.fileId);
    if (!file) {
      throw new Error("File not found");
    }

    // Recursively delete file/folder and all descendants
    const deleteRecursive = async (fileId: typeof args.fileId) => {
      const item = await ctx.db.get(fileId);

      if (!item) return;

      // If it's a folder, delete all children first
      if (item.type === "folder") {
        const children = await ctx.db
          .query("files")
          .withIndex("by_project_parent", (q) =>
            q.eq("projectId", item.projectId).eq("parentId", fileId),
          )
          .collect();

        for (const child of children) {
          await deleteRecursive(child._id);
        }
      }

      // Delete storage file if it exists
      if (item.storageId) await ctx.storage.delete(item.storageId);

      // Delete the file/folder itself
      await ctx.db.delete(fileId);
    };

    await deleteRecursive(args.fileId);

    return args.fileId;
  },
});

export const cleanup = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const files = await ctx.db
      .query("files")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const file of files) {
      // Delete storage file if it exists
      if (file.storageId) await ctx.storage.delete(file.storageId);

      await ctx.db.delete(file._id);
    }

    return { deleted: files.length };
  },
});

export const generateUploadUrl = mutation({
  args: {
    internalKey: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);
    return await ctx.storage.generateUploadUrl();
  },
});

export const createBinaryFile = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    name: v.string(),
    storageId: v.id("_storage"),
    parentId: v.optional(v.id("files")),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const files = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", args.projectId).eq("parentId", args.parentId),
      )
      .collect();

    const existing = files.find(
      (file) => file.name === args.name,
    );

    if (existing) throw new Error("An item with this name already exists");

    const fileId = await ctx.db.insert("files", {
      projectId: args.projectId,
      name: args.name,
      type: "file",
      storageId: args.storageId,
      parentId: args.parentId,
      updatedAt: Date.now(),
    });

    return fileId;
  },
});

export const updateImportStatus = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    status: v.optional(
      v.union(
        v.literal("importing"),
        v.literal("completed"),
        v.literal("failed"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    await ctx.db.patch("projects", args.projectId, {
      importStatus: args.status,
      updatedAt: Date.now(),
    });
  },
});

export const updateImportProgress = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    progress: v.object({
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
    }),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const project = await ctx.db.get("projects", args.projectId);
    if (!project) return;

    // Prevent backwards progression if an older retry attempts to overwrite forward progress
    if (
      project.importProgress &&
      project.importProgress.processedFiles > args.progress.processedFiles &&
      args.progress.status === "running"
    ) {
      return;
    }

    const now = Date.now();
    await ctx.db.patch("projects", args.projectId, {
      importProgress: {
        ...args.progress,
        updatedAt: now,
      },
      updatedAt: now,
    });
  },
});

export const updateExportStatus = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    status: v.optional(
      v.union(
        v.literal("exporting"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled"),
      ),
    ),
    repoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    await ctx.db.patch("projects", args.projectId, {
      exportStatus: args.status,
      exportRepoUrl: args.repoUrl,
      updatedAt: Date.now(),
    });
  },
});

export const updateExportProgress = mutation({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
    progress: v.object({
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
    }),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const project = await ctx.db.get("projects", args.projectId);
    if (!project) return;

    // Prevent backwards progression if an older retry attempts to overwrite forward progress
    if (
      project.exportProgress &&
      project.exportProgress.processedFiles > args.progress.processedFiles &&
      args.progress.status === "running"
    ) {
      return;
    }

    const now = Date.now();
    await ctx.db.patch("projects", args.projectId, {
      exportProgress: {
        ...args.progress,
        updatedAt: now,
      },
      updatedAt: now,
    });
  },
});

export const getProjectFilesWithUrls = query({
  args: {
    internalKey: v.string(),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const files = await ctx.db
      .query("files")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    return await Promise.all(
      files.map(async (file) => {
        if (file.storageId) {
          const url = await ctx.storage.getUrl(file.storageId);
          return { ...file, storageUrl: url };
        }
        return { ...file, storageUrl: null };
      }),
    );
  },
});

export const createProject = mutation({
  args: {
    internalKey: v.string(),
    name: v.string(),
    ownerId: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const projectId = await ctx.db.insert("projects", {
      name: args.name,
      ownerId: args.ownerId,
      updatedAt: Date.now(),
      importStatus: "importing",
    });

    return projectId;
  },
});

export const createProjectWithConversation = mutation({
  args: {
    internalKey: v.string(),
    projectName: v.string(),
    conversationTitle: v.string(),
    ownerId: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const now = Date.now();

    const projectId = await ctx.db.insert("projects", {
      name: args.projectName,
      ownerId: args.ownerId,
      updatedAt: now,
    });

    const conversationId = await ctx.db.insert("conversations", {
      projectId,
      title: args.conversationTitle,
      updatedAt: now,
    });

    return { projectId, conversationId };
  },
});

// Execution Progress & Tool Activity Mutations and Queries
export const recordExecutionStart = mutation({
  args: {
    internalKey: v.string(),
    conversationId: v.id("conversations"),
    projectId: v.id("projects"),
    messageId: v.id("messages"),
    executionId: v.string(),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const message = await ctx.db.get("messages", args.messageId);
    if (!message || message.status === "cancelled") return;

    // Idempotency check: see if execution_start already exists
    const existing = await ctx.db
      .query("executionEvents")
      .withIndex("by_execution", (q) => q.eq("executionId", args.executionId))
      .filter((q) => q.eq(q.field("eventType"), "execution_start"))
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("executionEvents", {
      conversationId: args.conversationId,
      projectId: args.projectId,
      messageId: args.messageId,
      executionId: args.executionId,
      iteration: 0,
      eventType: "execution_start",
      status: "running",
      startedAt: Date.now(),
      summary: "Assistant execution started",
    });
  },
});

export const recordToolStart = mutation({
  args: {
    internalKey: v.string(),
    conversationId: v.id("conversations"),
    projectId: v.id("projects"),
    messageId: v.id("messages"),
    executionId: v.string(),
    iteration: v.number(),
    toolExecutionId: v.string(),
    toolName: v.string(),
    description: v.string(),
    filePaths: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const message = await ctx.db.get("messages", args.messageId);
    if (!message || message.status === "cancelled") return;

    // Verify conversation matches message
    if (message.conversationId !== args.conversationId) {
      throw new Error("Message does not belong to specified conversation");
    }

    // Check if tool execution event already exists (idempotency)
    const existing = await ctx.db
      .query("executionEvents")
      .withIndex("by_tool_execution", (q) =>
        q.eq("toolExecutionId", args.toolExecutionId),
      )
      .first();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("executionEvents", {
      conversationId: args.conversationId,
      projectId: args.projectId,
      messageId: args.messageId,
      executionId: args.executionId,
      iteration: args.iteration,
      eventType: "tool_start",
      toolExecutionId: args.toolExecutionId,
      toolName: args.toolName,
      description: args.description,
      filePaths: args.filePaths,
      status: "running",
      startedAt: Date.now(),
    });
  },
});

export const recordToolComplete = mutation({
  args: {
    internalKey: v.string(),
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    toolExecutionId: v.string(),
    summary: v.string(),
    filePaths: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const message = await ctx.db.get("messages", args.messageId);
    if (!message || message.status === "cancelled") return;

    const event = await ctx.db
      .query("executionEvents")
      .withIndex("by_tool_execution", (q) =>
        q.eq("toolExecutionId", args.toolExecutionId),
      )
      .first();

    if (!event) return;

    // If already terminal (e.g., cancelled or already failed/completed), do not overwrite with stale data
    if (event.status === "cancelled") return;

    await ctx.db.patch("executionEvents", event._id, {
      status: "completed",
      eventType: "tool_complete",
      completedAt: Date.now(),
      summary: args.summary,
      ...(args.filePaths ? { filePaths: args.filePaths } : {}),
    });
  },
});

export const recordToolFail = mutation({
  args: {
    internalKey: v.string(),
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    toolExecutionId: v.string(),
    error: v.string(),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const message = await ctx.db.get("messages", args.messageId);
    if (!message || message.status === "cancelled") return;

    const event = await ctx.db
      .query("executionEvents")
      .withIndex("by_tool_execution", (q) =>
        q.eq("toolExecutionId", args.toolExecutionId),
      )
      .first();

    if (!event) return;
    if (event.status === "cancelled") return;

    await ctx.db.patch("executionEvents", event._id, {
      status: "failed",
      eventType: "tool_fail",
      completedAt: Date.now(),
      error: args.error,
      summary: args.summary ?? `Tool execution failed: ${args.error}`,
    });
  },
});

export const recordExecutionEnd = mutation({
  args: {
    internalKey: v.string(),
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    executionId: v.string(),
    status: v.union(
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("failed"),
    ),
    summary: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    const message = await ctx.db.get("messages", args.messageId);
    if (!message) return;

    // If cancelled already, do not overwrite terminal cancelled status with completed/failed
    if (message.status === "cancelled" && args.status !== "cancelled") {
      return;
    }

    // Mark any running tool events for this execution as cancelled/completed/failed
    const runningEvents = await ctx.db
      .query("executionEvents")
      .withIndex("by_execution", (q) => q.eq("executionId", args.executionId))
      .filter((q) => q.eq(q.field("status"), "running"))
      .collect();

    const now = Date.now();
    for (const runEvt of runningEvents) {
      await ctx.db.patch("executionEvents", runEvt._id, {
        status: args.status === "cancelled" ? "cancelled" : args.status === "failed" ? "failed" : "completed",
        completedAt: now,
        error: args.status === "cancelled" ? "Cancelled by user" : args.error,
      });
    }

    // Insert terminal execution event
    await ctx.db.insert("executionEvents", {
      conversationId: args.conversationId,
      projectId: message.projectId,
      messageId: args.messageId,
      executionId: args.executionId,
      iteration: 0,
      eventType:
        args.status === "cancelled"
          ? "execution_cancel"
          : args.status === "failed"
            ? "execution_fail"
            : "execution_complete",
      status: args.status,
      startedAt: now,
      completedAt: now,
      summary: args.summary ?? `Execution ${args.status}`,
      error: args.error,
    });
  },
});

export const getExecutionEventsByMessage = query({
  args: {
    internalKey: v.string(),
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    validateInternalKey(args.internalKey);

    return await ctx.db
      .query("executionEvents")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .order("asc")
      .collect();
  },
});