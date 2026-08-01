import { describe, expect, it } from "vitest";
import {
  displayImportWorkNumber,
  formatImportPayloadValue,
  importEvidenceLocator,
  importInboxCardTone,
  importInboxPageCount,
  IMPORT_INBOX_STATE_META,
  parseImportInboxPage,
  summarizeImportInbox,
} from "./importInbox";
import type { ImportInboxItem } from "@/services/production/types";

const inboxItem = (patch: Partial<ImportInboxItem> = {}): ImportInboxItem => ({
  importRunId: "run-1",
  workNumber: "26148",
  profileVersion: "doorstar-import-preview/v1",
  sourceFingerprint: "a".repeat(64),
  targetSchema: "doorstar_test",
  states: ["APPLIED_TO_TEST"],
  candidateCount: 8,
  readyCount: 0,
  reviewCount: 7,
  blockedCount: 1,
  sourcePaths: ["DSMR 26148/order.pdf"],
  ...patch,
});

describe("import inbox view model", () => {
  it("keeps page-scoped candidate and review counts separate from work-package total", () => {
    expect(summarizeImportInbox([
      inboxItem(),
      inboxItem({ workNumber: "24181", candidateCount: 2, readyCount: 1, reviewCount: 0, blockedCount: 0 }),
    ])).toEqual({ candidateCount: 10, readyCount: 1, reviewCount: 7, blockedCount: 1 });
  });

  it("does not label APPLIED_TO_TEST as complete or approved", () => {
    expect(IMPORT_INBOX_STATE_META.APPLIED_TO_TEST).toMatchObject({
      label: "Teszt-DRAFT létrejött",
      tone: "technical",
    });
    expect(importInboxCardTone(inboxItem({ readyCount: 1, reviewCount: 0, blockedCount: 0 }))).toBe("technical");
    expect(importInboxCardTone(inboxItem({
      states: ["READY_FOR_TEST_DRAFT"],
      readyCount: 1,
      reviewCount: 0,
      blockedCount: 0,
    }))).toBe("ready");
  });

  it("supports the backend UNASSIGNED sentinel and safe pagination", () => {
    expect(displayImportWorkNumber("UNASSIGNED")).toBe("Munkaszám nélkül");
    expect(importInboxPageCount(0, 25)).toBe(1);
    expect(importInboxPageCount(51, 25)).toBe(3);
    expect(parseImportInboxPage("3")).toBe(3);
    expect(parseImportInboxPage("-1")).toBe(1);
    expect(parseImportInboxPage("not-a-page")).toBe(1);
  });

  it("keeps exact source coordinates, including zero-valued rows", () => {
    expect(importEvidenceLocator({ relativePath: "order.xlsx", sheet: "Adatok", page: null, row: 0 }))
      .toBe("order.xlsx · Lap: Adatok · 0. sor");
  });

  it("formats review payload values without deriving new business data", () => {
    expect(formatImportPayloadValue(null)).toBe("—");
    expect(formatImportPayloadValue(false)).toBe("Nem");
    expect(formatImportPayloadValue({ widthMm: 900 })).toBe('{"widthMm":900}');
  });
});
