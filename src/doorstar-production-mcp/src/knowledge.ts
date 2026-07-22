import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_DOCUMENT_BYTES = 256 * 1024;
const MAX_CHUNK_CHARS = 1_600;
const CURATED_DIRECTORIES = [
  "docs/knowledge/domain",
  "docs/knowledge/patterns",
  "docs/knowledge/context",
  "docs/knowledge/architecture",
  "docs/knowledge/deployment",
];
const CURATED_FILES = [
  "docs/FEDERATION_PROTOCOL.md",
  "src/production-service/README.md",
  "src/doorstar-production-mcp/README.md",
];
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:password|token|secret|api[_-]?key|private[_-]?key)\b\s*[:=]\s*(?!["']?(?:\$\{|\{\{|<|\[redacted\]))["']?[^\s"']{8,}/i,
  /:\/\/[^\s/:@]+:[^\s/@]{8,}@/i,
];

export interface KnowledgeSource {
  path: string;
  title: string;
  kind: "domain" | "pattern" | "context" | "architecture" | "deployment" | "protocol" | "service" | "mcp";
  sha256: string;
}

export interface KnowledgeChunk {
  id: string;
  source: KnowledgeSource;
  section: string;
  text: string;
  tokens: string[];
}

export interface KnowledgeCorpus {
  corpusVersion: string;
  indexedAt: string;
  documentCount: number;
  chunkCount: number;
  exclusions: Record<string, number>;
  sources: KnowledgeSource[];
  chunks: KnowledgeChunk[];
}

export interface KnowledgeSearchResult {
  id: string;
  score: number;
  source: KnowledgeSource;
  section: string;
  excerpt: string;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Normalize Hungarian accents so an agent's plain-ASCII query can still find
 * terms such as "fűrész" and "megmunkálás". */
export function tokenize(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[\p{L}\p{N}]{2,}/gu) ?? [];
}

function kindFor(relativePath: string): KnowledgeSource["kind"] {
  if (relativePath.includes("/domain/")) return "domain";
  if (relativePath.includes("/patterns/")) return "pattern";
  if (relativePath.includes("/context/")) return "context";
  if (relativePath.includes("/architecture/")) return "architecture";
  if (relativePath.includes("/deployment/")) return "deployment";
  if (relativePath === "docs/FEDERATION_PROTOCOL.md") return "protocol";
  if (relativePath.includes("production-service")) return "service";
  return "mcp";
}

function titleFrom(markdown: string, fallback: string): string {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? fallback;
}

function chunkMarkdown(markdown: string, source: KnowledgeSource): KnowledgeChunk[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections: Array<{ heading: string; body: string }> = [];
  let heading = source.title;
  let body: string[] = [];
  const flush = () => {
    const text = body.join("\n").trim();
    if (text) sections.push({ heading, body: text });
    body = [];
  };

  for (const line of lines) {
    const match = /^(#{1,3})\s+(.+)$/.exec(line);
    if (match) {
      flush();
      heading = match[2].trim();
    } else {
      body.push(line);
    }
  }
  flush();

  const chunks: KnowledgeChunk[] = [];
  for (const section of sections) {
    const paragraphs = section.body.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
    let current = "";
    const emit = () => {
      const text = current.trim();
      if (!text) return;
      const tokens = tokenize(`${section.heading}\n${text}`);
      if (!tokens.length) return;
      chunks.push({
        id: sha256(`${source.path}\n${section.heading}\n${chunks.length}`),
        source,
        section: section.heading,
        text,
        tokens,
      });
      current = "";
    };
    for (const paragraph of paragraphs) {
      if (current && current.length + paragraph.length + 2 > MAX_CHUNK_CHARS) emit();
      if (paragraph.length > MAX_CHUNK_CHARS) {
        for (let offset = 0; offset < paragraph.length; offset += MAX_CHUNK_CHARS) {
          current = paragraph.slice(offset, offset + MAX_CHUNK_CHARS);
          emit();
        }
      } else {
        current = current ? `${current}\n\n${paragraph}` : paragraph;
      }
    }
    emit();
  }
  return chunks;
}

async function listMarkdownFiles(directory: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const filePath = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) return [];
        if (entry.isDirectory()) return listMarkdownFiles(filePath);
        return entry.isFile() && entry.name.endsWith(".md") ? [filePath] : [];
      })
    );
    return nested.flat();
  } catch {
    return [];
  }
}

async function isCleanTracked(repositoryRoot: string, relativePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain", "--", relativePath], { cwd: repositoryRoot });
    return stdout.trim().length === 0;
  } catch {
    // A knowledge index must fail closed when it cannot prove source provenance.
    return false;
  }
}

function addExclusion(exclusions: Record<string, number>, reason: string) {
  exclusions[reason] = (exclusions[reason] ?? 0) + 1;
}

