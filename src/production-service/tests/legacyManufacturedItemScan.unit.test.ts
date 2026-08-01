import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const scanner = join(process.cwd(), "scripts", "scanLegacyManufacturedItems.py");
const fixture = String.raw`
import os, sys, zipfile
root=sys.argv[1]; os.makedirs(root, exist_ok=True)
workbook='''<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Tételek" sheetId="1" r:id="rId1"/></sheets></workbook>'''
rels='''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'''
sheet='''<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Falpanel</t></is></c><c r="B1"><v>2</v></c><c r="C1"><v>641</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Bútorfront</t></is></c><c r="B2"><v>1</v></c></row></sheetData></worksheet>'''
with zipfile.ZipFile(os.path.join(root,'sample.xlsm'),'w') as z:
 z.writestr('xl/workbook.xml',workbook); z.writestr('xl/_rels/workbook.xml.rels',rels); z.writestr('xl/worksheets/sheet1.xml',sheet); z.writestr('xl/vbaProject.bin',b'ignored')
`;

describe("legacy manufactured-item scanner", () => {
  it("reads cached XLSM data without macro execution and keeps unstructured template rows as evidence", () => {
    const root = mkdtempSync(join(tmpdir(), "doorstar-item-scan-"));
    try {
      execFileSync("python", ["-c", fixture, root], { encoding: "utf8" });
      const output = join(root, "result.json");
      execFileSync("python", [scanner, "--archive-root", root, "--output-json", output], { encoding: "utf8" });
      const result = JSON.parse(readFileSync(output, "utf8"));
      expect(result.databaseWrite).toBe(false);
      expect(result.macroExecution).toBe(false);
      expect(result.summary.reviewCandidateCount).toBe(0);
      expect(result.macroContainersIgnored).toEqual(["sample.xlsm"]);
      expect(result.records.some((record: { itemKind: string }) => record.itemKind === "WALL_PANEL")).toBe(true);
      expect(result.records.some((record: { itemKind: string }) => record.itemKind === "FURNITURE_FRONT")).toBe(true);
      expect(result.records.some((record: { recordType: string }) => record.recordType === "ManufacturedItemCandidate")).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("retains header-labelled cached source fields for a structured manufactured-item row", () => {
    const root = mkdtempSync(join(tmpdir(), "doorstar-item-fields-"));
    const structuredFixture = String.raw`
import os, sys, zipfile
root=sys.argv[1]; os.makedirs(root, exist_ok=True)
workbook='''<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Keszmeret - Butorfront" sheetId="1" r:id="rId1"/></sheets></workbook>'''
rels='''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'''
sheet='''<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Tipus</t></is></c><c r="B1" t="inlineStr"><is><t>Szelesseg</t></is></c><c r="C1" t="inlineStr"><is><t>Hosszusag</t></is></c><c r="D1" t="inlineStr"><is><t>Darab</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Butorfront</t></is></c><c r="B2"><v>39</v></c><c r="C2"><v>77.5</v></c><c r="D2"><v>1</v></c></row></sheetData></worksheet>'''
with zipfile.ZipFile(os.path.join(root,'structured.xlsx'),'w') as z:
 z.writestr('xl/workbook.xml',workbook); z.writestr('xl/_rels/workbook.xml.rels',rels); z.writestr('xl/worksheets/sheet1.xml',sheet)
`;
    try {
      execFileSync("python", ["-c", structuredFixture, root], { encoding: "utf8" });
      const output = join(root, "result.json");
      execFileSync("python", [scanner, "--archive-root", root, "--output-json", output], { encoding: "utf8" });
      const result = JSON.parse(readFileSync(output, "utf8"));
      const candidate = result.records.find((record: { recordType: string }) => record.recordType === "ManufacturedItemCandidate");
      expect(candidate.cachedMeasurements).toEqual({ width: 39, height: 77.5, quantity: 1 });
      expect(candidate.cachedFields).toMatchObject({ Tipus: "Butorfront", Szelesseg: 39, Hosszusag: 77.5, Darab: 1 });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
