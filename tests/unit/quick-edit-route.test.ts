import { describe, expect, it, vi } from "vitest";

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

vi.mock("ai", () => ({
  generateText: vi.fn(async () => ({
    output: { editedCode: "// mocked edited code" },
  })),
  Output: {
    object: vi.fn(),
  },
}));

vi.mock("@/lib/firecrawl", () => ({
  firecrawl: {
    scrape: vi.fn(async () => ({ markdown: "" })),
  },
}));

import { POST } from "@/app/api/quick-edit/route";

describe("POST /api/quick-edit", () => {
  it("should return 401 when request is unauthenticated (no userId)", async () => {
    mockUserId = null;

    const request = new Request("http://localhost:3000/api/quick-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedCode: "const x = 1;",
        instruction: "make it 2",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);

    const data = await response.json();
    expect(data).toEqual({ error: "Unauthorized" });
  });

  it("should return 400 when authenticated but selectedCode is missing", async () => {
    mockUserId = "user_test_123";

    const request = new Request("http://localhost:3000/api/quick-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instruction: "make it 2",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data).toEqual({ error: "Selected code is required" });
  });

  it("should return 400 when authenticated but instruction is missing", async () => {
    mockUserId = "user_test_123";

    const request = new Request("http://localhost:3000/api/quick-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedCode: "const x = 1;",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data).toEqual({ error: "Instruction is required" });
  });
});
