import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const extractor = join(process.cwd(), "scripts", "extractManufacturedItemPreview.py");

describe("manufactured-item preview extractor", () => {
  it("converts labelled cm source fields into a review-only mm preview", () => {
    const root = mkdtempSync(join(tmpdir(), "doorstar-item-preview-"));
    try {
      const input = join(root, "evidence.json");
      const output = join(root, "preview.json");
      writeFileSync(input, JSON.stringify({ records: [{
        recordType: "ManufacturedItemCandidate", itemKind: "FURNITURE_FRONT", sheet: "Keszmeret - Butorfront",
        relativePath: "sample.xlsm", contentSha256: "hash", logicalRow: 4, cachedMeasurementUnit: "cm",
        cachedMeasurements: { width: 39, height: 77.5, quantity: 1 },
        cachedFields: { DSMR: "24170", Sorszam: "01", Tipus: "Egyedi Butorfront", Nev: "FP_1", Anyag: "MDF", Vastagsag: 1.8, "Felület tipus": "Folias", Szin: "Magnolia", Minta: "Rajz szerint", Megjegyzes: "R3" },
      }] }));
      execFileSync("python", [extractor, "--input-json", input, "--output-json", output, "--source-sheet", "Keszmeret - Butorfront", "--source-root-label", "2026/07_Julius/24170", "--work-kind", "STANDARD"], { encoding: "utf8" });
      const result = JSON.parse(readFileSync(output, "utf8"));
      expect(result.databaseWrite).toBe(false);
      expect(result.macroExecution).toBe(false);
      expect(result.records[0].target).toMatchObject({ projectReference: "DSMR-24170", widthMm: 390, heightMm: 775, thicknessMm: 18, quantity: 1 });
      expect(result.records[0].target).toMatchObject({ itemName: "FP_1", colour: "Magnolia", pattern: "Rajz szerint" });
      expect(result.records[0].source).toMatchObject({ relativePath: "2026/07_Julius/24170/sample.xlsm", conversion: "cm->mm" });
      expect(result.records[0].errors).toContain("requires_human_review");
      expect(result.records[0].errors).not.toContain("manufactured_item_api_not_implemented");
      expect(result.summary).toMatchObject({ apiReadyRecordCount: 1, blockedRecordCount: 0 });
      expect(result.records[0].apiEndpoint).toMatchObject({ method: "POST", projectKey: "DSMR-24170", revision: null });
      expect(result.records[0].apiPayload).toMatchObject({
        kind: "FURNITURE_FRONT",
        code: "01",
        name: "FP_1",
        quantity: 1,
        widthMm: 390,
        heightMm: 775,
        thicknessMm: 18,
        workKind: "STANDARD",
        state: "REVIEW",
      });
      expect(result.records[0].apiPayload.evidence).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: "WIDTH_MM", rawValue: "39 cm", normalizedValue: 390, row: 4 }),
        expect.objectContaining({ field: "WORK_KIND", rawValue: "configured:STANDARD", normalizedValue: "STANDARD" }),
      ]));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
