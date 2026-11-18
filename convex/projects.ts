import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { verifyAuth } from "./auth";

export const updateSettings = mutation({
  args: {
    id: v.id("projects"),
    settings: v.object({
      installCommand: v.optional(v.string()),
      devCommand: v.optional(v.string()),
      envVariables: v.optional(v.record(v.string(), v.string())),
    }),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    const project = await ctx.db.get("projects", args.id);

    if (!project) throw new Error("Project not found");

    if (project.ownerId !== identity.subject)
      throw new Error("Unauthorized to update this project");

    await ctx.db.patch("projects", args.id, {
      settings: args.settings,
      updatedAt: Date.now(),
    });
  },
});

export const create = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    const projectId = await ctx.db.insert("projects", {
      name: args.name,
      ownerId: identity.subject,
      updatedAt: Date.now(),
    });

    return projectId;
  },
});

export const getPartial = query({
  args: {
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    return await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject))
      .order("desc")
      .take(args.limit);
  },
});

export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyAuth(ctx);

    return await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject))
      .order("desc")
      .collect();
  },
});

export const getById = query({
  args: {
    id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    const project = await ctx.db.get("projects", args.id);

    if (!project) throw new Error("Project not found");

    if (project.ownerId !== identity.subject)
      throw new Error("Unauthorized access to this project");

    return project;
  },
});

export const rename = mutation({
  args: {
    id: v.id("projects"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    const project = await ctx.db.get("projects", args.id);

    if (!project) throw new Error("Project not found");

    if (project.ownerId !== identity.subject)
      throw new Error("Unauthorized access to this project");

    await ctx.db.patch("projects", args.id, {
      name: args.name,
      updatedAt: Date.now(),
    });
  },
});

export const deleteProject = mutation({
  args: {
    id: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    const project = await ctx.db.get("projects", args.id);

    if (!project) throw new Error("Project not found");

    if (project.ownerId !== identity.subject)
      throw new Error("Unauthorized to delete this project");

    // 1. Delete all messages for conversations belonging to this project,
    // as well as any messages referencing this projectId directly
    const messages = await ctx.db
      .query("messages")
      .filter((q) => q.eq(q.field("projectId"), args.id))
      .collect();

    for (const message of messages) {
      await ctx.db.delete("messages", message._id);
    }

    // 2. Delete all conversations for this project
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();

    for (const conversation of conversations) {
      // Also ensure any messages tied to this conversation (if projectId differed for any reason) are deleted
      const convMessages = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
        .collect();

      for (const msg of convMessages) {
        await ctx.db.delete("messages", msg._id);
      }

      await ctx.db.delete("conversations", conversation._id);
    }

    // 3. Delete all files for this project and their associated Convex storage
    const files = await ctx.db
      .query("files")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();

    for (const file of files) {
      if (file.storageId) {
        try {
          await ctx.storage.delete(file.storageId);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          // Only treat known "not found" / 404 storage errors as benign idempotency cases
          const isNotFoundError =
            errorMessage.toLowerCase().includes("not found") ||
            errorMessage.includes("404");

          if (!isNotFoundError) {
            // Re-throw genuine storage failures to prevent leaving orphaned storage objects
            throw new Error(
              `Failed to delete storage file ${file.storageId} for file ${file._id}: ${errorMessage}`,
            );
          }
          console.warn(
            `Storage file ${file.storageId} for file ${file._id} already removed or not found:`,
            errorMessage,
          );
        }
      }
      await ctx.db.delete("files", file._id);
    }

    // 4. Delete the project record
    await ctx.db.delete("projects", args.id);

    return { success: true };
  },
});
