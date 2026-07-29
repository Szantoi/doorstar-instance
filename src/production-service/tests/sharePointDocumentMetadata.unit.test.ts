import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const previewer = join(process.cwd(), "scripts", "previewSharePointDocumentMetadata.py");
const fixture = String.raw`
import os, sys, zipfile
root=sys.argv[1]; os.makedirs(root, exist_ok=True)
workbook='''<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="query" sheetId="1" r:id="rId1"/></sheets></workbook>'''
rels='''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'''
sheet='''<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Nev</t></is></c><c r="B1" t="inlineStr"><is><t>Modositva</t></is></c><c r="C1" t="inlineStr"><is><t>Modositotta</t></is></c><c r="D1" t="inlineStr"><is><t>Elemtipus</t></is></c><c r="E1" t="inlineStr"><is><t>Eleresi ut</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>DSMR-24170.pdf</t></is></c><c r="B2"><v>46232.5</v></c><c r="C2" t="inlineStr"><is><t>User</t></is></c><c r="D2" t="inlineStr"><is><t>Elem</t></is></c><c r="E2" t="inlineStr"><is><t>sites/Docs/2026/11111</t></is></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>DSMR-24170.dwl</t></is></c><c r="B3"><v>46232.5</v></c><c r="C3" t="inlineStr"><is><t>User</t></is></c><c r="D3" t="inlineStr"><is><t>Elem</t></is></c><c r="E3" t="inlineStr"><is><t>sites/Docs/2026/11111</t></is></c></row><row r="4"><c r="A4" t="inlineStr"><is><t>24170</t></is></c><c r="B4"><v>46232.5</v></c><c r="C4" t="inlineStr"><is><t>User</t></is></c><c r="D4" t="inlineStr"><is><t>Mappa</t></is></c><c r="E4" t="inlineStr"><is><t>sites/Docs/2026</t></is></c></row></sheetData></worksheet>'''
with zipfile.ZipFile(os.path.join(root,'metadata.xlsx'),'w') as z:
 z.writestr('xl/workbook.xml',workbook); z.writestr('xl/_rels/workbook.xml.rels',rels); z.writestr('xl/worksheets/sheet1.xml',sheet)
`;

describe("SharePoint document metadata preview", () => {
  it("keeps server-side modification metadata and excludes CAD lock files", () => {
    const root = mkdtempSync(join(tmpdir(), "doorstar-sharepoint-preview-"));
    try {
      execFileSync("python", ["-c", fixture, root], { encoding: "utf8" });
      const output = join(root, "result.json");
      execFileSync("python", [previewer, "--input-xlsx", join(root, "metadata.xlsx"), "--output-json", output], { encoding: "utf8" });
      const result = JSON.parse(readFileSync(output, "utf8"));
      expect(result.databaseWrite).toBe(false);
      expect(result.summary.metadataRecordCount).toBe(1);
      expect(result.summary.folderMetadataExcludedCount).toBe(1);
      expect(result.summary.excludedByExtension).toEqual({ ".dwl": 1 });
      expect(result.records[0]).toMatchObject({ workNumberCandidate: "24170", sourceLastModifiedAt: "2026-07-29T12:00:00", relevance: "POTENTIAL_IMPORT_DOCUMENT" });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
