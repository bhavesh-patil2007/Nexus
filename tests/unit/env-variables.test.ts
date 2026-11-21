import { describe, expect, it } from "vitest";
import {
  parseEnvVariables,
  formatEnvVariables,
  validateEnvVariables,
  ENV_VAR_NAME_REGEX,
} from "@/features/preview/components/preview-settings-popover";

describe("PreviewSettingsPopover environment variable utilities", () => {
  describe("ENV_VAR_NAME_REGEX", () => {
    it("should accept valid environment variable names", () => {
      expect(ENV_VAR_NAME_REGEX.test("PORT")).toBe(true);
      expect(ENV_VAR_NAME_REGEX.test("NODE_ENV")).toBe(true);
      expect(ENV_VAR_NAME_REGEX.test("_PRIVATE")).toBe(true);
      expect(ENV_VAR_NAME_REGEX.test("APP2")).toBe(true);
      expect(ENV_VAR_NAME_REGEX.test("lowercase_var")).toBe(true);
      expect(ENV_VAR_NAME_REGEX.test("Mixed_Case_123")).toBe(true);
      expect(ENV_VAR_NAME_REGEX.test("_")).toBe(true);
    });

    it("should reject invalid environment variable names", () => {
      expect(ENV_VAR_NAME_REGEX.test("BAD NAME")).toBe(false);
      expect(ENV_VAR_NAME_REGEX.test("1PORT")).toBe(false);
      expect(ENV_VAR_NAME_REGEX.test("FOO-BAR")).toBe(false);
      expect(ENV_VAR_NAME_REGEX.test("FOO.BAR")).toBe(false);
      expect(ENV_VAR_NAME_REGEX.test("")).toBe(false);
      expect(ENV_VAR_NAME_REGEX.test("FOO$BAR")).toBe(false);
      expect(ENV_VAR_NAME_REGEX.test("FOO@BAR")).toBe(false);
    });
  });

  describe("validateEnvVariables", () => {
    it("should return valid result for valid entries", () => {
      const result = validateEnvVariables("PORT=3000\nNODE_ENV=development\n_SECRET=key");
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.env).toEqual({
        PORT: "3000",
        NODE_ENV: "development",
        _SECRET: "key",
      });
    });

    it("should report line numbers and invalid name for bad names", () => {
      const input = "PORT=3000\nBAD NAME=value\n1PORT=3000\nFOO-BAR=val\nFOO.BAR=val\n=value";
      const result = validateEnvVariables(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual([
        { lineNumber: 2, message: 'Line 2: Invalid environment variable name "BAD NAME".' },
        { lineNumber: 3, message: 'Line 3: Invalid environment variable name "1PORT".' },
        { lineNumber: 4, message: 'Line 4: Invalid environment variable name "FOO-BAR".' },
        { lineNumber: 5, message: 'Line 5: Invalid environment variable name "FOO.BAR".' },
        { lineNumber: 6, message: 'Line 6: Invalid environment variable name "".' },
      ]);
    });

    it("should report line numbers for malformed lines missing '=' separator", () => {
      const input = "# Header comment\nPORT=3000\n\nMALFORMED_LINE\nJUST_A_WORD";
      const result = validateEnvVariables(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual([
        { lineNumber: 4, message: 'Line 4: Missing "=" separator.' },
        { lineNumber: 5, message: 'Line 5: Missing "=" separator.' },
      ]);
    });

    it("should preserve original line numbers when comments and blank lines precede errors", () => {
      const input = "\n# Comment 1\n# Comment 2\n\n   \nINVALID-KEY=test\n";
      const result = validateEnvVariables(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual([
        { lineNumber: 6, message: 'Line 6: Invalid environment variable name "INVALID-KEY".' },
      ]);
    });

    it("should handle empty or undefined input safely", () => {
      expect(validateEnvVariables("")).toEqual({ valid: true, errors: [], env: {} });
      expect(validateEnvVariables(undefined)).toEqual({ valid: true, errors: [], env: {} });
      expect(validateEnvVariables("   \n\n# comment\n")).toEqual({ valid: true, errors: [], env: {} });
    });
  });

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

      it("should accept valid lowercase, underscore-prefixed, and alphanumeric names", () => {
        const input = "port=3000\n_INTERNAL_KEY=secret\nAPP_V2_PORT=8080";
        expect(parseEnvVariables(input)).toEqual({
          port: "3000",
          _INTERNAL_KEY: "secret",
          APP_V2_PORT: "8080",
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

      it("should preserve values with special characters, punctuation, and spaces in value", () => {
        const input = 'WELCOME_MSG="Hello, World!"\nCONFIG={"debug": true}';
        expect(parseEnvVariables(input)).toEqual({
          WELCOME_MSG: '"Hello, World!"',
          CONFIG: '{"debug": true}',
        });
      });
    });

    describe("E. Edge cases and error validation", () => {
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

      it("should throw an error for malformed lines without an '=' sign", () => {
        const input = "MALFORMED_LINE\nJUST_A_WORD\nVALID=1";
        expect(() => parseEnvVariables(input)).toThrowError(
          'Line 1: Missing "=" separator.\nLine 2: Missing "=" separator.'
        );
      });

      it("should throw an error for lines with empty keys like =value", () => {
        const input = "=empty_key\nGOOD=value";
        expect(() => parseEnvVariables(input)).toThrowError(
          'Line 1: Invalid environment variable name "".'
        );
      });

      it("should throw an error for variable names with spaces", () => {
        const input = "BAD NAME=value";
        expect(() => parseEnvVariables(input)).toThrowError(
          'Line 1: Invalid environment variable name "BAD NAME".'
        );
      });

      it("should throw an error for variable names starting with digits", () => {
        const input = "1PORT=3000";
        expect(() => parseEnvVariables(input)).toThrowError(
          'Line 1: Invalid environment variable name "1PORT".'
        );
      });

      it("should throw an error for variable names containing hyphens or dots", () => {
        const input = "FOO-BAR=val\nFOO.BAR=val";
        expect(() => parseEnvVariables(input)).toThrowError(
          'Line 1: Invalid environment variable name "FOO-BAR".\nLine 2: Invalid environment variable name "FOO.BAR".'
        );
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
