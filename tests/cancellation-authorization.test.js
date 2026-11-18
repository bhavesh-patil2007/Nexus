import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

describe("Cancellation Authorization and Scoping", () => {
  let mockDb = {
    projects: new Map(),
    conversations: new Map(),
    messages: new Map(),
    executionEvents: new Map(),
  };

  const internalKey = "test_internal_key";

  beforeEach(() => {
    mockDb = {
      projects: new Map(),
      conversations: new Map(),
      messages: new Map(),
      executionEvents: new Map(),
    };

    // User A's project and conversation
    mockDb.projects.set("proj_A", { _id: "proj_A", ownerId: "user_A", name: "Project A" });
    mockDb.conversations.set("conv_A", { _id: "conv_A", projectId: "proj_A", title: "Conv A" });
    mockDb.messages.set("msg_A_active", {
      _id: "msg_A_active",
      conversationId: "conv_A",
      projectId: "proj_A",
      role: "assistant",
      content: "",
      status: "processing",
    });

    // User B's project and conversation
    mockDb.projects.set("proj_B", { _id: "proj_B", ownerId: "user_B", name: "Project B" });
    mockDb.conversations.set("conv_B", { _id: "conv_B", projectId: "proj_B", title: "Conv B" });
    mockDb.messages.set("msg_B_active", {
      _id: "msg_B_active",
      conversationId: "conv_B",
      projectId: "proj_B",
      role: "assistant",
      content: "",
      status: "processing",
    });
  });

  // Simulated endpoint handlers with exact authorization logic
  async function handleCancelRequest({ userId, projectId }) {
    if (!userId) {
      return { status: 401, error: "Unauthorized" };
    }

    const project = mockDb.projects.get(projectId);
    if (!project) {
      return { status: 404, error: "Project not found" };
    }

    if (project.ownerId !== userId) {
      return { status: 403, error: "Unauthorized" };
    }

    const processingMessages = Array.from(mockDb.messages.values()).filter(
      (m) => m.projectId === projectId && m.status === "processing"
    );

    if (processingMessages.length === 0) {
      return { status: 200, success: true, cancelled: false, messageIds: [] };
    }

    const cancelledIds = processingMessages.map((msg) => {
      msg.status = "cancelled";

      // Mark running execution events cancelled
      for (const evt of mockDb.executionEvents.values()) {
        if (evt.messageId === msg._id && evt.status === "running") {
          evt.status = "cancelled";
          evt.completedAt = Date.now();
        }
      }

      return msg._id;
    });

    return { status: 200, success: true, cancelled: true, messageIds: cancelledIds };
  }

  async function handleMessagePostRequest({ userId, conversationId, message }) {
    if (!userId) {
      return { status: 401, error: "Unauthorized" };
    }

    const conversation = mockDb.conversations.get(conversationId);
    if (!conversation) {
      return { status: 404, error: "Conversation not found" };
    }

    const projectId = conversation.projectId;
    const project = mockDb.projects.get(projectId);
    if (!project) {
      return { status: 404, error: "Project not found" };
    }

    if (project.ownerId !== userId) {
      return { status: 403, error: "Unauthorized" };
    }

    // Message replacement: cancels prior processing messages for THIS project only
    const processingMessages = Array.from(mockDb.messages.values()).filter(
      (m) => m.projectId === projectId && m.status === "processing"
    );

    for (const msg of processingMessages) {
      msg.status = "cancelled";
    }

    const newMsgId = `msg_new_${Date.now()}`;
    mockDb.messages.set(newMsgId, {
      _id: newMsgId,
      conversationId,
      projectId,
      role: "assistant",
      content: "",
      status: "processing",
    });

    return { status: 200, success: true, messageId: newMsgId };
  }

  test("1. Unauthenticated cancellation returns 401", async () => {
    const res = await handleCancelRequest({ userId: null, projectId: "proj_A" });
    assert.equal(res.status, 401);
  });

  test("2. User B cancelling User A's project returns 403", async () => {
    const res = await handleCancelRequest({ userId: "user_B", projectId: "proj_A" });
    assert.equal(res.status, 403);
    assert.equal(mockDb.messages.get("msg_A_active").status, "processing");
  });

  test("3. Non-existent project returns 404", async () => {
    const res = await handleCancelRequest({ userId: "user_A", projectId: "proj_non_existent" });
    assert.equal(res.status, 404);
  });

  test("4. Authorized owner can cancel active execution", async () => {
    const res = await handleCancelRequest({ userId: "user_A", projectId: "proj_A" });
    assert.equal(res.status, 200);
    assert.equal(res.cancelled, true);
    assert.deepEqual(res.messageIds, ["msg_A_active"]);
    assert.equal(mockDb.messages.get("msg_A_active").status, "cancelled");
  });

  test("5. User B posting to User A's conversation returns 403 without cancelling User A's active job", async () => {
    const res = await handleMessagePostRequest({
      userId: "user_B",
      conversationId: "conv_A",
      message: "malicious replacement",
    });

    assert.equal(res.status, 403);
    // User A's active message is untouched
    assert.equal(mockDb.messages.get("msg_A_active").status, "processing");
  });

  test("6. Valid message replacement by owner cancels owner's active message but leaves other users intact", async () => {
    const res = await handleMessagePostRequest({
      userId: "user_A",
      conversationId: "conv_A",
      message: "new query",
    });

    assert.equal(res.status, 200);
    // User A's old message is cancelled
    assert.equal(mockDb.messages.get("msg_A_active").status, "cancelled");
    // User B's active message remains untouched
    assert.equal(mockDb.messages.get("msg_B_active").status, "processing");
  });
});
