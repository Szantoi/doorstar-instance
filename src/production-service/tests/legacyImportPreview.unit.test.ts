import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const previewScript = join(process.cwd(), "scripts", "previewLegacyOrderImport.py");

/** Builds a minimal XLSX package using only inline strings. This exercises the
 * production preview's OOXML reader without Excel, formula evaluation or VBA. */
const fixtureBuilder = String.raw`
import os, sys, zipfile
root = sys.argv[1]
sales, deadlines = os.path.join(root, 'sales'), os.path.join(root, 'deadlines')
os.makedirs(os.path.join(sales, 'DSMR 26199 Minta Kft'), exist_ok=True)
os.makedirs(deadlines, exist_ok=True)
workbook = '''<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Ütemterv" sheetId="1" r:id="rId1"/></sheets></workbook>'''
relationships = '''<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'''
cells = [('A1','MEGR. SZÁMA'),('B1','MEGRENDELŐ NEVE'),('C1','Vállalt szállítási határidő'),('A2','26199'),('B2','Minta Kft')]
row1 = ''.join('<c r="%s" t="inlineStr"><is><t>%s</t></is></c>' % item for item in cells[:3])
row2 = ''.join('<c r="%s" t="inlineStr"><is><t>%s</t></is></c>' % item for item in cells[3:]) + '<c r="C2"><v>46249</v></c>'
sheet = '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">%s</row><row r="2">%s</row></sheetData></worksheet>' % (row1, row2)
with zipfile.ZipFile(os.path.join(deadlines, 'Ütemterv.xlsx'), 'w') as z:
    z.writestr('xl/workbook.xml', workbook)
    z.writestr('xl/_rels/workbook.xml.rels', relationships)
    z.writestr('xl/worksheets/sheet1.xml', sheet)
open(os.path.join(sales, 'DSMR 26199 Minta Kft', 'megrendeles.pdf'), 'wb').write(b'%PDF-test')
`;

describe("legacy order import preview", () => {
  it("is macro-free, emits relative references, and produces deterministic record types", () => {
    const root = mkdtempSync(join(tmpdir(), "doorstar-preview-"));
    try {
      execFileSync("python", ["-c", fixtureBuilder, root], { encoding: "utf8" });
      const run = () => execFileSync("python", [previewScript,
        "--sales-root", join(root, "sales"),
        "--deadlines-root", join(root, "deadlines"),
        "--output-json", join(root, "preview.json"),
      ], { encoding: "utf8" });
      const first = run();
      const firstOutput = readFileSync(join(root, "preview.json"), "utf8");
      const second = run();
      const secondOutput = readFileSync(join(root, "preview.json"), "utf8");
      const preview = JSON.parse(secondOutput);

      expect(first).toBe(second);
      expect(firstOutput).toBe(secondOutput);
      expect(preview.mode).toBe("preview");
      expect(preview.databaseWrite).toBe(false);
      expect(preview.records.some((record: { recordType: string }) => record.recordType === "Project")).toBe(true);
      expect(preview.records.some((record: { recordType: string }) => record.recordType === "OrderDocument")).toBe(true);
      expect(preview.records.some((record: { recordType: string }) => record.recordType === "Deadline")).toBe(true);
      expect(preview.records.find((record: { recordType: string }) => record.recordType === "Deadline")?.expectedDelivery).toBe("2026-08-15");
      expect(JSON.stringify(preview)).not.toContain(root.replace(/\\/g, "\\\\"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
