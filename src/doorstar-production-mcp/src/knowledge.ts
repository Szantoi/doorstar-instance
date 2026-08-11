import { createHash } from "node:crypto";
import {
  DOORSTAR_TENANT_ID,
  TENANT_WOODWORKING_CURATED_AT,
  TENANT_WOODWORKING_PROVENANCE,
  TENANT_WOODWORKING_STATUS,
  tenantWoodworkingDocuments,
  WOODWORKING_SCOPE,
} from "./tenantWoodworkingKnowledge.js";

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:password|token|secret|api[_-]?key|private[_-]?key)\b\s*[:=]\s*(?!["']?(?:\$\{|\{\{|<|\[redacted\]))["']?[^\s"']{8,}/i,
  /:\/\/[^\s/:@]+:[^\s/@]{8,}@/i,
];

export type KnowledgeSourceKind = "tenant_woodworking";

/**
 * `path` is retained for MCP compatibility, but it is a stable public card
 * reference, never a filesystem path or a source-document location.
 */
export interface KnowledgeSource {
  path: string;
  title: string;
  kind: KnowledgeSourceKind;
  sha256: string;
  tenantId: typeof DOORSTAR_TENANT_ID;
  scope: typeof WOODWORKING_SCOPE;
  provenance: typeof TENANT_WOODWORKING_PROVENANCE;
  status: typeof TENANT_WOODWORKING_STATUS;
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
  tenantId: typeof DOORSTAR_TENANT_ID;
  scope: typeof WOODWORKING_SCOPE;
  provenance: typeof TENANT_WOODWORKING_PROVENANCE;
  status: typeof TENANT_WOODWORKING_STATUS;
}

export interface KnowledgeSearchResult {
  id: string;
  score: number;
  source: KnowledgeSource;
  section: string;
  excerpt: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Normalize Hungarian accents so an ASCII query can still find terms such as
 * "fűrész" and "megmunkálás". */
export function tokenize(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[\p{L}\p{N}]{2,}/gu) ?? [];
}

/** A card reference makes the tenant and scope visible without disclosing a
 * local, repository, or external-source path. */
function cardReference(cardId: string): string {
  return `tenant:${DOORSTAR_TENANT_ID};scope:${WOODWORKING_SCOPE};card:${cardId}`;
}

/** The static-corpus boundary is intentional: no repository directory is
 * scanned and no external file location is opened while serving a request. */
export async function loadKnowledgeCorpus(_ignoredCompatibilityArgument?: string): Promise<KnowledgeCorpus> {
  const sources: KnowledgeSource[] = [];
  const chunks: KnowledgeChunk[] = [];

  for (const document of tenantWoodworkingDocuments) {
    const path = cardReference(document.id);
    const source: KnowledgeSource = {
      path,
      title: document.title,
      kind: "tenant_woodworking",
      sha256: document.sha256,
      tenantId: DOORSTAR_TENANT_ID,
      scope: WOODWORKING_SCOPE,
      provenance: TENANT_WOODWORKING_PROVENANCE,
      status: TENANT_WOODWORKING_STATUS,
    };
    const tokens = tokenize([document.title, document.section, document.text, ...document.keywords].join("\n"));
    sources.push(source);
    chunks.push({
      id: sha256(`${path}\n${document.section}`),
      source,
      section: document.section,
      text: document.text,
      tokens,
    });
  }

  const sourceDigest = sources.map((source) => `${source.path}:${source.sha256}`).join("\n");
  return {
    corpusVersion: `doorstar-woodworking-v1-${sha256(sourceDigest).slice(0, 16)}`,
    indexedAt: TENANT_WOODWORKING_CURATED_AT,
    documentCount: sources.length,
    chunkCount: chunks.length,
    // These are boundary statements rather than counts from a scan: the
    // static corpus deliberately includes neither category of file.
    exclusions: {
      repository_document_scanning_disabled: 0,
      external_source_reading_disabled: 0,
    },
    sources,
    chunks,
    tenantId: DOORSTAR_TENANT_ID,
    scope: WOODWORKING_SCOPE,
    provenance: TENANT_WOODWORKING_PROVENANCE,
    status: TENANT_WOODWORKING_STATUS,
  };
}

/** The corpus errs on the side of exclusion: text that resembles a credential
 * must never be surfaced as agent context. */
export function containsSecretPattern(markdown: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(markdown));
}

function excerpt(text: string, queryTerms: string[]): string {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const firstMatch = queryTerms.map((term) => normalized.indexOf(term)).find((index) => index >= 0) ?? 0;
  const start = Math.max(0, firstMatch - 180);
  const slice = text.slice(start, start + 720).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${slice}${start + slice.length < text.length ? "…" : ""}`;
}

/** BM25-style lexical retrieval is deterministic and local. It searches only
 * the static Doorstar woodworking cards; no code or development corpus exists
 * behind this function. */
export function searchKnowledge(corpus: KnowledgeCorpus, query: string, limit = 5): KnowledgeSearchResult[] {
  const queryTerms = Array.from(new Set(tokenize(query)));
  if (!queryTerms.length || !corpus.chunks.length) return [];

  const averageLength = corpus.chunks.reduce((sum, chunk) => sum + chunk.tokens.length, 0) / corpus.chunks.length;
  const documentFrequency = new Map<string, number>();
  for (const term of queryTerms) {
    documentFrequency.set(term, corpus.chunks.filter((chunk) => chunk.tokens.includes(term)).length);
  }

  const boundedLimit = Math.min(Math.max(Number.isFinite(limit) ? Math.trunc(limit) : 5, 1), 10);
  const results = corpus.chunks
    .map((chunk) => {
      const frequencies = new Map<string, number>();
      for (const token of chunk.tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
      const score = queryTerms.reduce((sum, term) => {
        const frequency = frequencies.get(term) ?? 0;
        if (!frequency) return sum;
        const frequencyInCorpus = documentFrequency.get(term) ?? 0;
        const idf = Math.log(1 + (corpus.chunks.length - frequencyInCorpus + 0.5) / (frequencyInCorpus + 0.5));
        const denominator = frequency + 1.2 * (1 - 0.75 + 0.75 * (chunk.tokens.length / averageLength));
        return sum + idf * ((frequency * 2.2) / denominator);
      }, 0);
      return { chunk, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.chunk.source.path.localeCompare(right.chunk.source.path))
    .slice(0, boundedLimit);

  return results.map(({ chunk, score }) => ({
    id: chunk.id,
    score: Number(score.toFixed(4)),
    source: chunk.source,
    section: chunk.section,
    excerpt: excerpt(chunk.text, queryTerms),
  }));
}
