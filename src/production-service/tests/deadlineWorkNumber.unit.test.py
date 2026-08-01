"""Unit checks for the cache-only deadline work-number diagnostic."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "inspectDeadlineWorkNumber.py"
sys.path.insert(0, str(SCRIPT.parent))
SPEC = importlib.util.spec_from_file_location("deadline_work_number", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class DeadlineWorkNumberTests(unittest.TestCase):
    def test_extracts_only_exact_five_digit_identifiers(self) -> None:
        self.assertEqual(MODULE.row_work_numbers(["DSMR 25164", "other 26135"]), {"25164", "26135"})
        self.assertEqual(MODULE.row_work_numbers([25164]), {"25164"})
        self.assertEqual(MODULE.row_work_numbers(["125164", "2516"]), set())

    def test_customer_text_is_a_fallback_not_a_work_number_rewrite(self) -> None:
        self.assertTrue(MODULE.row_matches(["Arador Kft."], "25164", "Arador"))
        self.assertFalse(MODULE.row_matches(["Arador Kft."], "25164", None))
        self.assertEqual(MODULE.row_match_reason(["Arador Kft."], "25164", "Arador"), "TEXT_FALLBACK")
        self.assertEqual(MODULE.row_match_reason([25164], "25164", "Arador"), "WORK_NUMBER_EXACT")

    def test_preserves_numeric_work_number_in_a_work_number_column(self) -> None:
        self.assertEqual(MODULE.field_value("MEGR. SZÁMA", 25164), "25164")


if __name__ == "__main__":
    unittest.main()
