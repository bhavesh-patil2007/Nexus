import { convex } from "@/lib/convex-client";
import { api } from "../../../../../convex/_generated/api";
import { ToolExecutionContext } from "./types";

export interface ToolTrackingOptions {
  toolName: string;
  description: string;
  filePaths?: string[];
}

export async function runTrackedTool<T>(
  context: ToolExecutionContext | undefined,
  options: ToolTrackingOptions,
  execute: () => Promise<{ result: T; summary: string; filePaths?: string[] }>,
): Promise<T> {
  if (!context) {
    const executed = await execute();
    return executed.result;
  }

  const iteration = context.getCurrentIteration();
  const callIndex = context.getNextToolCallIndex(options.toolName);
  // Deterministic toolExecutionId: executionId + iteration + toolName + callIndex
  // Stable across retries of the same Inngest step / execution attempt
  const toolExecutionId = `${context.executionId}-iter${iteration}-${options.toolName}-${callIndex}`;

  // 1. Tool start event
  try {
    await convex.mutation(api.system.recordToolStart, {
      internalKey: context.internalKey,
      conversationId: context.conversationId,
      projectId: context.projectId,
      messageId: context.messageId,
      executionId: context.executionId,
      iteration,
      toolExecutionId,
      toolName: options.toolName,
      description: options.description,
      filePaths: options.filePaths,
    });
  } catch (err) {
    console.warn("[ToolTracker] Failed to record tool start", err);
  }

  // 2. Tool execution
  try {
    const { result, summary, filePaths } = await execute();

    // 3. Tool completion event
    try {
      await convex.mutation(api.system.recordToolComplete, {
        internalKey: context.internalKey,
        conversationId: context.conversationId,
        messageId: context.messageId,
        toolExecutionId,
        summary,
        filePaths: filePaths ?? options.filePaths,
      });
    } catch (err) {
      console.warn("[ToolTracker] Failed to record tool completion", err);
    }

    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // 4. Tool failure event
    try {
      await convex.mutation(api.system.recordToolFail, {
        internalKey: context.internalKey,
        conversationId: context.conversationId,
        messageId: context.messageId,
        toolExecutionId,
        error: errorMsg,
        summary: `Failed: ${errorMsg}`,
      });
    } catch (recordErr) {
      console.warn("[ToolTracker] Failed to record tool fail", recordErr);
    }

    throw err;
  }
}
