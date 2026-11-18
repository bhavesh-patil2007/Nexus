import { describe, expect, it } from "vitest";

import { requestSchema as githubExportSchema } from "@/app/api/github/export/route";
import { requestSchema as cancelMessageSchema } from "@/app/api/messages/cancel/route";
import { requestSchema as messageSchema } from "@/app/api/messages/route";

describe("API request validation schemas", () => {
  describe("/api/messages requestSchema", () => {
    it("should accept valid payload with conversationId and message", () => {
      const valid = {
        conversationId: "conv_123",
        message: "Hello assistant",
      };

      const result = messageSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(valid);
      }
    });

    it("should reject when conversationId or message is missing or non-string", () => {
      expect(messageSchema.safeParse({ message: "test" }).success).toBe(false);
      expect(messageSchema.safeParse({ conversationId: "c1" }).success).toBe(false);
      expect(
        messageSchema.safeParse({ conversationId: 123, message: "test" }).success
      ).toBe(false);
    });
  });

  describe("/api/messages/cancel requestSchema", () => {
    it("should accept valid payload with projectId", () => {
      const valid = { projectId: "proj_999" };
      const result = cancelMessageSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.projectId).toBe("proj_999");
      }
    });

    it("should reject when projectId is missing or non-string", () => {
      expect(cancelMessageSchema.safeParse({}).success).toBe(false);
      expect(cancelMessageSchema.safeParse({ projectId: 123 }).success).toBe(false);
    });
  });

  describe("/api/github/export requestSchema", () => {
    it("should accept valid payload with defaults", () => {
      const payload = {
        projectId: "p1",
        repoName: "my-nexus-repo",
      };

      const result = githubExportSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.visibility).toBe("private");
        expect(result.data.description).toBeUndefined();
      }
    });

    it("should accept valid full payload", () => {
      const payload = {
        projectId: "p1",
        repoName: "nexus-app",
        visibility: "public" as const,
        description: "An exported Nexus project",
      };

      const result = githubExportSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(payload);
      }
    });

    it("should reject empty or overly long repo names", () => {
      expect(
        githubExportSchema.safeParse({
          projectId: "p1",
          repoName: "",
        }).success
      ).toBe(false);

      expect(
        githubExportSchema.safeParse({
          projectId: "p1",
          repoName: "a".repeat(101),
        }).success
      ).toBe(false);
    });

    it("should reject invalid visibility values", () => {
      expect(
        githubExportSchema.safeParse({
          projectId: "p1",
          repoName: "test-repo",
          visibility: "internal",
        }).success
      ).toBe(false);
    });

    it("should reject overly long descriptions", () => {
      expect(
        githubExportSchema.safeParse({
          projectId: "p1",
          repoName: "test-repo",
          description: "x".repeat(351),
        }).success
      ).toBe(false);
    });
  });
});
