import { generateText, Output } from "ai";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";

export const suggestionRequestSchema = z.object({
  fileName: z.string().trim().min(1, "fileName is required").max(500, "fileName is too long"),
  code: z.string().max(200_000, "code payload exceeds maximum size limit"),
  currentLine: z.string().max(10_000, "currentLine is too long").optional(),
  previousLines: z.string().max(50_000, "previousLines is too long").optional(),
  textBeforeCursor: z.string().max(10_000, "textBeforeCursor is too long").optional(),
  textAfterCursor: z.string().max(10_000, "textAfterCursor is too long").optional(),
  nextLines: z.string().max(50_000, "nextLines is too long").optional(),
  lineNumber: z.number().int("lineNumber must be an integer").nonnegative("lineNumber must be non-negative").max(1_000_000, "lineNumber is too large").optional(),
});

export const suggestionSchema = z.object({
  suggestion: z
    .string()
    .describe(
      "The code to insert at cursor, or empty string if no completion needed"
    ),
});

export const SUGGESTION_PROMPT = `You are a code suggestion assistant.

<context>
<file_name>{fileName}</file_name>
<previous_lines>
{previousLines}
</previous_lines>
<current_line number="{lineNumber}">{currentLine}</current_line>
<before_cursor>{textBeforeCursor}</before_cursor>
<after_cursor>{textAfterCursor}</after_cursor>
<next_lines>
{nextLines}
</next_lines>
<full_code>
{code}
</full_code>
</context>

<instructions>
Follow these steps IN ORDER:

1. First, look at next_lines. If next_lines contains ANY code, check if it continues from where the cursor is. If it does, return empty string immediately - the code is already written.

2. Check if before_cursor ends with a complete statement (;, }, )). If yes, return empty string.

3. Only if steps 1 and 2 don't apply: suggest what should be typed at the cursor position, using context from full_code.

Your suggestion is inserted immediately after the cursor, so never suggest code that's already in the file.
</instructions>`;

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const parseResult = suggestionRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid suggestion payload" },
        { status: 400 }
      );
    }

    const {
      fileName,
      code,
      currentLine = "",
      previousLines = "",
      textBeforeCursor = "",
      textAfterCursor = "",
      nextLines = "",
      lineNumber = 1,
    } = parseResult.data;

    const prompt = SUGGESTION_PROMPT
      .replace("{fileName}", fileName)
      .replace("{code}", code)
      .replace("{currentLine}", currentLine)
      .replace("{previousLines}", previousLines)
      .replace("{textBeforeCursor}", textBeforeCursor)
      .replace("{textAfterCursor}", textAfterCursor)
      .replace("{nextLines}", nextLines)
      .replace("{lineNumber}", lineNumber.toString());

    const { output } = await generateText({
      model: openai("gpt-4.1-mini"),
      output: Output.object({ schema: suggestionSchema }),
      prompt,
    });

    return NextResponse.json({ suggestion: output.suggestion });
  } catch (error) {
    console.error("Suggestion error: ", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { error: "Failed to generate suggestion" },
      { status: 500 }
    );
  }
}
