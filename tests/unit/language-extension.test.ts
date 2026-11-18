import { describe, expect, it } from "vitest";

import { getLanguageExtension } from "@/features/editor/extensions/language-extension";

describe("getLanguageExtension", () => {
  it("should return an extension for JavaScript files", () => {
    const ext = getLanguageExtension("main.js");
    expect(ext).toBeDefined();
    expect(ext).not.toEqual([]);
  });

  it("should return an extension for TypeScript files", () => {
    const tsExt = getLanguageExtension("index.ts");
    const tsxExt = getLanguageExtension("App.tsx");
    expect(tsExt).toBeDefined();
    expect(tsxExt).toBeDefined();
  });

  it("should return an extension for JSX files", () => {
    const ext = getLanguageExtension("Component.jsx");
    expect(ext).toBeDefined();
  });

  it("should return an extension for HTML and CSS files", () => {
    const htmlExt = getLanguageExtension("index.html");
    const cssExt = getLanguageExtension("styles.css");
    expect(htmlExt).toBeDefined();
    expect(cssExt).toBeDefined();
  });

  it("should return an extension for JSON files", () => {
    const jsonExt = getLanguageExtension("config.json");
    expect(jsonExt).toBeDefined();
  });

  it("should return an extension for Markdown files (.md and .mdx)", () => {
    const mdExt = getLanguageExtension("README.md");
    const mdxExt = getLanguageExtension("docs.mdx");
    expect(mdExt).toBeDefined();
    expect(mdxExt).toBeDefined();
  });

  it("should return an extension for Python files", () => {
    const pyExt = getLanguageExtension("script.py");
    expect(pyExt).toBeDefined();
  });

  it("should handle uppercase extensions case-insensitively", () => {
    const ext = getLanguageExtension("index.TS");
    expect(ext).toBeDefined();
    expect(ext).not.toEqual([]);
  });

  it("should return empty array for unsupported or unknown extensions", () => {
    expect(getLanguageExtension("Dockerfile")).toEqual([]);
    expect(getLanguageExtension("archive.tar.gz")).toEqual([]);
    expect(getLanguageExtension("plain-text")).toEqual([]);
  });
});
