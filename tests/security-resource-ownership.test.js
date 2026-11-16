import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";

const cjsRequire = createRequire(import.meta.url);

// In-memory state and mock tracking
let mockUserId = null;
let mockGithubToken = "gho_mocktoken123";
let mockDb = {
  projects: new Map(),
  conversations: new Map(),
  messages: new Map(),
};
let inngestSentEvents = [];
let convexMutations = [];

function resetMocks() {
  mockUserId = null;
  mockGithubToken = "gho_mocktoken123";
  mockDb = {
    projects: new Map(),
    conversations: new Map(),
    messages: new Map(),
  };
  inngestSentEvents = [];
  convexMutations = [];
}

// Module loader helper to transpile and run route files with our mocks
function loadRouteModule(relPath) {
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
    if (id === "@clerk/nextjs/server") {
      return {
        auth: async () => ({ userId: mockUserId }),
        clerkClient: async () => ({
          users: {
            getUserOauthAccessToken: async () => {
              if (mockGithubToken) {
                return { data: [{ token: mockGithubToken }] };
              }
              return { data: [] };
            },
          },
        }),
      };
    }
    if (id === "next/server") {
      return {
        NextResponse: {
          json: (data, init) => {
            return {
              status: init?.status ?? 200,
              data,
              json: async () => data,
            };
          },
        },
      };
    }
    if (id === "@/inngest/client") {
      return {
        inngest: {
          send: async (event) => {
            inngestSentEvents.push(event);
            return { ids: ["evt_mock_id_123"] };
          },
        },
      };
    }
    if (id === "@/lib/convex-client") {
      return {
        convex: {
          query: async (queryFn, args) => {
            if (args.internalKey !== process.env.NEXUS_CONVEX_INTERNAL_KEY) {
              throw new Error("Invalid internal key");
            }
            if (queryFn === "getConversationById") {
              return mockDb.conversations.get(args.conversationId) || null;
            }
            if (queryFn === "getProjectById") {
              return mockDb.projects.get(args.projectId) || null;
            }
            if (queryFn === "getProcessingMessages") {
              const msgs = [];
              for (const [id, msg] of mockDb.messages.entries()) {
                if (msg.projectId === args.projectId && msg.status === "processing") {
                  msgs.push({ _id: id, ...msg });
                }
              }
              return msgs;
            }
            throw new Error(`Unknown query: ${queryFn}`);
          },
          mutation: async (mutationFn, args) => {
            if (args.internalKey !== process.env.NEXUS_CONVEX_INTERNAL_KEY) {
              throw new Error("Invalid internal key");
            }
            convexMutations.push({ mutationFn, args });
            if (mutationFn === "updateMessageStatus") {
              const msg = mockDb.messages.get(args.messageId);
              if (msg) {
                msg.status = args.status;
              }
              return null;
            }
            if (mutationFn === "createMessage") {
              const msgId = "msg_" + Math.random().toString(36).substring(2, 9);
              mockDb.messages.set(msgId, {
                conversationId: args.conversationId,
                projectId: args.projectId,
                role: args.role,
                content: args.content,
                status: args.status,
              });
              return msgId;
            }
            throw new Error(`Unknown mutation: ${mutationFn}`);
          },
        },
      };
    }
    if (id.includes("_generated/api")) {
      return {
        api: {
          system: {
            getConversationById: "getConversationById",
            getProjectById: "getProjectById",
            getProcessingMessages: "getProcessingMessages",
            updateMessageStatus: "updateMessageStatus",
            createMessage: "createMessage",
          },
        },
      };
    }
    if (id.includes("_generated/dataModel")) {
      return {};
    }
    return cjsRequire(id);
  };

  const fn = new Function("require", "module", "exports", "process", transpiled);
  fn(customRequire, m, m.exports, process);
  return m.exports;
}

process.env.NEXUS_CONVEX_INTERNAL_KEY = "test_internal_key_secret";

function createMockRequest(body) {
  return {
    json: async () => body,
  };
}

