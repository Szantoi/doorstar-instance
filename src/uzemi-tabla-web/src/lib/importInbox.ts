import type {
  ImportInboxItem,
  ImportInboxState,
  ImportWorkNumberCandidate,
  ImportWorkNumberDeadlineObservation,
} from "@/services/production/types";

export type ImportInboxStateTone = "danger" | "warning" | "ready" | "technical";

export const IMPORT_INBOX_STATE_META: Record<ImportInboxState, { label: string; hint: string; tone: ImportInboxStateTone }> = {
  PDF_REVISION_SELECTION_REQUIRED: {
    label: "PDF-revízió kiválasztandó",
    hint: "Több forrásrevízió közül embernek kell kiválasztania az érvényeset.",
    tone: "danger",
  },
  SALES_REVIEW: {
    label: "Sales ellenőrzés",
    hint: "A forrásadatok üzleti ellenőrzésre várnak.",
    tone: "warning",
  },
  SURVEY_RECONCILIATION: {
    label: "Felmérési egyeztetés",
    hint: "A forrás és a helyszíni felmérés eltérését egyeztetni kell.",
    tone: "warning",
  },
  DEADLINE_CONFLICT: {
    label: "Határidő-eltérés",
    hint: "A források nem ugyanazt a határidőt állítják.",
    tone: "danger",
  },
  READY_FOR_TEST_DRAFT: {
    label: "Teszt-DRAFT-ra előkészítve",
    hint: "A jelölt technikailag előkészített, de még nem műszakilag jóváhagyott.",
    tone: "ready",
  },
  APPLIED_TO_TEST: {
    label: "Teszt-DRAFT létrejött",
    hint: "Tesztpéldány készült; a nyitott review-k és blokkolók ettől még érvényesek.",
    tone: "technical",
  },
};

export const IMPORT_CANDIDATE_STATUS_LABELS: Record<ImportWorkNumberCandidate["status"], string> = {
  READY: "Review után kijelölhető",
  REVIEW: "Ellenőrzendő",
  BLOCKED: "Blokkolt",
  APPLIED: "Teszt-DRAFT-ban rögzítve",
  SKIPPED: "Kihagyva",
};

export const IMPORT_DEADLINE_KIND_LABELS: Record<ImportWorkNumberDeadlineObservation["kind"], string> = {
  CONTRACTUAL: "Vállalt határidő",
  PLANNED_INSTALL: "Tervezett beépítés",
  PRODUCTION_END: "Gyártás vége",
  NOTE: "Megjegyzés",
};

export const IMPORT_REVIEW_STATE_LABELS: Record<ImportWorkNumberDeadlineObservation["reviewState"], string> = {
  UNVERIFIED: "Ellenőrizetlen",
  REVIEW: "Ellenőrzendő",
  RESOLVED: "Feloldva",
  REJECTED: "Elutasítva",
};

export interface ImportInboxSummary {
  candidateCount: number;
  readyCount: number;
  reviewCount: number;
  blockedCount: number;
}

export type ImportInboxCardTone = "blocked" | "review" | "ready" | "technical";

/** Visual priority is fail-closed: explicit conflict states outrank counts,
 * and a test DRAFT remains technical/neutral even when no review count is
 * open. Only READY_FOR_TEST_DRAFT may use the positive tone. */
export function importInboxCardTone(item: ImportInboxItem): ImportInboxCardTone {
  if (
    item.blockedCount > 0
    || item.states.includes("PDF_REVISION_SELECTION_REQUIRED")
    || item.states.includes("DEADLINE_CONFLICT")
  ) return "blocked";
  if (
    item.reviewCount > 0
    || item.states.includes("SALES_REVIEW")
    || item.states.includes("SURVEY_RECONCILIATION")
  ) return "review";
  if (item.states.includes("READY_FOR_TEST_DRAFT") && item.readyCount > 0) return "ready";
  return "technical";
}

/** Sums only the currently loaded page. The UI labels this scope explicitly
 * so pagination never looks like a whole-dataset statistic. */
export function summarizeImportInbox(items: ImportInboxItem[]): ImportInboxSummary {
  return items.reduce<ImportInboxSummary>(
    (summary, item) => ({
      candidateCount: summary.candidateCount + item.candidateCount,
      readyCount: summary.readyCount + item.readyCount,
      reviewCount: summary.reviewCount + item.reviewCount,
      blockedCount: summary.blockedCount + item.blockedCount,
    }),
    { candidateCount: 0, readyCount: 0, reviewCount: 0, blockedCount: 0 },
  );
}

export function importInboxPageCount(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
}

export function parseImportInboxPage(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

export function displayImportWorkNumber(workNumber: string) {
  return workNumber === "UNASSIGNED" ? "Munkaszám nélkül" : workNumber;
}

export function importEvidenceLocator(
  item: Pick<ImportWorkNumberCandidate, "relativePath" | "sheet" | "page" | "row">,
) {
  return [
    item.relativePath,
    item.sheet ? `Lap: ${item.sheet}` : null,
    item.page != null ? `${item.page}. oldal` : null,
    item.row != null ? `${item.row}. sor` : null,
  ].filter(Boolean).join(" · ");
}

export function formatImportPayloadValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Igen" : "Nem";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
