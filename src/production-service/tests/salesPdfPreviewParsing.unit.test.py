"""Unit checks for read-only Sales-PDF parser safeguards.

Run with the bundled workspace Python.  This opens no business document and
does not access a macro, API or database.
"""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "extractSalesOrderPdfPreview.py"
SPEC = importlib.util.spec_from_file_location("sales_pdf_preview", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SalesPdfPreviewParsingTests(unittest.TestCase):
    def test_rejoins_pdf_glyph_split_integer_before_cm_conversion(self) -> None:
        self.assertEqual(MODULE.mm_from_cm("7 1"), 710)

    def test_does_not_merge_a_normal_decimal_cell(self) -> None:
        self.assertEqual(MODULE.mm_from_cm("12,5"), 125)


if __name__ == "__main__":
    unittest.main()
