import { describe, expect, it } from "vitest";

import {
  QUICK_EDIT_PROMPT,
  quickEditSchema,
  URL_REGEX,
} from "@/app/api/quick-edit/route";

describe("quick-edit route prompt and schema", () => {
  describe("QUICK_EDIT_PROMPT template", () => {
    it("should contain the required placeholders", () => {
      expect(QUICK_EDIT_PROMPT).toContain("{selectedCode}");
      expect(QUICK_EDIT_PROMPT).toContain("{fullCode}");
      expect(QUICK_EDIT_PROMPT).toContain("{instruction}");
      expect(QUICK_EDIT_PROMPT).toContain("{documentation}");
    });

    it("should format replacement tokens correctly", () => {
      const selected = "const a = 1;";
      const full = "const a = 1;\nconst b = 2;";
      const instruction = "rename a to count";
      const docContext = "<doc url='test'>guide</doc>";

      const renderedPrompt = QUICK_EDIT_PROMPT
        .replace("{selectedCode}", selected)
        .replace("{fullCode}", full)
        .replace("{instruction}", instruction)
        .replace("{documentation}", docContext);

      expect(renderedPrompt).toContain("<selected_code>\nconst a = 1;\n</selected_code>");
      expect(renderedPrompt).toContain("<full_code_context>\nconst a = 1;\nconst b = 2;\n</full_code_context>");
      expect(renderedPrompt).toContain("<instruction>\nrename a to count\n</instruction>");
      expect(renderedPrompt).toContain(docContext);
      expect(renderedPrompt).not.toContain("{selectedCode}");
      expect(renderedPrompt).not.toContain("{instruction}");
    });
  });

  describe("URL_REGEX", () => {
    it("should match http and https URLs", () => {
      const text = "Check https://docs.convex.dev/quickstart and http://example.com/api";
      const matches = text.match(URL_REGEX);
      expect(matches).toEqual([
        "https://docs.convex.dev/quickstart",
        "http://example.com/api",
      ]);
    });

    it("should return null when no URLs are present", () => {
      const text = "Add error handling to this function";
      const matches = text.match(URL_REGEX);
      expect(matches).toBeNull();
    });
  });

  describe("quickEditSchema", () => {
    it("should validate an object with editedCode string", () => {
      const valid = { editedCode: "const count = 1;" };
      const parsed = quickEditSchema.safeParse(valid);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.editedCode).toBe("const count = 1;");
      }
    });

    it("should fail validation if editedCode is missing or not a string", () => {
      const missing = {};
      const nonString = { editedCode: 12345 };

      expect(quickEditSchema.safeParse(missing).success).toBe(false);
      expect(quickEditSchema.safeParse(nonString).success).toBe(false);
    });
  });
});
