import {
  downloadArtifact,
  downloadArtifactV0,
  listArtifacts,
  listArtifactsV0,
  MAX_ARTIFACT_BYTES,
  MAX_ARTIFACTS,
  mimeFromName,
} from "@/lib/cursor-api";

export type CollectedFile = {
  name: string;
  bytes: Uint8Array;
  mime: string;
};

const ARTIFACT_EXT =
  "pdf|md|markdown|txt|csv|png|jpe?g|gif|webp|xlsx|docx|pptx|html|json";

const ARTIFACT_PATH_RE = new RegExp(
  `(?:^|[\\s(\`>\`])(artifacts\\/[\\w./-]+\\.(${ARTIFACT_EXT})|[\\w.-]+\\.(${ARTIFACT_EXT}))(?:[\\s)\`.,]|$)`,
  "gi",
);

/** Normalize to v1 download path format: artifacts/filename.ext */
export function normalizeArtifactPath(path: string) {
  const trimmed = path.trim().replace(/^['"`]+|['"`]+$/g, "");
  if (trimmed.startsWith("/opt/cursor/artifacts/")) {
    return trimmed.replace("/opt/cursor/artifacts/", "artifacts/");
  }
  if (trimmed.startsWith("artifacts/")) return trimmed;
  return `artifacts/${trimmed.replace(/^\.?\//, "")}`;
}

/** Pull artifact paths the agent mentioned in its answer. */
export function extractMentionedArtifactPaths(text: string) {
  const paths = new Set<string>();
  for (const match of text.matchAll(/`(artifacts\/[^`]+)`/gi)) {
    paths.add(normalizeArtifactPath(match[1]));
  }
  for (const match of text.matchAll(ARTIFACT_PATH_RE)) {
    const raw = match[1];
    if (raw) paths.add(normalizeArtifactPath(raw));
  }
  return [...paths];
}

export function mentionedArtifactsMissing(
  answer: string | undefined,
  files: CollectedFile[],
) {
  if (!answer?.trim()) return [];
  const collected = new Set(files.map((f) => f.name.toLowerCase()));
  return extractMentionedArtifactPaths(answer).filter((path) => {
    const name = path.split("/").pop()?.toLowerCase();
    return name && !collected.has(name);
  });
}

export async function collectAgentFilesWithRetry(
  agentId: string,
  answer?: string,
  options?: { attempts?: number; delayMs?: number },
): Promise<CollectedFile[]> {
  const attempts = options?.attempts ?? 10;
  const delayMs = options?.delayMs ?? 3000;
  const seen = new Set<string>();
  const files: CollectedFile[] = [];

  const add = (file: CollectedFile) => {
    if (files.length >= MAX_ARTIFACTS) return;
    if (file.bytes.byteLength > MAX_ARTIFACT_BYTES) return;
    const key = file.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    files.push(file);
  };

  for (let attempt = 0; attempt < attempts; attempt++) {
    await collectListedV1(agentId, add);
    await collectListedV0(agentId, add);
    await collectMentioned(agentId, answer, add);

    if (files.length > 0) {
      console.info(
        `[relay] Collected ${files.length} artifact(s) for ${agentId} on attempt ${attempt + 1}`,
      );
      return files;
    }

    if (attempt < attempts - 1) {
      await sleep(delayMs);
    }
  }

  const missing = mentionedArtifactsMissing(answer, files);
  if (missing.length) {
    console.warn(
      `[relay] Agent mentioned artifacts but none were found for ${agentId}: ${missing.join(", ")}`,
    );
  }

  return files;
}

async function collectListedV1(
  agentId: string,
  add: (file: CollectedFile) => void,
) {
  const listed = await listArtifacts(agentId).catch(() => []);
  for (const item of listed.slice(0, MAX_ARTIFACTS)) {
    if (item.sizeBytes && item.sizeBytes > MAX_ARTIFACT_BYTES) continue;
    try {
      const file = await downloadArtifact(agentId, normalizeArtifactPath(item.path));
      add(file);
    } catch (error) {
      console.error(`[relay] v1 artifact ${item.path} failed`, error);
    }
  }
}

async function collectListedV0(
  agentId: string,
  add: (file: CollectedFile) => void,
) {
  const listed = await listArtifactsV0(agentId).catch(() => []);
  for (const item of listed.slice(0, MAX_ARTIFACTS)) {
    if (item.sizeBytes && item.sizeBytes > MAX_ARTIFACT_BYTES) continue;
    try {
      const file = await downloadArtifactV0(agentId, item.absolutePath);
      add(file);
    } catch (error) {
      console.error(`[relay] v0 artifact ${item.absolutePath} failed`, error);
    }
  }
}

async function collectMentioned(
  agentId: string,
  answer: string | undefined,
  add: (file: CollectedFile) => void,
) {
  for (const path of extractMentionedArtifactPaths(answer ?? "")) {
    try {
      const file = await downloadArtifact(agentId, path);
      add(file);
    } catch {
      // Expected when the agent claimed a file it did not actually write.
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { mimeFromName };
