import { describe, expect, it } from "vitest";
import {
  parseEnvVariables,
  formatEnvVariables,
} from "@/features/preview/components/preview-settings-popover";

describe("PreviewSettingsPopover environment variable utilities", () => {
  describe("parseEnvVariables", () => {
    describe("A. Standard parsing", () => {
      it("should parse a single KEY=VALUE pair", () => {
        const input = "API_KEY=abc123";
        expect(parseEnvVariables(input)).toEqual({
          API_KEY: "abc123",
        });
      });

      it("should parse multiple key-value pairs across separate lines", () => {
        const input = "PORT=3000\nNODE_ENV=production\nDEBUG=false";
        expect(parseEnvVariables(input)).toEqual({
          PORT: "3000",
          NODE_ENV: "production",
          DEBUG: "false",
        });
      });
    });

    describe("B. Comments and blank lines", () => {
      it("should ignore lines starting with '#'", () => {
        const input = "# This is a comment\nAPI_KEY=secret\n# Another comment";
        expect(parseEnvVariables(input)).toEqual({
          API_KEY: "secret",
        });
      });

      it("should ignore empty lines and whitespace-only lines", () => {
        const input = "\n\n   \nPORT=8080\n\n\t\n";
        expect(parseEnvVariables(input)).toEqual({
          PORT: "8080",
        });
      });

      it("should ensure comments do not become object properties", () => {
        const input = "# KEY=VALUE\nVALID_KEY=valid_value";
        const result = parseEnvVariables(input);
        expect(result).not.toHaveProperty("# KEY");
        expect(result).not.toHaveProperty("# KEY=VALUE");
        expect(result).toEqual({ VALID_KEY: "valid_value" });
      });
    });

    describe("C. Whitespace handling", () => {
      it("should trim whitespace around keys and values", () => {
        const input = "  TRIMMED_KEY   =   trimmed_value   ";
        expect(parseEnvVariables(input)).toEqual({
          TRIMMED_KEY: "trimmed_value",
        });
      });

      it("should handle surrounding whitespace around the separator", () => {
        const input = "FOO = bar\nBAZ  =qux";
        expect(parseEnvVariables(input)).toEqual({
          FOO: "bar",
          BAZ: "qux",
        });
      });
    });

    describe("D. Multiple equals signs and connection strings", () => {
      it("should preserve values containing multiple '=' characters", () => {
        const input = "BASE64_TOKEN=abc==123=";
        expect(parseEnvVariables(input)).toEqual({
          BASE64_TOKEN: "abc==123=",
        });
      });

      it("should preserve realistic database connection URLs with query params", () => {
        const input =
          "DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=require&pool_timeout=10";
        expect(parseEnvVariables(input)).toEqual({
          DATABASE_URL:
            "postgres://user:pass@host:5432/db?sslmode=require&pool_timeout=10",
        });
      });
    });

    describe("E. Edge cases", () => {
      it("should return an empty object for empty string input", () => {
        expect(parseEnvVariables("")).toEqual({});
      });

      it("should return an empty object for undefined input", () => {
        expect(parseEnvVariables(undefined)).toEqual({});
      });

      it("should handle empty values such as EMPTY=", () => {
        const input = "EMPTY=";
        expect(parseEnvVariables(input)).toEqual({
          EMPTY: "",
        });
      });

      it("should ignore malformed lines without an '=' sign", () => {
        const input = "MALFORMED_LINE\nJUST_A_WORD\nVALID=1";
        expect(parseEnvVariables(input)).toEqual({
          VALID: "1",
        });
      });

      it("should ignore lines with empty keys like =value", () => {
        const input = "=empty_key\nGOOD=value";
        expect(parseEnvVariables(input)).toEqual({
          GOOD: "value",
        });
      });
    });
  });

  describe("formatEnvVariables", () => {
    describe("A. Standard formatting", () => {
      it("should format a single key-value pair", () => {
        const env = { PORT: "3000" };
        expect(formatEnvVariables(env)).toBe("PORT=3000");
      });

      it("should format multiple key-value pairs separated by newlines", () => {
        const env = {
          NODE_ENV: "production",
          PORT: "8080",
        };
        expect(formatEnvVariables(env)).toBe("NODE_ENV=production\nPORT=8080");
      });
    });

    describe("B. Edge cases", () => {
      it("should return an empty string for an empty object", () => {
        expect(formatEnvVariables({})).toBe("");
      });

      it("should return an empty string for undefined input", () => {
        expect(formatEnvVariables(undefined)).toBe("");
      });

      it("should format keys with empty string values", () => {
        const env = { EMPTY: "" };
        expect(formatEnvVariables(env)).toBe("EMPTY=");
      });

      it("should format values containing '=' correctly", () => {
        const env = {
          DATABASE_URL: "postgres://host/db?ssl=true&timeout=5",
        };
        expect(formatEnvVariables(env)).toBe(
          "DATABASE_URL=postgres://host/db?ssl=true&timeout=5"
        );
      });
    });

    describe("C. Round-trip behavior", () => {
      it("should maintain symmetry when parsing formatted environment variables", () => {
        const originalEnv = {
          API_KEY: "secret123",
          DB_URL: "postgres://user:pass@host:5432/mydb?ssl=true",
          DEBUG: "false",
          EMPTY_VAL: "",
        };

        const formatted = formatEnvVariables(originalEnv);
        const parsed = parseEnvVariables(formatted);

        expect(parsed).toEqual(originalEnv);
      });

      it("should preserve parsed values through a format-parse cycle", () => {
        const input = `
# Environment Configuration
APP_NAME=Nexus
APP_PORT=3000
SECRET_KEY=abc=def=123
EMPTY_SETTING=
`;
        const firstParse = parseEnvVariables(input);
        const formatted = formatEnvVariables(firstParse);
        const secondParse = parseEnvVariables(formatted);

        expect(secondParse).toEqual(firstParse);
      });
    });
  });
});
