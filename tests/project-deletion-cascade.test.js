import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";

const cjsRequire = createRequire(import.meta.url);

// In-memory Convex state for testing
let mockUser = null;
let mockDb = {
  projects: new Map(),
  files: new Map(),
  conversations: new Map(),
  messages: new Map(),
};
let mockStorage = new Map();
let deletedStorageIds = [];

function resetDb() {
  mockUser = null;
  mockDb = {
    projects: new Map(),
    files: new Map(),
    conversations: new Map(),
    messages: new Map(),
  };
  mockStorage = new Map();
  deletedStorageIds = [];
}

function loadConvexProjectsModule() {
  const fullPath = path.resolve(process.cwd(), "convex/projects.ts");
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
    if (id === "./_generated/server") {
      return {
        mutation: (config) => config,
        query: (config) => config,
      };
    }
    if (id === "convex/values") {
      return {
        v: {
          id: (tableName) => ({ type: "id", tableName }),
          string: () => ({ type: "string" }),
          number: () => ({ type: "number" }),
          optional: (inner) => ({ type: "optional", inner }),
          object: (fields) => ({ type: "object", fields }),
          union: (...types) => ({ type: "union", types }),
          literal: (val) => ({ type: "literal", val }),
        },
      };
    }
    if (id === "./auth") {
      return {
        verifyAuth: async (ctx) => {
          const identity = await ctx.auth.getUserIdentity();
          if (!identity) throw new Error("Unauthorized");
          return identity;
        },
      };
    }
    return cjsRequire(id);
  };

  const fn = new Function("require", "module", "exports", transpiled);
  fn(customRequire, m, m.exports);
  return m.exports;
}

function createMockCtx() {
  return {
    auth: {
      getUserIdentity: async () => mockUser,
    },
    storage: {
      delete: async (storageId) => {
        if (!mockStorage.has(storageId)) {
          throw new Error(`Storage object ${storageId} not found in Convex storage`);
        }
        mockStorage.delete(storageId);
        deletedStorageIds.push(storageId);
      },
    },
    db: {
      get: async (tableOrId, maybeId) => {
        const id = maybeId !== undefined ? maybeId : tableOrId;
        const tableName = maybeId !== undefined ? tableOrId : id.split("_")[0];
        const map = mockDb[tableName] || mockDb[tableOrId];
        if (!map) return null;
        return map.get(id) || null;
      },
      insert: async (table, doc) => {
        const id = `${table}_${Math.random().toString(36).substring(2, 9)}`;
        mockDb[table].set(id, { _id: id, ...doc });
        return id;
      },
      patch: async (tableOrId, maybeIdOrDoc, maybeDoc) => {
        let table, id, doc;
        if (maybeDoc !== undefined) {
          table = tableOrId;
          id = maybeIdOrDoc;
          doc = maybeDoc;
        } else {
          id = tableOrId;
          table = id.split("_")[0];
          doc = maybeIdOrDoc;
        }
        const existing = mockDb[table]?.get(id);
        if (existing) {
          mockDb[table].set(id, { ...existing, ...doc });
        }
      },
      delete: async (tableOrId, maybeId) => {
        const id = maybeId !== undefined ? maybeId : tableOrId;
        const table = maybeId !== undefined ? tableOrId : id.split("_")[0];
        mockDb[table]?.delete(id);
      },
      query: (table) => {
        let items = Array.from(mockDb[table]?.values() || []);
        const queryObj = {
          withIndex: (indexName, filterFn) => {
            const conditions = {
              eq: (field, val) => ({ field, val }),
            };
            const filterRes = filterFn({
              eq: (field, val) => ({ field, val }),
            });
            if (filterRes) {
              items = items.filter((item) => item[filterRes.field] === filterRes.val);
            }
            return queryObj;
          },
          filter: (filterFn) => {
            items = items.filter((item) => {
              const q = {
                eq: (left, right) => left === right,
                field: (name) => item[name],
              };
              return filterFn(q);
            });
            return queryObj;
          },
          order: () => queryObj,
          collect: async () => [...items],
          take: async (n) => items.slice(0, n),
        };
        return queryObj;
      },
    },
  };
}

