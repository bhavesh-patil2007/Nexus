import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock @clerk/nextjs/server auth
let mockUserId: string | null = null;
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({
    userId: mockUserId,
  })),
}));

// Mock @ai-sdk/openai and ai
vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(() => ({})),
}));

const mockGenerateText = vi.fn();

vi.mock("ai", () => ({
  generateText: (args: unknown) => mockGenerateText(args),
  Output: {
    object: vi.fn((config: unknown) => config),
  },
}));

import { POST, suggestionRequestSchema } from "@/app/api/suggestion/route";

describe("POST /api/suggestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserId = "user_test_123";
    mockGenerateText.mockResolvedValue({
      output: { suggestion: "const result = 42;" },
    });
  });

  // Test 1 — Unauthenticated request
  it("Test 1: should return 401 when request is unauthenticated (no userId)", async () => {
    mockUserId = null;

    const request = new Request("http://localhost:3000/api/suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "index.ts",
        code: "const x = 1;",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);

    const data = await response.json();
    expect(data).toEqual({ error: "Unauthorized" });
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // Test 2 — Missing code
  it("Test 2: should return 400 when code is missing", async () => {
    const request = new Request("http://localhost:3000/api/suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "app.tsx",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data).toEqual({ error: "Invalid suggestion payload" });
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // Test 3 — Missing fileName
  it("Test 3: should return 400 when fileName is missing or empty", async () => {
    const requestMissing = new Request("http://localhost:3000/api/suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "const x = 1;",
      }),
    });

    const res1 = await POST(requestMissing);
    expect(res1.status).toBe(400);
    expect(await res1.json()).toEqual({ error: "Invalid suggestion payload" });

    const requestEmpty = new Request("http://localhost:3000/api/suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "   ",
        code: "const x = 1;",
      }),
    });

    const res2 = await POST(requestEmpty);
    expect(res2.status).toBe(400);
    expect(await res2.json()).toEqual({ error: "Invalid suggestion payload" });
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // Test 4 — Wrong field types
  it("Test 4: should return 400 when fields have incorrect types", async () => {
    // Numeric fileName
    const req1 = new Request("http://localhost:3000/api/suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: 12345,
        code: "const x = 1;",
      }),
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(400);
    expect(await res1.json()).toEqual({ error: "Invalid suggestion payload" });

    // Non-string context field (e.g. currentLine is an object)
    const req2 = new Request("http://localhost:3000/api/suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "test.ts",
        code: "const x = 1;",
        currentLine: { text: "invalid" },
      }),
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(400);
    expect(await res2.json()).toEqual({ error: "Invalid suggestion payload" });
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // Test 5 — Invalid lineNumber
  it("Test 5: should return 400 for string, negative, floating-point, or non-numeric lineNumber", async () => {
    const invalidLineNumbers = ["10", -1, 3.14, NaN, Infinity];

    for (const invalidVal of invalidLineNumbers) {
      const request = new Request("http://localhost:3000/api/suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: "test.ts",
          code: "console.log('hello');",
          lineNumber: invalidVal,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid suggestion payload" });
    }
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // Test 6 — Malformed JSON
  it("Test 6: should return 400 when request body contains malformed JSON", async () => {
    const request = new Request("http://localhost:3000/api/suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not-valid-json ",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data).toEqual({ error: "Invalid request body" });
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // Test 7 — Optional fields omitted
  it("Test 7: should accept request when all optional context fields are omitted", async () => {
    const request = new Request("http://localhost:3000/api/suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "index.ts",
        code: "const greeting = 'hello';",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toEqual({ suggestion: "const result = 42;" });

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateText.mock.calls[0] as unknown as [{ prompt: string }];
    expect(callArgs[0].prompt).toContain("<file_name>index.ts</file_name>");
    expect(callArgs[0].prompt).toContain("<full_code>\nconst greeting = 'hello';\n</full_code>");
    expect(callArgs[0].prompt).toContain('<current_line number="1"></current_line>');
  });

  // Test 8 — Empty code
  it("Test 8: should permit empty string for code if sent by editor", async () => {
    const request = new Request("http://localhost:3000/api/suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "empty.ts",
        code: "",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ suggestion: "const result = 42;" });
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  // Test 9 — Valid suggestion with full context
  it("Test 9: should process valid complete payload and return { suggestion: string }", async () => {
    const payload = {
      fileName: "calculator.ts",
      code: "function add(a: number, b: number) {\n  return a + b;\n}\n",
      currentLine: "  return a + b;",
      previousLines: "function add(a: number, b: number) {",
      textBeforeCursor: "  return a +",
      textAfterCursor: " b;",
      nextLines: "}",
      lineNumber: 2,
    };

    const request = new Request("http://localhost:3000/api/suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toEqual({ suggestion: "const result = 42;" });

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateText.mock.calls[0] as unknown as [{ prompt: string }];
    expect(callArgs[0].prompt).toContain("<file_name>calculator.ts</file_name>");
    expect(callArgs[0].prompt).toContain('<current_line number="2">  return a + b;</current_line>');
    expect(callArgs[0].prompt).toContain("<before_cursor>  return a +</before_cursor>");
    expect(callArgs[0].prompt).toContain("<after_cursor> b;</after_cursor>");
    expect(callArgs[0].prompt).toContain("<previous_lines>\nfunction add(a: number, b: number) {\n</previous_lines>");
    expect(callArgs[0].prompt).toContain("<next_lines>\n}\n</next_lines>");
  });

  // Test 10 — Provider failure returns 500 without leaking details
  it("Test 10: should return 500 when AI generation fails without leaking internal provider details", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGenerateText.mockRejectedValueOnce(new Error("OpenAI API rate limit exceeded"));

    const request = new Request("http://localhost:3000/api/suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "error.ts",
        code: "const x = 1;",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data).toEqual({ error: "Failed to generate suggestion" });
    expect(data.error).not.toContain("OpenAI API rate limit exceeded");

    consoleErrorSpy.mockRestore();
  });

  // Test 11 — Oversized input
  it("Test 11: should return 400 when code payload exceeds maximum size limit", async () => {
    const oversizedCode = "a".repeat(200_001);

    const request = new Request("http://localhost:3000/api/suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "huge.ts",
        code: oversizedCode,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data).toEqual({ error: "Invalid suggestion payload" });
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // Test 12 — No sensitive logging
  it("Test 12: should not log user code or prompt contents on error", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const secretCode = "const SUPER_SECRET_TOKEN = 'secret_12345';";
    mockGenerateText.mockRejectedValueOnce(new Error("AI connection timeout"));

    const request = new Request("http://localhost:3000/api/suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "secret.ts",
        code: secretCode,
      }),
    });

    await POST(request);

    expect(consoleErrorSpy).toHaveBeenCalled();
    const loggedCalls = consoleErrorSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(loggedCalls).not.toContain(secretCode);
    expect(loggedCalls).not.toContain("SUPER_SECRET_TOKEN");

    consoleErrorSpy.mockRestore();
  });

  // Schema unit tests directly
  describe("suggestionRequestSchema validation", () => {
    it("should accept valid payload with only required fields", () => {
      const parsed = suggestionRequestSchema.safeParse({
        fileName: "test.js",
        code: "console.log(1)",
      });
      expect(parsed.success).toBe(true);
    });

    it("should reject excessively long fileName", () => {
      const parsed = suggestionRequestSchema.safeParse({
        fileName: "a".repeat(501),
        code: "console.log(1)",
      });
      expect(parsed.success).toBe(false);
    });

    it("should reject excessively long context fields", () => {
      const parsed = suggestionRequestSchema.safeParse({
        fileName: "test.js",
        code: "console.log(1)",
        currentLine: "x".repeat(10_001),
      });
      expect(parsed.success).toBe(false);
    });
  });
});
