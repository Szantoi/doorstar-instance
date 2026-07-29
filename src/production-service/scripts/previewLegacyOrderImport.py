#!/usr/bin/env python3
"""Read-only, macro-free preview for Doorstar legacy order sources.

The tool deliberately uses only Python's standard library.  It reads the XML
parts of XLSX/XLSM containers directly; it never opens Excel, evaluates
formulas, or loads ``vbaProject.bin``.  It produces a deterministic list of
candidate Project, OrderRevision, OrderDocument, and deadline records for
human review.  It has no database client and no import/write mode.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
import unicodedata
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Iterable
from xml.etree import ElementTree as ET


OOXML_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
DOC_EXTENSIONS = {".pdf", ".dwg", ".dxf", ".xlsx", ".xlsm", ".docx"}
EXCLUDED_EXTENSIONS = {".bak", ".dwl", ".dwl2", ".tmp", ".temp", ".lock", ".lck", ".cache"}
DSMR_PROJECT_NUMBER = re.compile(r"(?i)\bDSMR[ _-]*(\d{3,6})\b")
PLAIN_PROJECT_NUMBER = re.compile(r"(?<!\d)([12]\d{4}|[3-9]\d{2})(?!\d)")
DATE_HEADERS = ("határidő", "hatarido", "szállítás", "szallitas", "beépítés", "beepites", "kezdés", "kezdes")
CUSTOMER_HEADERS = ("megrendelő", "megrendelo", "ügyfél", "ugyfel", "vevő", "vevo", "partner")
POSITION_HEADERS = ("pozíció", "pozicio", "tétel", "tetel", "ajtó", "ajto")


def normalized(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(character for character in text if not unicodedata.combining(character))
    return " ".join(text.strip().lower().split())


def safe_relative(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def is_excluded(path: Path) -> bool:
    return path.name.startswith("~$") or path.suffix.lower() in EXCLUDED_EXTENSIONS


def source_file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def column_index(cell_reference: str) -> int:
    letters = "".join(character for character in cell_reference if character.isalpha()).upper()
    result = 0
    for character in letters:
        result = result * 26 + ord(character) - ord("A") + 1
    return result - 1


def excel_serial_to_iso(value: int | float) -> str:
    # Excel's 1900 system intentionally retains its historical leap-year bug.
    return (datetime(1899, 12, 30, tzinfo=timezone.utc) + timedelta(days=value)).date().isoformat()


def text_from_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    values: list[str] = []
    for node in root.findall(f"{OOXML_NS}si"):
        values.append("".join(text.text or "" for text in node.iter(f"{OOXML_NS}t")))
    return values


def workbook_sheets(archive: zipfile.ZipFile) -> list[tuple[str, str]]:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in relationships
        if rel.attrib.get("Type", "").endswith("/worksheet")
    }
    sheets: list[tuple[str, str]] = []
    for sheet in workbook.findall(f"{OOXML_NS}sheets/{OOXML_NS}sheet"):
        relationship_id = sheet.attrib.get(f"{REL_NS}id")
        target = targets.get(relationship_id or "")
        if target:
            sheets.append((sheet.attrib.get("name", "Unnamed"), str(PurePosixPath("xl") / target)))
    return sheets


def cell_value(cell: ET.Element, shared_strings: list[str]) -> object:
    data_type = cell.attrib.get("t")
    if data_type == "inlineStr":
        return "".join(text.text or "" for text in cell.iter(f"{OOXML_NS}t"))
    value = cell.findtext(f"{OOXML_NS}v")
    if value is None:
        return ""
    if data_type == "s":
        return shared_strings[int(value)] if int(value) < len(shared_strings) else ""
    if data_type == "b":
        return value == "1"
    if data_type == "str":
        return value
    try:
        numeric = float(value)
        return int(numeric) if numeric.is_integer() else numeric
    except ValueError:
        return value


def parse_workbook(path: Path, row_limit: int | None = 80) -> dict[str, Any]:
    """Extract displayed cached values only; formulas and VBA are ignored."""
    with zipfile.ZipFile(path) as archive:
        shared_strings = text_from_shared_strings(archive)
        result_sheets: list[dict[str, Any]] = []
        for name, target in workbook_sheets(archive):
            if target not in archive.namelist():
                continue
            rows: list[list[object]] = []
            max_column = 0
            # Most legacy workbooks only need their first candidate header.
            # Streaming avoids materialising their large calculation sheets.
            with archive.open(target) as sheet_stream:
                for _, row in ET.iterparse(sheet_stream, events=("end",)):
                    if row.tag != f"{OOXML_NS}row":
                        continue
                    cells: dict[int, object] = {}
                    for cell in row.findall(f"{OOXML_NS}c"):
                        index = column_index(cell.attrib.get("r", "A1"))
                        cells[index] = cell_value(cell, shared_strings)
                        max_column = max(max_column, index + 1)
                    if cells:
                        rows.append([cells.get(index, "") for index in range(max_column)])
                    row.clear()
                    if row_limit is not None and len(rows) >= row_limit:
                        break
            result_sheets.append({"name": name, "rows": rows})
        return {"sheets": result_sheets, "containsVba": "xl/vbaProject.bin" in archive.namelist()}


def header_row(rows: list[list[object]]) -> tuple[int | None, list[str]]:
    for index, row in enumerate(rows[:40]):
        labels = [normalized(value) for value in row if normalized(value)]
        if len(labels) < 2:
            continue
        has_domain_header = any(any(token in label for token in DATE_HEADERS + CUSTOMER_HEADERS + POSITION_HEADERS + ("munkaszám", "munkaszam", "projekt")) for label in labels)
        if has_domain_header:
            return index, [str(value).strip() for value in row]
    return None, []


def find_column(headers: list[str], candidates: Iterable[str]) -> int | None:
    for index, header in enumerate(headers):
        label = normalized(header)
        if any(normalized(candidate) in label for candidate in candidates):
            return index
    return None


def display_value(value: object) -> str:
    # OOXML readers normalise an integral numeric cell to ``int``.  Excel
    # dates are therefore commonly integers, not floats.
    if isinstance(value, (int, float)) and not isinstance(value, bool) and 20000 <= value <= 60000:
        return excel_serial_to_iso(value)
    return str(value).strip()


def first_project_number(*values: object) -> str | None:
    text_values = [str(value or "") for value in values]
    for text in text_values:
        match = DSMR_PROJECT_NUMBER.search(text)
        if match:
            return match.group(1)
    for text in text_values:
        match = PLAIN_PROJECT_NUMBER.search(text)
        if match:
            return match.group(1)
    return None


def project_name_from_path(relative_path: str, project_number: str | None) -> str | None:
    parts = PurePosixPath(relative_path).parts
    for part in parts:
        if project_number and project_number in part and len(part) > len(project_number) + 3:
            return re.sub(r"(?i)^DSMR[ _-]*\d{3,6}[ _-]*", "", part).strip(" -_.") or None
    return None


@dataclass
class Preview:
    source_roots: dict[str, Path]
    excluded: Counter[str] = field(default_factory=Counter)
    documents: list[dict[str, Any]] = field(default_factory=list)
    workbook_profiles: list[dict[str, Any]] = field(default_factory=list)
    project_numbers: set[str] = field(default_factory=set)
    deadline_rows: list[dict[str, Any]] = field(default_factory=list)
    position_rows: list[dict[str, Any]] = field(default_factory=list)
    issues: list[dict[str, str]] = field(default_factory=list)

    def add_issue(self, code: str, source: str, message: str) -> None:
        self.issues.append({"code": code, "source": source, "message": message})


def classify_document(relative_path: str) -> str:
    path = normalized(relative_path)
    if "felmér" in path or "felmer" in path:
        return "SURVEY"
    if any(token in path for token in ("rajz", "jellegrajz", ".dwg", ".dxf")):
        return "DRAWING"
    if any(token in path for token in ("megrendel", "gyártásmegrendel", "gyartasmegrendel")):
        return "SALES_ORDER"
    return "OTHER"


def discover_documents(preview: Preview, label: str, root: Path, sales_reference: bool) -> None:
    for path in sorted((candidate for candidate in root.rglob("*") if candidate.is_file()), key=lambda candidate: candidate.as_posix().lower()):
        if is_excluded(path):
            preview.excluded[path.suffix.lower() or "temporary"] += 1
            continue
        if path.suffix.lower() not in DOC_EXTENSIONS:
            continue
        relative_path = safe_relative(path, root)
        project_number = first_project_number(relative_path)
        if project_number:
            preview.project_numbers.add(project_number)
        record = {
            "recordType": "OrderDocument",
            "action": "CREATE_REFERENCE" if sales_reference else "REVIEW_REFERENCE",
            "sourceRoot": label,
            "relativePath": relative_path,
            "displayName": path.name,
            "documentKind": classify_document(relative_path),
            "projectNumber": project_number,
            "sourceFile": f"{label}/{relative_path}",
            "contentSha256": source_file_hash(path),
            "reviewRequired": True,
            "errors": [],
        }
        if not project_number:
            record["errors"].append("project_number_not_identified_from_path")
        preview.documents.append(record)


def discover_workbooks(preview: Preview, label: str, root: Path, deadline_primary: bool = False) -> None:
    for path in sorted((candidate for candidate in root.rglob("*") if candidate.is_file() and candidate.suffix.lower() in {".xlsx", ".xlsm"}), key=lambda candidate: candidate.as_posix().lower()):
        if is_excluded(path):
            continue
        relative_path = safe_relative(path, root)
        try:
            workbook = parse_workbook(path, row_limit=None if deadline_primary and path.name == "Ütemterv.xlsx" else 80)
        except (OSError, zipfile.BadZipFile, ET.ParseError, KeyError) as error:
            preview.add_issue("workbook_unreadable", f"{label}/{relative_path}", str(error))
            continue
        sheets: list[dict[str, Any]] = []
        for sheet in workbook["sheets"]:
            index, headers = header_row(sheet["rows"])
            sheets.append({"name": sheet["name"], "headerRow": None if index is None else index + 1, "headers": headers})
        profile = {
            "recordType": "WorkbookProfile",
            "sourceRoot": label,
            "relativePath": relative_path,
            "sourceFile": f"{label}/{relative_path}",
            "fileType": path.suffix.lower(),
            "containsVba": workbook["containsVba"],
            "macroPolicy": "NOT_EXECUTED",
            "sheets": sheets,
        }
        preview.workbook_profiles.append(profile)
        extract_position_rows(preview, label, relative_path, workbook)
        if workbook["containsVba"]:
            preview.add_issue("macro_container_read_as_data_only", profile["sourceFile"], "vbaProject.bin was detected and ignored")
        if deadline_primary and path.name == "Ütemterv.xlsx":
            extract_deadline_rows(preview, label, relative_path, workbook)


def extract_position_rows(preview: Preview, label: str, relative_path: str, workbook: dict[str, Any]) -> None:
    """Emit source-row candidates from the known Kalkulátor ``AlapAdat`` profile.

    The neighbouring sheets contain fixed/moving surface, glazing, blende and
    wall-panel fragments.  Joining those fragments requires a version-aware
    workbook profile, so this first preview keeps their values out of the
    editable target record and explicitly asks for review instead.
    """
    for sheet in workbook["sheets"]:
        header_index, headers = header_row(sheet["rows"])
        if header_index is None or normalized(sheet["name"]) not in {"alapadat", "alap adatok"}:
            continue
        code_column = find_column(headers, ("sorszám", "sorszam", "pozíció", "pozicio"))
        quantity_column = find_column(headers, ("ajtó mennyisége", "ajto mennyisege", "ajtó menyisége", "ajto menyisege", "mennyiség", "mennyiseg", "menyiség", "menyiseg"))
        project_column = find_column(headers, ("dsmr", "projekt szám", "projekt szam"))
        name_column = find_column(headers, ("ajtó megnevezése", "ajto megnevezese", "megnevezés", "megnevezes"))
        type_column = find_column(headers, ("ajtó tipus", "ajto tipus", "ajtó típus", "ajto tipus"))
        direction_column = find_column(headers, ("ajtó nyitás", "ajto nyitas", "nyitás", "nyitas"))
        opening_width_column = find_column(headers, ("ajtó falnyilás szélessége", "ajto falnyilas szelessege"))
        door_width_column = find_column(headers, ("ajtó szélesség", "ajto szelesseg"))
        opening_height_column = find_column(headers, ("ajtó falnyilás magassága", "ajto falnyilas magassaga"))
        door_height_column = find_column(headers, ("ajtó hosszúság", "ajto hosszusag", "ajtó magasság", "ajto magassag"))
        opening_depth_column = find_column(headers, ("ajtó falnyilás vastagság", "ajto falnyilas vastagsag"))
        thickness_column = find_column(headers, ("ajtó vastagság", "ajto vastagsag"))
        if code_column is None or quantity_column is None:
            continue
        for source_row, row in enumerate(sheet["rows"][header_index + 1:], start=header_index + 2):
            value_at = lambda index: row[index] if index is not None and index < len(row) else ""
            code = display_value(value_at(code_column))
            quantity = value_at(quantity_column)
            if not code or quantity in (None, "", 0, 0.0):
                continue
            project_number = first_project_number(value_at(project_column), relative_path)
            errors: list[str] = []
            if not project_number:
                errors.append("project_number_not_identified")
            if not display_value(value_at(name_column)):
                errors.append("position_name_missing")
            if not display_value(value_at(thickness_column)):
                errors.append("door_thickness_missing")
            errors.extend(("surface_requires_sheet_join_and_survey_review", "wall_treatment_requires_sheet_join_and_survey_review", "glazing_requires_sheet_join_and_survey_review"))
            preview.position_rows.append({
                "recordType": "OrderPosition",
                "action": "CREATE_DRAFT_POSITION",
                "sourceFile": f"{label}/{relative_path}",
                "sheet": sheet["name"],
                "sourceRow": source_row,
                "projectNumber": project_number,
                "code": code,
                "name": display_value(value_at(name_column)) or None,
                "quantity": quantity,
                "productType": display_value(value_at(type_column)) or None,
                "openingDirection": display_value(value_at(direction_column)) or None,
                "openingWidthMm": value_at(opening_width_column) or None,
                "openingHeightMm": value_at(opening_height_column) or None,
                "openingDepthMm": value_at(opening_depth_column) or None,
                "doorWidthMm": value_at(door_width_column) or None,
                "doorHeightMm": value_at(door_height_column) or None,
                "doorThicknessMm": value_at(thickness_column) or None,
                "reviewRequired": True,
                "errors": errors,
            })


def extract_deadline_rows(preview: Preview, label: str, relative_path: str, workbook: dict[str, Any]) -> None:
    found_header = False
    for sheet in workbook["sheets"]:
        row_index, headers = header_row(sheet["rows"])
        if row_index is None:
            continue
        date_column = find_column(headers, DATE_HEADERS)
        if date_column is None:
            continue
        found_header = True
        project_column = find_column(headers, ("munkaszám", "munkaszam", "projekt", "ds", "azonosító", "azonosito"))
        customer_column = find_column(headers, CUSTOMER_HEADERS)
        install_column = find_column(headers, ("beépítés", "beepites"))
        for source_row, row in enumerate(sheet["rows"][row_index + 1:], start=row_index + 2):
            value_at = lambda index: display_value(row[index]) if index is not None and index < len(row) else ""
            deadline = value_at(date_column)
            if not deadline:
                continue
            project_number = first_project_number(value_at(project_column), *row)
            customer = value_at(customer_column)
            installation = value_at(install_column)
            record = {
                "recordType": "Deadline",
                "action": "CREATE_OR_REVIEW",
                "sourceFile": f"{label}/{relative_path}",
                "sheet": sheet["name"],
                "sourceRow": source_row,
                "projectNumber": project_number,
                "customerName": customer or None,
                "expectedDelivery": deadline,
                "installation": installation or None,
                "reviewRequired": True,
                "errors": [],
            }
            if not project_number:
                record["errors"].append("project_number_not_identified")
            preview.deadline_rows.append(record)
    if not found_header:
        preview.add_issue("deadline_headers_not_detected", f"{label}/{relative_path}", "manual mapping of Ütemterv headers is required")


def project_records(preview: Preview) -> list[dict[str, Any]]:
    document_names: defaultdict[str, list[str]] = defaultdict(list)
    for document in preview.documents:
        if document["projectNumber"]:
            document_names[document["projectNumber"]].append(document["sourceFile"])
    deadline_by_project = {record["projectNumber"]: record for record in preview.deadline_rows if record["projectNumber"]}
    records: list[dict[str, Any]] = []
    for number in sorted(preview.project_numbers, key=lambda value: (len(value), value)):
        example_path = sorted(document_names[number], key=lambda value: (not value.startswith("sales/"), value))[0] if document_names[number] else ""
        name = project_name_from_path(example_path, number)
        deadline = deadline_by_project.get(number, {})
        errors: list[str] = []
        if not name:
            errors.append("project_name_not_identified")
        if not deadline:
            errors.append("deadline_not_matched")
        records.append({
            "recordType": "Project",
            "action": "CREATE_NEW_PROJECT",
            "projectKey": f"DSMR-{number}",
            "projectNumber": number,
            "projectName": name,
            "customerName": deadline.get("customerName"),
            "expectedDelivery": deadline.get("expectedDelivery"),
            "sourceFile": example_path or None,
            "reviewRequired": True,
            "errors": errors,
        })
    return records


def order_records(preview: Preview, projects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    positions_by_project = Counter(record["projectNumber"] for record in preview.position_rows if record.get("projectNumber"))
    records: list[dict[str, Any]] = []
    for project in projects:
        project_number = project["projectNumber"]
        errors: list[str] = []
        if not project.get("customerName"):
            errors.append("customer_name_missing")
        if not positions_by_project[project_number]:
            errors.append("no_position_candidate_found")
        records.append({
            "recordType": "ProductionOrder",
            "action": "CREATE_WITH_PROJECT",
            "projectKey": project["projectKey"],
            "projectNumber": project_number,
            "sourceFile": project.get("sourceFile"),
            "reviewRequired": True,
            "errors": errors,
        })
        records.append({
            "recordType": "OrderRevision",
            "action": "CREATE_DRAFT_REVISION_1",
            "projectKey": project["projectKey"],
            "projectNumber": project_number,
            "customerName": project.get("customerName"),
            "expectedDelivery": project.get("expectedDelivery"),
            "positionCandidateCount": positions_by_project[project_number],
            "sourceFile": project.get("sourceFile"),
            "reviewRequired": True,
            "errors": errors,
        })
    return records


def build_output(preview: Preview) -> dict[str, Any]:
    projects = project_records(preview)
    records = projects + order_records(preview, projects) + preview.position_rows + preview.documents + preview.deadline_rows
    records.sort(key=lambda record: (record["recordType"], str(record.get("projectNumber") or ""), str(record.get("sourceFile") or ""), int(record.get("sourceRow") or 0)))
    return {
        "mode": "preview",
        "databaseWrite": False,
        "mappingVersion": "doorstar-legacy-order-preview-v1",
        "generatedAt": "deterministic:no-clock",
        "summary": {
            "projectCandidates": len(project_records(preview)),
            "distinctProjectNumbers": len(preview.project_numbers),
            "documentCandidates": len(preview.documents),
            "positionCandidates": len(preview.position_rows),
            "workbookSources": len(preview.workbook_profiles),
            "deadlineRows": len(preview.deadline_rows),
            "issues": len(preview.issues),
            "excludedByExtension": dict(sorted(preview.excluded.items())),
        },
        "workbookProfiles": preview.workbook_profiles,
        "records": records,
        "issues": sorted(preview.issues, key=lambda issue: (issue["code"], issue["source"], issue["message"])),
    }


def write_csv(records: list[dict[str, Any]], path: Path) -> None:
    fields = ["recordType", "action", "projectKey", "projectNumber", "projectName", "customerName", "expectedDelivery", "relativePath", "sourceFile", "sheet", "sourceRow", "documentKind", "reviewRequired", "errors"]
    with path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for record in records:
            writer.writerow({field: json.dumps(record[field], ensure_ascii=False) if isinstance(record.get(field), (list, dict)) else record.get(field, "") for field in fields})


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Doorstar legacy-source import preview (read-only; no database writes).")
    parser.add_argument("--sales-root", required=True, type=Path, help="Read-only 01 - Megrendelés source root")
    parser.add_argument("--deadlines-root", required=True, type=Path, help="Read-only 03 - Határidők source root")
    parser.add_argument("--archive-root", type=Path, help="Optional read-only year/archive source root")
    parser.add_argument("--output-json", required=True, type=Path, help="Preview JSON output path")
    parser.add_argument("--output-csv", type=Path, help="Optional record-level CSV output path")
    return parser.parse_args()


def main() -> int:
    args = parse_arguments()
    roots = {"sales": args.sales_root, "deadlines": args.deadlines_root}
    if args.archive_root:
        roots["archive"] = args.archive_root
    missing = [label for label, root in roots.items() if not root.is_dir()]
    if missing:
        print(json.dumps({"error": "source_root_missing", "roots": missing}), file=sys.stderr)
        return 2
    preview = Preview(source_roots=roots)
    discover_documents(preview, "sales", args.sales_root, sales_reference=True)
    discover_workbooks(preview, "sales", args.sales_root)
    discover_documents(preview, "deadlines", args.deadlines_root, sales_reference=False)
    discover_workbooks(preview, "deadlines", args.deadlines_root, deadline_primary=True)
    if args.archive_root:
        discover_documents(preview, "archive", args.archive_root, sales_reference=False)
        discover_workbooks(preview, "archive", args.archive_root)
    output = build_output(preview)
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.output_csv:
        args.output_csv.parent.mkdir(parents=True, exist_ok=True)
        write_csv(output["records"], args.output_csv)
    print(json.dumps(output["summary"], ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
