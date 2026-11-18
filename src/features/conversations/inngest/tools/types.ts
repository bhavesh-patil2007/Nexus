import { Id } from "../../../../../convex/_generated/dataModel";

export interface ToolExecutionContext {
  executionId: string;
  conversationId: Id<"conversations">;
  projectId: Id<"projects">;
  messageId: Id<"messages">;
  internalKey: string;
  getCurrentIteration: () => number;
  getNextToolCallIndex: (toolName: string) => number;
}
