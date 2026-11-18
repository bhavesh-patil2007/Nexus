import { describe, expect, it } from "vitest";
import { parseGitHubUrl } from "@/app/api/github/import/route";

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

  describe("B. HTTPS URL with .git suffix", () => {
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

  describe("C. URL without protocol", () => {
    it("should parse GitHub URL when protocol is omitted", () => {
      const result = parseGitHubUrl("github.com/srnsksyp/nexus-wocs");
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

  describe("D. Deep repository links", () => {
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

  describe("E. Invalid URLs", () => {
    it("should throw 'Invalid GitHub URL' for non-GitHub URLs (e.g., GitLab)", () => {
      expect(() => parseGitHubUrl("https://gitlab.com/owner/repo")).toThrowError(
        "Invalid GitHub URL"
      );
    });

    it("should throw 'Invalid GitHub URL' for unrelated websites", () => {
      expect(() => parseGitHubUrl("https://example.com/some/path")).toThrowError(
        "Invalid GitHub URL"
      );
    });

    it("should throw 'Invalid GitHub URL' for missing repository path", () => {
      expect(() => parseGitHubUrl("https://github.com/owner")).toThrowError(
        "Invalid GitHub URL"
      );
    });

    it("should throw 'Invalid GitHub URL' for empty string", () => {
      expect(() => parseGitHubUrl("")).toThrowError("Invalid GitHub URL");
    });
  });

  describe("F. Additional edge cases", () => {
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
  });
});
