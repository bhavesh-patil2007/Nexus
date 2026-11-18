import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

describe("Execution Progress & Tool Tracking Lifecycle", () => {
  let mockEventsTable = [];
  let mockMessagesTable = [];

  beforeEach(() => {
    mockEventsTable = [];
    mockMessagesTable = [
      {
        _id: "msg_123",
        conversationId: "conv_123",
        projectId: "proj_123",
        role: "assistant",
        content: "",
        status: "processing",
      },
    ];
  });

  // System mutation simulations
  const mutations = {
    recordExecutionStart: async (args) => {
      const message = mockMessagesTable.find((m) => m._id === args.messageId);
      if (!message || message.status === "cancelled") return null;

      const existing = mockEventsTable.find(
        (e) => e.executionId === args.executionId && e.eventType === "execution_start"
      );
      if (existing) return existing._id;

      const newId = `evt_${mockEventsTable.length + 1}`;
      const record = {
        _id: newId,
        conversationId: args.conversationId,
        projectId: args.projectId,
        messageId: args.messageId,
        executionId: args.executionId,
        iteration: 0,
        eventType: "execution_start",
        status: "running",
        startedAt: Date.now(),
        summary: "Assistant execution started",
      };
      mockEventsTable.push(record);
      return newId;
    },

    recordToolStart: async (args) => {
      const message = mockMessagesTable.find((m) => m._id === args.messageId);
      if (!message || message.status === "cancelled") return null;

      if (message.conversationId !== args.conversationId) {
        throw new Error("Message does not belong to specified conversation");
      }

      const existing = mockEventsTable.find(
        (e) => e.toolExecutionId === args.toolExecutionId
      );
      if (existing) return existing._id;

      const newId = `evt_${mockEventsTable.length + 1}`;
      const record = {
        _id: newId,
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
      };
      mockEventsTable.push(record);
      return newId;
    },

    recordToolComplete: async (args) => {
      const message = mockMessagesTable.find((m) => m._id === args.messageId);
      if (!message || message.status === "cancelled") return null;

      const event = mockEventsTable.find(
        (e) => e.toolExecutionId === args.toolExecutionId
      );
      if (!event || event.status === "cancelled") return null;

      event.status = "completed";
      event.eventType = "tool_complete";
      event.completedAt = Date.now();
      event.summary = args.summary;
      if (args.filePaths) event.filePaths = args.filePaths;
      return event;
    },

    recordToolFail: async (args) => {
      const message = mockMessagesTable.find((m) => m._id === args.messageId);
      if (!message || message.status === "cancelled") return null;

      const event = mockEventsTable.find(
        (e) => e.toolExecutionId === args.toolExecutionId
      );
      if (!event || event.status === "cancelled") return null;

      event.status = "failed";
      event.eventType = "tool_fail";
      event.completedAt = Date.now();
      event.error = args.error;
      event.summary = args.summary ?? `Tool execution failed: ${args.error}`;
      return event;
    },

    recordExecutionEnd: async (args) => {
      const message = mockMessagesTable.find((m) => m._id === args.messageId);
      if (!message) return null;

      if (message.status === "cancelled" && args.status !== "cancelled") {
        return null;
      }

      const runningEvents = mockEventsTable.filter(
        (e) => e.executionId === args.executionId && e.status === "running"
      );
      const now = Date.now();
      for (const e of runningEvents) {
        e.status = args.status === "cancelled" ? "cancelled" : args.status === "failed" ? "failed" : "completed";
        e.completedAt = now;
        e.error = args.status === "cancelled" ? "Cancelled by user" : args.error;
      }

      const newId = `evt_${mockEventsTable.length + 1}`;
      const endRecord = {
        _id: newId,
        conversationId: args.conversationId,
        projectId: message.projectId,
        messageId: args.messageId,
        executionId: args.executionId,
        iteration: 0,
        eventType: args.status === "cancelled" ? "execution_cancel" : args.status === "failed" ? "execution_fail" : "execution_complete",
        status: args.status,
        startedAt: now,
        completedAt: now,
        summary: args.summary ?? `Execution ${args.status}`,
        error: args.error,
      };
      mockEventsTable.push(endRecord);
      return newId;
    },

    updateMessageStreamContent: async (args) => {
      const message = mockMessagesTable.find((m) => m._id === args.messageId);
      if (!message) return;
      if (message.status === "cancelled" || message.status === "completed") return;

      message.content = args.content;
      message.status = "processing";
    },

    updateMessageContent: async (args) => {
      const message = mockMessagesTable.find((m) => m._id === args.messageId);
      if (!message) return;
      if (message.status === "cancelled") return;

      message.content = args.content;
      message.status = "completed";
    },
  };

  test("1. Execution starts correctly and records execution_start", async () => {
    const id = await mutations.recordExecutionStart({
      internalKey: "test-key",
      conversationId: "conv_123",
      projectId: "proj_123",
      messageId: "msg_123",
      executionId: "exec_1",
    });

    assert.ok(id);
    const startEvent = mockEventsTable.find((e) => e.executionId === "exec_1");
    assert.equal(startEvent?.eventType, "execution_start");
    assert.equal(startEvent?.status, "running");
  });

  test("2. Tool start event is persisted with file paths and human-readable description", async () => {
    await mutations.recordExecutionStart({
      internalKey: "test-key",
      conversationId: "conv_123",
      projectId: "proj_123",
      messageId: "msg_123",
      executionId: "exec_1",
    });

    await mutations.recordToolStart({
      internalKey: "test-key",
      conversationId: "conv_123",
      projectId: "proj_123",
      messageId: "msg_123",
      executionId: "exec_1",
      iteration: 1,
      toolExecutionId: "tool_listFiles_1",
      toolName: "listFiles",
      description: "Listing project files...",
    });

    const toolEvt = mockEventsTable.find((e) => e.toolExecutionId === "tool_listFiles_1");
    assert.ok(toolEvt);
    assert.equal(toolEvt.toolName, "listFiles");
    assert.equal(toolEvt.status, "running");
    assert.equal(toolEvt.iteration, 1);
  });

  test("3. Tool completion updates the correct event with execution summary", async () => {
    await mutations.recordToolStart({
      internalKey: "test-key",
      conversationId: "conv_123",
      projectId: "proj_123",
      messageId: "msg_123",
      executionId: "exec_1",
      iteration: 1,
      toolExecutionId: "tool_read_1",
      toolName: "readFiles",
      description: "Reading src/app/page.tsx...",
      filePaths: ["src/app/page.tsx"],
    });

    await mutations.recordToolComplete({
      internalKey: "test-key",
      conversationId: "conv_123",
      messageId: "msg_123",
      toolExecutionId: "tool_read_1",
      summary: "Read src/app/page.tsx",
      filePaths: ["src/app/page.tsx"],
    });

    const toolEvt = mockEventsTable.find((e) => e.toolExecutionId === "tool_read_1");
    assert.equal(toolEvt?.status, "completed");
    assert.equal(toolEvt?.eventType, "tool_complete");
    assert.equal(toolEvt?.summary, "Read src/app/page.tsx");
    assert.ok(toolEvt?.completedAt);
  });

  test("4. Tool failure updates the correct event with safe error summary", async () => {
    await mutations.recordToolStart({
      internalKey: "test-key",
      conversationId: "conv_123",
      projectId: "proj_123",
      messageId: "msg_123",
      executionId: "exec_1",
      iteration: 1,
      toolExecutionId: "tool_update_1",
      toolName: "updateFile",
      description: "Updating src/index.ts...",
      filePaths: ["src/index.ts"],
    });

    await mutations.recordToolFail({
      internalKey: "test-key",
      conversationId: "conv_123",
      messageId: "msg_123",
      toolExecutionId: "tool_update_1",
      error: "File not found",
      summary: "Failed: File not found",
    });

    const toolEvt = mockEventsTable.find((e) => e.toolExecutionId === "tool_update_1");
    assert.equal(toolEvt?.status, "failed");
    assert.equal(toolEvt?.eventType, "tool_fail");
    assert.equal(toolEvt?.error, "File not found");
  });

  test("5. Concurrent tools maintain independent states", async () => {
    await mutations.recordToolStart({
      internalKey: "test-key",
      conversationId: "conv_123",
      projectId: "proj_123",
      messageId: "msg_123",
      executionId: "exec_1",
      iteration: 1,
      toolExecutionId: "tool_read_A",
      toolName: "readFiles",
      description: "Reading file A...",
      filePaths: ["fileA.ts"],
    });

    await mutations.recordToolStart({
      internalKey: "test-key",
      conversationId: "conv_123",
      projectId: "proj_123",
      messageId: "msg_123",
      executionId: "exec_1",
      iteration: 1,
      toolExecutionId: "tool_read_B",
      toolName: "readFiles",
      description: "Reading file B...",
      filePaths: ["fileB.ts"],
    });

    // Complete tool A, tool B still running
    await mutations.recordToolComplete({
      internalKey: "test-key",
      conversationId: "conv_123",
      messageId: "msg_123",
      toolExecutionId: "tool_read_A",
      summary: "Read file A",
    });

    const evtA = mockEventsTable.find((e) => e.toolExecutionId === "tool_read_A");
    const evtB = mockEventsTable.find((e) => e.toolExecutionId === "tool_read_B");

    assert.equal(evtA?.status, "completed");
    assert.equal(evtB?.status, "running");
  });

  test("6. Multiple iterations preserve execution history", async () => {
    // Iteration 1: listFiles
    await mutations.recordToolStart({
      internalKey: "test-key",
      conversationId: "conv_123",
      projectId: "proj_123",
      messageId: "msg_123",
      executionId: "exec_1",
      iteration: 1,
      toolExecutionId: "tool_iter_1",
      toolName: "listFiles",
      description: "Listing project files...",
    });
    await mutations.recordToolComplete({
      internalKey: "test-key",
      conversationId: "conv_123",
      messageId: "msg_123",
      toolExecutionId: "tool_iter_1",
      summary: "Found 5 files",
    });

    // Iteration 2: updateFile
    await mutations.recordToolStart({
      internalKey: "test-key",
      conversationId: "conv_123",
      projectId: "proj_123",
      messageId: "msg_123",
      executionId: "exec_1",
      iteration: 2,
      toolExecutionId: "tool_iter_2",
      toolName: "updateFile",
      description: "Updating file...",
    });
    await mutations.recordToolComplete({
      internalKey: "test-key",
      conversationId: "conv_123",
      messageId: "msg_123",
      toolExecutionId: "tool_iter_2",
      summary: "Updated file",
    });

    assert.equal(mockEventsTable.filter((e) => e.iteration === 1).length, 1);
    assert.equal(mockEventsTable.filter((e) => e.iteration === 2).length, 1);
  });

  test("7. Duplicate events are idempotent", async () => {
    const id1 = await mutations.recordToolStart({
      internalKey: "test-key",
      conversationId: "conv_123",
      projectId: "proj_123",
      messageId: "msg_123",
      executionId: "exec_1",
      iteration: 1,
      toolExecutionId: "tool_dup_1",
      toolName: "listFiles",
      description: "Listing project files...",
    });

    const id2 = await mutations.recordToolStart({
      internalKey: "test-key",
      conversationId: "conv_123",
      projectId: "proj_123",
      messageId: "msg_123",
      executionId: "exec_1",
      iteration: 1,
      toolExecutionId: "tool_dup_1",
      toolName: "listFiles",
      description: "Listing project files...",
    });

    assert.equal(id1, id2);
    assert.equal(mockEventsTable.filter((e) => e.toolExecutionId === "tool_dup_1").length, 1);
  });

  test("8. Terminal cancellation marks running tools cancelled and blocks late updates", async () => {
    await mutations.recordToolStart({
      internalKey: "test-key",
      conversationId: "conv_123",
      projectId: "proj_123",
      messageId: "msg_123",
      executionId: "exec_1",
      iteration: 1,
      toolExecutionId: "tool_cancel_target",
      toolName: "createFiles",
      description: "Creating files...",
    });

    // User cancels
    const msg = mockMessagesTable.find((m) => m._id === "msg_123");
    msg.status = "cancelled";

    await mutations.recordExecutionEnd({
      internalKey: "test-key",
      conversationId: "conv_123",
      messageId: "msg_123",
      executionId: "exec_1",
      status: "cancelled",
      summary: "Cancelled by user",
    });

    const cancelledTool = mockEventsTable.find((e) => e.toolExecutionId === "tool_cancel_target");
    assert.equal(cancelledTool?.status, "cancelled");

    // Late completion attempted after cancellation
    await mutations.recordToolComplete({
      internalKey: "test-key",
      conversationId: "conv_123",
      messageId: "msg_123",
      toolExecutionId: "tool_cancel_target",
      summary: "Created files",
    });

    // Tool should STILL be cancelled, not overwritten by completed
    assert.equal(cancelledTool?.status, "cancelled");
  });

  test("9. Cross-conversation execution updates are rejected", async () => {
    await assert.rejects(
      async () => {
        await mutations.recordToolStart({
          internalKey: "test-key",
          conversationId: "wrong_conv_999",
          projectId: "proj_123",
          messageId: "msg_123",
          executionId: "exec_1",
          iteration: 1,
          toolExecutionId: "tool_unauth",
          toolName: "listFiles",
          description: "Listing files...",
        });
      },
      /Message does not belong to specified conversation/
    );
  });

  test("10. Incremental streaming updates message progressively and completed status finalizes", async () => {
    await mutations.updateMessageStreamContent({
      internalKey: "test-key",
      messageId: "msg_123",
      content: "Hello",
    });

    let msg = mockMessagesTable.find((m) => m._id === "msg_123");
    assert.equal(msg?.content, "Hello");
    assert.equal(msg?.status, "processing");

    await mutations.updateMessageStreamContent({
      internalKey: "test-key",
      messageId: "msg_123",
      content: "Hello world!",
    });

    assert.equal(msg?.content, "Hello world!");
    assert.equal(msg?.status, "processing");

    await mutations.updateMessageContent({
      internalKey: "test-key",
      messageId: "msg_123",
      content: "Hello world! How can I help you today?",
    });

    assert.equal(msg?.content, "Hello world! How can I help you today?");
    assert.equal(msg?.status, "completed");

    // Late streaming chunk cannot overwrite completed message
    await mutations.updateMessageStreamContent({
      internalKey: "test-key",
      messageId: "msg_123",
      content: "Stale chunk",
    });

    assert.equal(msg?.content, "Hello world! How can I help you today?");
    assert.equal(msg?.status, "completed");
  });
});