describe("Security Issue #1 - Resource Ownership & Access Control", () => {
  let messagesRoute;
  let cancelRoute;
  let exportRoute;

  beforeEach(() => {
    resetMocks();
    messagesRoute = loadRouteModule("src/app/api/messages/route.ts");
    cancelRoute = loadRouteModule("src/app/api/messages/cancel/route.ts");
    exportRoute = loadRouteModule("src/app/api/github/export/route.ts");

    // Seed mock database
    mockDb.projects.set("proj_user_a", {
      name: "Project A",
      ownerId: "user_a",
      updatedAt: Date.now(),
    });
    mockDb.projects.set("proj_user_b", {
      name: "Project B",
      ownerId: "user_b",
      updatedAt: Date.now(),
    });

    mockDb.conversations.set("conv_user_a", {
      projectId: "proj_user_a",
      title: "Conversation A",
      updatedAt: Date.now(),
    });
    mockDb.conversations.set("conv_user_b", {
      projectId: "proj_user_b",
      title: "Conversation B",
      updatedAt: Date.now(),
    });
  });

  // Requirement 1: Unauthenticated POST /api/messages returns 401
  test("1. Unauthenticated POST /api/messages returns 401", async () => {
    mockUserId = null;
    const req = createMockRequest({
      conversationId: "conv_user_a",
      message: "Hello world",
    });

    const res = await messagesRoute.POST(req);
    assert.strictEqual(res.status, 401);
    assert.strictEqual(inngestSentEvents.length, 0);
    assert.strictEqual(convexMutations.length, 0);
  });

  // Requirement 2: User A accessing User B's conversation returns 403
  test("2. User A accessing User B's conversation returns 403", async () => {
    mockUserId = "user_a";
    const req = createMockRequest({
      conversationId: "conv_user_b",
      message: "Malicious message into User B's conversation",
    });

    const res = await messagesRoute.POST(req);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(inngestSentEvents.length, 0);
    assert.strictEqual(convexMutations.length, 0);
  });

  // Requirement 3: Authorized conversation access continues working
  test("3. Authorized conversation access continues working", async () => {
    mockUserId = "user_a";
    const req = createMockRequest({
      conversationId: "conv_user_a",
      message: "Legitimate message into own conversation",
    });

    const res = await messagesRoute.POST(req);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(inngestSentEvents.length, 1);
    assert.strictEqual(inngestSentEvents[0].name, "message/sent");
    assert.strictEqual(inngestSentEvents[0].data.projectId, "proj_user_a");
    // Verify user and assistant messages created
    assert.strictEqual(convexMutations.filter(m => m.mutationFn === "createMessage").length, 2);
  });

  // Requirement 4: Unauthenticated cancellation returns 401
  test("4. Unauthenticated cancellation returns 401", async () => {
    mockUserId = null;
    const req = createMockRequest({
      projectId: "proj_user_a",
    });

    const res = await cancelRoute.POST(req);
    assert.strictEqual(res.status, 401);
    assert.strictEqual(inngestSentEvents.length, 0);
    assert.strictEqual(convexMutations.length, 0);
  });

  // Requirement 5: User A cancelling User B's conversation returns 403
  test("5. User A cancelling User B's conversation returns 403", async () => {
    mockUserId = "user_a";
    // Seed a processing message for User B
    mockDb.messages.set("msg_user_b_proc", {
      conversationId: "conv_user_b",
      projectId: "proj_user_b",
      role: "assistant",
      content: "",
      status: "processing",
    });

    const req = createMockRequest({
      projectId: "proj_user_b",
    });

    const res = await cancelRoute.POST(req);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(inngestSentEvents.length, 0);
    assert.strictEqual(convexMutations.length, 0);
    // Ensure message status was NOT cancelled
    assert.strictEqual(mockDb.messages.get("msg_user_b_proc").status, "processing");
  });

  // Requirement 6: Authorized cancellation continues working
  test("6. Authorized cancellation continues working", async () => {
    mockUserId = "user_a";
    mockDb.messages.set("msg_user_a_proc", {
      conversationId: "conv_user_a",
      projectId: "proj_user_a",
      role: "assistant",
      content: "",
      status: "processing",
    });

    const req = createMockRequest({
      projectId: "proj_user_a",
    });

    const res = await cancelRoute.POST(req);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.cancelled, true);
    assert.strictEqual(inngestSentEvents.length, 1);
    assert.strictEqual(inngestSentEvents[0].name, "message/cancel");
    assert.strictEqual(inngestSentEvents[0].data.messageId, "msg_user_a_proc");
    assert.strictEqual(mockDb.messages.get("msg_user_a_proc").status, "cancelled");
  });

  // Requirement 7: Unauthenticated GitHub export returns 401
  test("7. Unauthenticated GitHub export returns 401", async () => {
    mockUserId = null;
    const req = createMockRequest({
      projectId: "proj_user_a",
      repoName: "my-repo",
    });

    const res = await exportRoute.POST(req);
    assert.strictEqual(res.status, 401);
    assert.strictEqual(inngestSentEvents.length, 0);
  });

  // Requirement 8: User A exporting User B's project returns 403
  test("8. User A exporting User B's project returns 403", async () => {
    mockUserId = "user_a";
    const req = createMockRequest({
      projectId: "proj_user_b",
      repoName: "stolen-project",
    });

    const res = await exportRoute.POST(req);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(inngestSentEvents.length, 0);
  });

  // Requirement 9: Authorized project export continues working
  test("9. Authorized project export continues working", async () => {
    mockUserId = "user_a";
    const req = createMockRequest({
      projectId: "proj_user_a",
      repoName: "legit-export",
      visibility: "public",
      description: "My project",
    });

    const res = await exportRoute.POST(req);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.projectId, "proj_user_a");
    assert.strictEqual(inngestSentEvents.length, 1);
    assert.strictEqual(inngestSentEvents[0].name, "github/export.repo");
    assert.strictEqual(inngestSentEvents[0].data.projectId, "proj_user_a");
  });

  // Requirement 10: Unauthorized requests do not trigger Inngest jobs, mutations or external side effects
  test("10. Unauthorized requests do not trigger Inngest jobs, mutations or external side effects across all routes", async () => {
    mockUserId = "attacker";

    // Attempt unauthorized message post
    const resMsg = await messagesRoute.POST(createMockRequest({
      conversationId: "conv_user_a",
      message: "Exploit attempt",
    }));
    assert.strictEqual(resMsg.status, 403);

    // Attempt unauthorized cancel
    const resCancel = await cancelRoute.POST(createMockRequest({
      projectId: "proj_user_a",
    }));
    assert.strictEqual(resCancel.status, 403);

    // Attempt unauthorized export
    const resExport = await exportRoute.POST(createMockRequest({
      projectId: "proj_user_a",
      repoName: "exploit-repo",
    }));
    assert.strictEqual(resExport.status, 403);

    // Verify ZERO side effects were performed
    assert.strictEqual(inngestSentEvents.length, 0, "No inngest events sent");
    assert.strictEqual(convexMutations.length, 0, "No convex mutations performed");
  });

  // Additional boundary case: Not found resources return 404
  test("11. Non-existent resources return 404", async () => {
    mockUserId = "user_a";

    const resMsg = await messagesRoute.POST(createMockRequest({
      conversationId: "conv_nonexistent",
      message: "Nonexistent conv",
    }));
    assert.strictEqual(resMsg.status, 404);

    const resCancel = await cancelRoute.POST(createMockRequest({
      projectId: "proj_nonexistent",
    }));
    assert.strictEqual(resCancel.status, 404);

    const resExport = await exportRoute.POST(createMockRequest({
      projectId: "proj_nonexistent",
      repoName: "nonexistent-repo",
    }));
    assert.strictEqual(resExport.status, 404);
  });
});
