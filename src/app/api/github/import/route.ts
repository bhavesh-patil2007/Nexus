import { z } from "zod";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

import { convex } from "@/lib/convex-client";
import { inngest } from "@/inngest/client";

import { api } from "../../../../../convex/_generated/api";

const requestSchema = z.object({
  url: z.string().trim().min(1, "URL is required"),
});

const GITHUB_NAME_REGEX = /^[a-zA-Z0-9_.-]+$/;

export function parseGitHubUrl(rawUrl: string) {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new Error("Invalid GitHub URL");
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error("Invalid GitHub URL");
  }

  // Reject unsupported URI schemes early (e.g. javascript:, file:, data:, ftp:)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    throw new Error("Invalid GitHub URL");
  }

  // Normalize protocol-free input (e.g. github.com/owner/repo) safely
  const urlToParse = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(urlToParse);
  } catch {
    throw new Error("Invalid GitHub URL");
  }

  // Only allow http: and https: protocols
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Invalid GitHub URL");
  }

  // Validate strict hostname equality
  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== "github.com" && hostname !== "www.github.com") {
    throw new Error("Invalid GitHub URL");
  }

  // Extract non-empty pathname segments
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new Error("Invalid GitHub URL");
  }

  const rawOwner = segments[0];
  const rawRepo = segments[1];

  let repo = rawRepo;
  if (repo.endsWith(".git")) {
    repo = repo.slice(0, -4);
  }

  if (
    !rawOwner ||
    !repo ||
    !GITHUB_NAME_REGEX.test(rawOwner) ||
    !GITHUB_NAME_REGEX.test(repo) ||
    rawOwner === "." ||
    rawOwner === ".." ||
    repo === "." ||
    repo === ".."
  ) {
    throw new Error("Invalid GitHub URL");
  }

  return { owner: rawOwner, repo };
}

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const parseResult = requestSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { url } = parseResult.data;

  let owner: string;
  let repo: string;
  try {
    const parsed = parseGitHubUrl(url);
    owner = parsed.owner;
    repo = parsed.repo;
  } catch {
    return NextResponse.json(
      { error: "Invalid GitHub URL" },
      { status: 400 }
    );
  }

  const client = await clerkClient();
  const tokens = await client.users.getUserOauthAccessToken(
    userId,
    "github"
  );
  const githubToken = tokens.data[0]?.token;

  if (!githubToken) {
    return NextResponse.json(
      { error: "GitHub not connected. Please reconnect your GitHub account." },
      { status: 400 }
    );
  }

  const internalKey = process.env.NEXUS_CONVEX_INTERNAL_KEY;

  if (!internalKey) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  const projectId = await convex.mutation(api.system.createProject, {
    internalKey,
    name: repo,
    ownerId: userId,
  });

  const event = await inngest.send({
    name: "github/import.repo",
    data: {
      owner,
      repo,
      projectId,
      githubToken,
    },
  });

  return NextResponse.json({ 
    success: true, 
    projectId, 
    eventId: event.ids[0]
  });
};