/** The corpus errs on the side of exclusion: a document that resembles it
 * contains a credential is never surfaced as agent context. */
export function containsSecretPattern(markdown: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(markdown));
}

/** Load only an explicit, clean and size-bounded documentation corpus. The
 * repository is never scanned generically, so deployment/config/secrets files
 * cannot be accidentally surfaced to an agent. */
export async function loadKnowledgeCorpus(repositoryRoot = process.cwd()): Promise<KnowledgeCorpus> {
  const exclusions: Record<string, number> = {};
  const candidates = [
    ...(await Promise.all(CURATED_DIRECTORIES.map((directory) => listMarkdownFiles(path.join(repositoryRoot, directory))))).flat(),
    ...CURATED_FILES.map((file) => path.join(repositoryRoot, file)),
  ];
  const uniqueCandidates = Array.from(new Set(candidates));
  const sources: KnowledgeSource[] = [];
  const chunks: KnowledgeChunk[] = [];

  for (const filePath of uniqueCandidates) {
    const relativePath = path.relative(repositoryRoot, filePath).split(path.sep).join("/");
    if (!relativePath || relativePath.startsWith("../") || !(await isCleanTracked(repositoryRoot, relativePath))) {
      addExclusion(exclusions, "uncommitted_or_untracked");
      continue;
    }
    let stats;
    try {
      stats = await fs.lstat(filePath);
    } catch {
      addExclusion(exclusions, "missing");
      continue;
    }
    if (!stats.isFile() || stats.size > MAX_DOCUMENT_BYTES) {
      addExclusion(exclusions, stats.size > MAX_DOCUMENT_BYTES ? "too_large" : "not_regular_file");
      continue;
    }
    const buffer = await fs.readFile(filePath);
    const markdown = buffer.toString("utf8");
    if (markdown.includes("\uFFFD")) {
      addExclusion(exclusions, "not_utf8");
      continue;
    }
    if (containsSecretPattern(markdown)) {
      addExclusion(exclusions, "secret_pattern");
      continue;
    }
    const source: KnowledgeSource = {
      path: relativePath,
      title: titleFrom(markdown, path.basename(relativePath, ".md")),
      kind: kindFor(relativePath),
      sha256: sha256(buffer),
    };
    sources.push(source);
    chunks.push(...chunkMarkdown(markdown, source));
  }

  const corpusVersion = sha256(sources.map((source) => `${source.path}:${source.sha256}`).sort().join("\n"));
  return {
    corpusVersion,
    indexedAt: new Date().toISOString(),
    documentCount: sources.length,
    chunkCount: chunks.length,
    exclusions,
    sources,
    chunks,
  };
}

function excerpt(text: string, queryTerms: string[]): string {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const firstMatch = queryTerms.map((term) => normalized.indexOf(term)).find((index) => index >= 0) ?? 0;
  const start = Math.max(0, firstMatch - 180);
  const slice = text.slice(start, start + 720).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${slice}${start + slice.length < text.length ? "…" : ""}`;
}

/** BM25-style lexical retrieval is deterministic, local and suitable for the
 * small curated Doorstar corpus. The returned excerpts are supplied to the
 * agent as retrieval context; the model remains responsible for synthesis. */
export function searchKnowledge(corpus: KnowledgeCorpus, query: string, limit = 5): KnowledgeSearchResult[] {
  const queryTerms = Array.from(new Set(tokenize(query)));
  if (!queryTerms.length || !corpus.chunks.length) return [];
  const averageLength = corpus.chunks.reduce((sum, chunk) => sum + chunk.tokens.length, 0) / corpus.chunks.length;
  const documentFrequency = new Map<string, number>();
  for (const term of queryTerms) {
    documentFrequency.set(term, corpus.chunks.filter((chunk) => chunk.tokens.includes(term)).length);
  }
  const results = corpus.chunks
    .map((chunk) => {
      const frequencies = new Map<string, number>();
      for (const token of chunk.tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
      const score = queryTerms.reduce((sum, term) => {
        const frequency = frequencies.get(term) ?? 0;
        if (!frequency) return sum;
        const idf = Math.log(1 + (corpus.chunks.length - (documentFrequency.get(term) ?? 0) + 0.5) / ((documentFrequency.get(term) ?? 0) + 0.5));
        const denominator = frequency + 1.2 * (1 - 0.75 + 0.75 * (chunk.tokens.length / averageLength));
        return sum + idf * ((frequency * 2.2) / denominator);
      }, 0);
      return { chunk, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.chunk.source.path.localeCompare(right.chunk.source.path))
    .slice(0, Math.min(Math.max(limit, 1), 10));
  return results.map(({ chunk, score }) => ({
    id: chunk.id,
    score: Number(score.toFixed(4)),
    source: chunk.source,
    section: chunk.section,
    excerpt: excerpt(chunk.text, queryTerms),
  }));
}
