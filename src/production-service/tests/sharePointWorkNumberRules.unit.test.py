"""Unit checks for SharePoint work-number and package evidence rules."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "previewSharePointDocumentMetadata.py"
sys.path.insert(0, str(SCRIPT.parent))
SPEC = importlib.util.spec_from_file_location("sharepoint_work_number_rules", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SharePointWorkNumberRulesTests(unittest.TestCase):
    def test_row_limit_checks_the_header_selected_query_sheet(self) -> None:
        header = ["Név", "Módosítva", "Módosította", "Elemtípus", "Elérési út"]
        workbook = {
            "sheets": [
                {"name": "cover", "rows": [["title"]]},
                {"name": "query", "rows": [header, ["a"], ["b"]]},
            ],
        }
        with self.assertRaisesRegex(ValueError, "silently truncated"):
            MODULE.enforce_selected_sheet_row_limit(workbook, None, 1)

    def test_quarantines_multiple_distinct_path_numbers(self) -> None:
        resolved = MODULE.resolve_work_number(
            "teritek.pdf",
            "sites/Gyartas/26147 - Customer/Dokumentumok/21126 - archive",
        )
        self.assertEqual(resolved[0], None)
        self.assertEqual(resolved[3], "MULTIPLE")
        self.assertEqual(resolved[5], ["26147", "21126"])

    def test_requires_strong_package_evidence(self) -> None:
        self.assertEqual(
            MODULE.project_package_candidate("ALPI 10632.pdf", "sites/Gyartas/decor", "FILENAME"),
            (None, None),
        )
        self.assertEqual(
            MODULE.project_package_candidate(
                "order.pdf",
                "sites/Gyartas/2026/26107 - Pintér Mónika",
                "PATH",
            ),
            ("26107", "PROJECT_FOLDER"),
        )
        self.assertEqual(
            MODULE.project_package_candidate(
                "DSMR 26107 GYÁRTÁSMEGRENDELÉS.pdf",
                "sites/Gyartas/Sales",
                "FILENAME",
            ),
            ("26107", "FILENAME_DSMR"),
        )


if __name__ == "__main__":
    unittest.main()
