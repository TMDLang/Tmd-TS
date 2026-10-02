import { extractTmdTitle } from "./storage/db.js";

export interface GistFileItem {
  filename: string;
  type?: string;
  language?: string;
  raw_url?: string;
  size?: number;
  truncated?: boolean;
  content?: string;
}

export interface GistApiResponse {
  id?: string;
  description?: string;
  files: Record<string, GistFileItem>;
}

export interface GistImportResult {
  gistId: string;
  filename: string;
  title: string;
  content: string;
  description?: string;
}

/**
 * Extracts a valid GitHub Gist ID from a URL or raw ID string.
 * Supports:
 * - https://gist.github.com/:user/:id
 * - https://gist.github.com/:id
 * - https://gist.githubusercontent.com/:user/:id/raw/...
 * - Direct alphanumeric/hex ID
 */
export function extractGistId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // gist.githubusercontent.com/:user/:gistId/raw/...
  const rawMatch = trimmed.match(/^https?:\/\/gist\.githubusercontent\.com\/[^/]+\/([a-f0-9]+)/i);
  if (rawMatch) {
    return rawMatch[1];
  }

  // gist.github.com/(:user/)?(:gistId)(#...)?
  const webMatch = trimmed.match(/^https?:\/\/gist\.github\.com\/(?:[^/]+\/)?([a-f0-9]+)(?:[#?].*)?$/i);
  if (webMatch) {
    return webMatch[1];
  }

  // Direct hex or alphanumeric ID (typically 20 or 32 hex chars, or digits)
  if (/^[a-f0-9]{8,}$/i.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Fetches and resolves a TMD score from a GitHub Gist ID or URL.
 */
export async function fetchGistTmd(
  gistIdOrUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<GistImportResult> {
  const gistId = extractGistId(gistIdOrUrl);
  if (!gistId) {
    throw new Error("Invalid GitHub Gist URL or ID");
  }

  const apiUrl = `https://api.github.com/gists/${gistId}`;
  const resp = await fetchFn(apiUrl, {
    headers: {
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!resp.ok) {
    if (resp.status === 404) {
      throw new Error(`Gist not found: ${gistId}`);
    }
    if (resp.status === 403) {
      throw new Error("GitHub API rate limit exceeded. Please try again later.");
    }
    throw new Error(`Failed to fetch Gist (${resp.status} ${resp.statusText})`);
  }

  const data = (await resp.json()) as GistApiResponse;
  const files = Object.values(data.files || {});
  if (files.length === 0) {
    throw new Error("Gist contains no files");
  }

  // 1. Prefer .tmd files
  let targetFile = files.find((f) => f.filename.toLowerCase().endsWith(".tmd"));

  // 2. If not found, check files whose content includes ::SCORE::
  if (!targetFile) {
    targetFile = files.find(
      (f) => typeof f.content === "string" && f.content.includes("::SCORE::")
    );
  }

  // 3. If still not found, check .txt files
  if (!targetFile) {
    targetFile = files.find((f) => f.filename.toLowerCase().endsWith(".txt"));
  }

  if (!targetFile) {
    throw new Error("No TMD score found in this Gist (expected a .tmd file or ::SCORE:: header)");
  }

  let content = targetFile.content || "";
  // If file content was truncated by GitHub API, fetch full text from raw_url
  if (targetFile.truncated && targetFile.raw_url) {
    const rawResp = await fetchFn(targetFile.raw_url);
    if (!rawResp.ok) {
      throw new Error(`Failed to fetch raw file content from ${targetFile.raw_url}`);
    }
    content = await rawResp.text();
  }

  if (!content.trim()) {
    throw new Error(`Selected file '${targetFile.filename}' is empty`);
  }

  const extracted = extractTmdTitle(content);
  const title =
    extracted && extracted !== "未命名樂譜"
      ? extracted
      : targetFile.filename.replace(/\.[^/.]+$/, "") || "Gist Score";


  return {
    gistId,
    filename: targetFile.filename,
    title,
    content,
    description: data.description,
  };
}
