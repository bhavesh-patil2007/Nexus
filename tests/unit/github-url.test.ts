import { describe, expect, it, vi, beforeEach } from "vitest";
import { parseGitHubUrl, POST } from "@/app/api/github/import/route";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.mock("@/lib/convex-client", () => ({
  convex: {
    mutation: vi.fn(),
  },
}));

vi.mock("@/inngest/client", () => ({
  inngest: {
    send: vi.fn(),
  },
}));

describe("parseGitHubUrl", () => {
  describe("A. Standard HTTPS URLs", () => {
    it("should extract owner and repo from standard HTTPS URL", () => {
      const result = parseGitHubUrl("https://github.com/shashankkshyp/Nexus");
      expect(result).toEqual({
        owner: "shashankkshyp",
        repo: "Nexus",
      });
    });

    it("should extract owner and repo from another standard repository URL", () => {
      const result = parseGitHubUrl("https://github.com/facebook/react");
      expect(result).toEqual({
        owner: "facebook",
        repo: "react",
      });
    });
  });

  describe("B. Standard HTTP URLs", () => {
    it("should accept http:// scheme for github.com", () => {
      const result = parseGitHubUrl("http://github.com/facebook/react");
      expect(result).toEqual({
        owner: "facebook",
        repo: "react",
      });
    });

    it("should accept http:// scheme for www.github.com", () => {
      const result = parseGitHubUrl("http://www.github.com/owner/repo");
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
      });
    });
  });

  describe("C. HTTPS URL with www. prefix", () => {
    it("should accept www.github.com domain", () => {
      const result = parseGitHubUrl("https://www.github.com/owner/repo");
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
      });
    });
  });

  describe("D. HTTPS URL with .git suffix", () => {
    it("should strip trailing .git suffix from repository name", () => {
      const result = parseGitHubUrl("https://github.com/vercel/next.js.git");
      expect(result).toEqual({
        owner: "vercel",
        repo: "next.js",
      });
    });

    it("should correctly handle simple repo ending in .git", () => {
      const result = parseGitHubUrl("https://github.com/owner/my-repo.git");
      expect(result).toEqual({
        owner: "owner",
        repo: "my-repo",
      });
    });
  });

  describe("E. URL without protocol", () => {
    it("should parse GitHub URL when protocol is omitted", () => {
      const result = parseGitHubUrl("github.com/srnsksyp/nexus-wocs");
      expect(result).toEqual({
        owner: "srnsksyp",
        repo: "nexus-wocs",
      });
    });

    it("should parse www.github.com without protocol", () => {
      const result = parseGitHubUrl("www.github.com/srnsksyp/nexus-wocs");
      expect(result).toEqual({
        owner: "srnsksyp",
        repo: "nexus-wocs",
      });
    });

    it("should parse protocol-free URL with .git suffix", () => {
      const result = parseGitHubUrl("github.com/torvalds/linux.git");
      expect(result).toEqual({
        owner: "torvalds",
        repo: "linux",
      });
    });
  });

  describe("F. Deep repository links", () => {
    it("should extract only owner and repo from deep link into branch or tree", () => {
      const result = parseGitHubUrl("https://github.com/owner/repo/tree/main/src");
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
      });
    });

    it("should extract only owner and repo from blob path", () => {
      const result = parseGitHubUrl("https://github.com/owner/repo/blob/main/README.md");
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
      });
    });

    it("should extract only owner and repo from commits or issues subpaths", () => {
      const result = parseGitHubUrl("https://github.com/owner/repo/issues/123");
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
      });
    });
  });

  describe("G. Query strings and URL fragments", () => {
    it("should ignore query strings and hash fragments", () => {
      const result = parseGitHubUrl("https://github.com/owner/repo?tab=readme#section");
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
      });
    });
  });

  describe("H. Lookalike and hostile domains (security)", () => {
    it("should reject lookalike domain with subdomain evil.github.com", () => {
      expect(() => parseGitHubUrl("https://evil.github.com/owner/repo")).toThrowError(
        "Invalid GitHub URL"
      );
    });

    it("should reject github.com as subdomain of attacker domain", () => {
      expect(() => parseGitHubUrl("https://github.com.evil.example/owner/repo")).toThrowError(
        "Invalid GitHub URL"
      );
    });

    it("should reject hyphenated lookalike evil-github.com", () => {
      expect(() => parseGitHubUrl("https://evil-github.com/owner/repo")).toThrowError(
        "Invalid GitHub URL"
      );
    });

    it("should reject attacker domain with github.com in path", () => {
      expect(() => parseGitHubUrl("https://example.com/github.com/owner/repo")).toThrowError(
        "Invalid GitHub URL"
      );
    });

    it("should reject completely unrelated domains like gitlab or bitbucket", () => {
      expect(() => parseGitHubUrl("https://gitlab.com/owner/repo")).toThrowError(
        "Invalid GitHub URL"
      );
      expect(() => parseGitHubUrl("https://bitbucket.org/owner/repo")).toThrowError(
        "Invalid GitHub URL"
      );
    });
  });

  describe("I. Dangerous protocols and schemes", () => {
    it("should reject javascript: protocol", () => {
      expect(() => parseGitHubUrl("javascript:alert(1)")).toThrowError("Invalid GitHub URL");
      expect(() => parseGitHubUrl("javascript:github.com/owner/repo")).toThrowError("Invalid GitHub URL");
    });

    it("should reject file: protocol", () => {
      expect(() => parseGitHubUrl("file:///etc/passwd")).toThrowError("Invalid GitHub URL");
    });

    it("should reject ftp: and data: protocols", () => {
      expect(() => parseGitHubUrl("ftp://github.com/owner/repo")).toThrowError("Invalid GitHub URL");
      expect(() => parseGitHubUrl("data:text/plain;base64,SGVsbG8=")).toThrowError("Invalid GitHub URL");
    });
  });

  describe("J. Missing or invalid repository/owner paths", () => {
    it("should reject empty string or whitespace only", () => {
      expect(() => parseGitHubUrl("")).toThrowError("Invalid GitHub URL");
      expect(() => parseGitHubUrl("   ")).toThrowError("Invalid GitHub URL");
    });

    it("should reject bare domain without paths", () => {
      expect(() => parseGitHubUrl("https://github.com")).toThrowError("Invalid GitHub URL");
      expect(() => parseGitHubUrl("https://github.com/")).toThrowError("Invalid GitHub URL");
    });

    it("should reject owner only without repository", () => {
      expect(() => parseGitHubUrl("https://github.com/owner")).toThrowError("Invalid GitHub URL");
      expect(() => parseGitHubUrl("https://github.com/owner/")).toThrowError("Invalid GitHub URL");
    });

    it("should reject path with empty repo name or double slash at owner position", () => {
      expect(() => parseGitHubUrl("https://github.com//repo")).toThrowError("Invalid GitHub URL");
      expect(() => parseGitHubUrl("https://github.com///")).toThrowError("Invalid GitHub URL");
    });

    it("should reject dot or dot-dot path segments", () => {
      expect(() => parseGitHubUrl("https://github.com/./repo")).toThrowError("Invalid GitHub URL");
      expect(() => parseGitHubUrl("https://github.com/owner/.")).toThrowError("Invalid GitHub URL");
      expect(() => parseGitHubUrl("https://github.com/../repo")).toThrowError("Invalid GitHub URL");
      expect(() => parseGitHubUrl("https://github.com/owner/..")).toThrowError("Invalid GitHub URL");
    });

    it("should reject repo that becomes empty when .git is stripped", () => {
      expect(() => parseGitHubUrl("https://github.com/owner/.git")).toThrowError("Invalid GitHub URL");
    });

    it("should reject invalid characters in owner or repository names", () => {
      expect(() => parseGitHubUrl("https://github.com/owner<script>/repo")).toThrowError("Invalid GitHub URL");
      expect(() => parseGitHubUrl("https://github.com/owner/repo$name")).toThrowError("Invalid GitHub URL");
    });
  });

  describe("K. Additional valid edge cases", () => {
    it("should support repository and owner names containing hyphens and underscores", () => {
      const result = parseGitHubUrl("https://github.com/my-org_team/my_awesome-repo");
      expect(result).toEqual({
        owner: "my-org_team",
        repo: "my_awesome-repo",
      });
    });

    it("should support numbers in owner and repository names", () => {
      const result = parseGitHubUrl("https://github.com/user123/repo456");
      expect(result).toEqual({
        owner: "user123",
        repo: "repo456",
      });
    });

    it("should handle trailing slash after repository name", () => {
      const result = parseGitHubUrl("https://github.com/owner/repo/");
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
      });
    });

    it("should trim surrounding whitespace from URL string", () => {
      const result = parseGitHubUrl("   https://github.com/owner/repo   \n");
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
      });
    });
  });
});