describe("Issue #7 - Project Deletion & Cascade Cleanup Tests", () => {
  let projectsModule;

  beforeEach(() => {
    resetDb();
    projectsModule = loadConvexProjectsModule();
  });

  test("1. Authenticated project owner can delete their project", async () => {
    mockUser = { subject: "user_owner" };
    mockDb.projects.set("projects_1", {
      _id: "projects_1",
      name: "My Project",
      ownerId: "user_owner",
      updatedAt: Date.now(),
    });

    const ctx = createMockCtx();
    const result = await projectsModule.deleteProject.handler(ctx, { id: "projects_1" });
    assert.deepStrictEqual(result, { success: true });
    assert.strictEqual(mockDb.projects.has("projects_1"), false);
  });

  test("2. Unauthenticated user cannot delete a project (throws Unauthorized)", async () => {
    mockUser = null;
    mockDb.projects.set("projects_1", {
      _id: "projects_1",
      name: "My Project",
      ownerId: "user_owner",
      updatedAt: Date.now(),
    });

    const ctx = createMockCtx();
    await assert.rejects(
      async () => {
        await projectsModule.deleteProject.handler(ctx, { id: "projects_1" });
      },
      { message: "Unauthorized" }
    );
    assert.strictEqual(mockDb.projects.has("projects_1"), true);
  });

  test("3. Non-owner cannot delete another user's project (throws Unauthorized to delete)", async () => {
    mockUser = { subject: "user_attacker" };
    mockDb.projects.set("projects_1", {
      _id: "projects_1",
      name: "Victim Project",
      ownerId: "user_owner",
      updatedAt: Date.now(),
    });

    const ctx = createMockCtx();
    await assert.rejects(
      async () => {
        await projectsModule.deleteProject.handler(ctx, { id: "projects_1" });
      },
      { message: "Unauthorized to delete this project" }
    );
    assert.strictEqual(mockDb.projects.has("projects_1"), true);
  });

  test("4. Nonexistent project ID throws Project not found", async () => {
    mockUser = { subject: "user_owner" };

    const ctx = createMockCtx();
    await assert.rejects(
      async () => {
        await projectsModule.deleteProject.handler(ctx, { id: "projects_nonexistent" });
      },
      { message: "Project not found" }
    );
  });

  test("5. Cascade cleanup: removes project, files, conversations, messages, and storage objects", async () => {
    mockUser = { subject: "user_owner" };
    const pId = "projects_target";
    mockDb.projects.set(pId, {
      _id: pId,
      name: "Target Project",
      ownerId: "user_owner",
      updatedAt: Date.now(),
    });

    // Populate storage
    mockStorage.set("storage_bin_1", "bytes1");
    mockStorage.set("storage_bin_2", "bytes2");

    // Populate files for target project
    mockDb.files.set("files_f1", {
      _id: "files_f1",
      projectId: pId,
      name: "index.ts",
      type: "file",
      content: "console.log('hi')",
    });
    mockDb.files.set("files_f2", {
      _id: "files_f2",
      projectId: pId,
      name: "avatar.png",
      type: "file",
      storageId: "storage_bin_1",
    });
    mockDb.files.set("files_f3", {
      _id: "files_f3",
      projectId: pId,
      name: "src",
      type: "folder",
    });

    // Populate conversations for target project
    mockDb.conversations.set("conversations_c1", {
      _id: "conversations_c1",
      projectId: pId,
      title: "Chat 1",
      updatedAt: Date.now(),
    });
    mockDb.conversations.set("conversations_c2", {
      _id: "conversations_c2",
      projectId: pId,
      title: "Chat 2",
      updatedAt: Date.now(),
    });

    // Populate messages
    mockDb.messages.set("messages_m1", {
      _id: "messages_m1",
      conversationId: "conversations_c1",
      projectId: pId,
      role: "user",
      content: "Hi",
    });
    mockDb.messages.set("messages_m2", {
      _id: "messages_m2",
      conversationId: "conversations_c1",
      projectId: pId,
      role: "assistant",
      content: "Hello",
    });
    mockDb.messages.set("messages_m3", {
      _id: "messages_m3",
      conversationId: "conversations_c2",
      projectId: pId,
      role: "user",
      content: "Question",
    });

    // Populate OTHER project records (must NOT be touched)
    const otherPId = "projects_other";
    mockDb.projects.set(otherPId, {
      _id: otherPId,
      name: "Other Project",
      ownerId: "user_owner",
      updatedAt: Date.now(),
    });
    mockStorage.set("storage_other", "otherbytes");
    mockDb.files.set("files_other", {
      _id: "files_other",
      projectId: otherPId,
      name: "other.png",
      type: "file",
      storageId: "storage_other",
    });
    mockDb.conversations.set("conversations_other", {
      _id: "conversations_other",
      projectId: otherPId,
      title: "Other Conv",
      updatedAt: Date.now(),
    });
    mockDb.messages.set("messages_other", {
      _id: "messages_other",
      conversationId: "conversations_other",
      projectId: otherPId,
      role: "user",
      content: "Don't delete me",
    });

    const ctx = createMockCtx();
    const result = await projectsModule.deleteProject.handler(ctx, { id: pId });
    assert.deepStrictEqual(result, { success: true });

    // Verify target records deleted
    assert.strictEqual(mockDb.projects.has(pId), false);
    assert.strictEqual(mockDb.files.has("files_f1"), false);
    assert.strictEqual(mockDb.files.has("files_f2"), false);
    assert.strictEqual(mockDb.files.has("files_f3"), false);
    assert.strictEqual(mockDb.conversations.has("conversations_c1"), false);
    assert.strictEqual(mockDb.conversations.has("conversations_c2"), false);
    assert.strictEqual(mockDb.messages.has("messages_m1"), false);
    assert.strictEqual(mockDb.messages.has("messages_m2"), false);
    assert.strictEqual(mockDb.messages.has("messages_m3"), false);
    assert.strictEqual(mockStorage.has("storage_bin_1"), false);
    assert.deepStrictEqual(deletedStorageIds, ["storage_bin_1"]);

    // Verify other project records are completely untouched
    assert.strictEqual(mockDb.projects.has(otherPId), true);
    assert.strictEqual(mockDb.files.has("files_other"), true);
    assert.strictEqual(mockDb.conversations.has("conversations_other"), true);
    assert.strictEqual(mockDb.messages.has("messages_other"), true);
    assert.strictEqual(mockStorage.has("storage_other"), true);
  });

  test("6. Records belonging to other users remain untouched", async () => {
    mockUser = { subject: "user_a" };
    mockDb.projects.set("projects_a", {
      _id: "projects_a",
      name: "User A Project",
      ownerId: "user_a",
      updatedAt: Date.now(),
    });
    mockDb.projects.set("projects_b", {
      _id: "projects_b",
      name: "User B Project",
      ownerId: "user_b",
      updatedAt: Date.now(),
    });
    mockDb.files.set("files_b", {
      _id: "files_b",
      projectId: "projects_b",
      name: "b.txt",
      type: "file",
    });

    const ctx = createMockCtx();
    await projectsModule.deleteProject.handler(ctx, { id: "projects_a" });

    assert.strictEqual(mockDb.projects.has("projects_a"), false);
    assert.strictEqual(mockDb.projects.has("projects_b"), true);
    assert.strictEqual(mockDb.files.has("files_b"), true);
  });

  test("7. Empty projects delete safely without errors", async () => {
    mockUser = { subject: "user_owner" };
    mockDb.projects.set("projects_empty", {
      _id: "projects_empty",
      name: "Empty Project",
      ownerId: "user_owner",
      updatedAt: Date.now(),
    });

    const ctx = createMockCtx();
    const result = await projectsModule.deleteProject.handler(ctx, { id: "projects_empty" });
    assert.deepStrictEqual(result, { success: true });
    assert.strictEqual(mockDb.projects.has("projects_empty"), false);
  });

  test("8. Missing storage objects do not abort cascade cleanup", async () => {
    mockUser = { subject: "user_owner" };
    const pId = "projects_with_ghost_storage";
    mockDb.projects.set(pId, {
      _id: pId,
      name: "Ghost Storage Project",
      ownerId: "user_owner",
      updatedAt: Date.now(),
    });
    mockDb.files.set("files_ghost", {
      _id: "files_ghost",
      projectId: pId,
      name: "ghost.png",
      type: "file",
      storageId: "storage_does_not_exist",
    });

    const ctx = createMockCtx();
    // Must succeed without throwing
    const result = await projectsModule.deleteProject.handler(ctx, { id: pId });
    assert.deepStrictEqual(result, { success: true });
    assert.strictEqual(mockDb.projects.has(pId), false);
    assert.strictEqual(mockDb.files.has("files_ghost"), false);
  });

  test("9. Repeated deletion attempt returns Project not found", async () => {
    mockUser = { subject: "user_owner" };
    const pId = "projects_repeat";
    mockDb.projects.set(pId, {
      _id: pId,
      name: "Repeat Project",
      ownerId: "user_owner",
      updatedAt: Date.now(),
    });

    const ctx = createMockCtx();
    await projectsModule.deleteProject.handler(ctx, { id: pId });

    // Second deletion attempt
    await assert.rejects(
      async () => {
        await projectsModule.deleteProject.handler(ctx, { id: pId });
      },
      { message: "Project not found" }
    );
  });

  test("10. Genuine unexpected storage failures are thrown and not silently ignored", async () => {
    mockUser = { subject: "user_owner" };
    const pId = "projects_storage_fail";
    mockDb.projects.set(pId, {
      _id: pId,
      name: "Storage Fail Project",
      ownerId: "user_owner",
      updatedAt: Date.now(),
    });
    mockDb.files.set("files_fail", {
      _id: "files_fail",
      projectId: pId,
      name: "fail.png",
      type: "file",
      storageId: "storage_network_error",
    });

    const ctx = createMockCtx();
    ctx.storage.delete = async () => {
      throw new Error("Network timeout or storage service down");
    };

    await assert.rejects(
      async () => {
        await projectsModule.deleteProject.handler(ctx, { id: pId });
      },
      { message: /Failed to delete storage file storage_network_error/ }
    );

    // Verify project record and file record were NOT deleted due to the thrown error
    assert.strictEqual(mockDb.projects.has(pId), true);
    assert.strictEqual(mockDb.files.has("files_fail"), true);
  });
});