describe("POST /api/github/import route handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 with 'Invalid request body' when JSON body is missing or unparseable", async () => {
    const { auth } = await import("@clerk/nextjs/server");
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);

    const request = new Request("http://localhost:3000/api/github/import", {
      method: "POST",
      body: "not-valid-json",
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid request body" });
  });

  it("should return 400 with 'Invalid request body' when url field is missing or empty", async () => {
    const { auth } = await import("@clerk/nextjs/server");
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);

    const request = new Request("http://localhost:3000/api/github/import", {
      method: "POST",
      body: JSON.stringify({ url: "" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid request body" });
  });

  it("should return 400 with 'Invalid GitHub URL' when URL is a lookalike domain", async () => {
    const { auth } = await import("@clerk/nextjs/server");
    const { convex } = await import("@/lib/convex-client");
    const { inngest } = await import("@/inngest/client");

    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);

    const request = new Request("http://localhost:3000/api/github/import", {
      method: "POST",
      body: JSON.stringify({ url: "https://evil-github.com/owner/repo" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid GitHub URL" });

    // Verify no side effects occurred
    expect(convex.mutation).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("should return 400 with 'Invalid GitHub URL' when URL has dangerous scheme or malformed path", async () => {
    const { auth } = await import("@clerk/nextjs/server");
    const { convex } = await import("@/lib/convex-client");
    const { inngest } = await import("@/inngest/client");

    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);

    const request = new Request("http://localhost:3000/api/github/import", {
      method: "POST",
      body: JSON.stringify({ url: "https://github.com/owner" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toEqual({ error: "Invalid GitHub URL" });

    // Verify no side effects occurred
    expect(convex.mutation).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
  });
});
