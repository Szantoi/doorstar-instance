"""Unit checks for review-only Sales-PDF readiness safeguards."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "rankSalesPdfImportReadiness.py"
SPEC = importlib.util.spec_from_file_location("sales_pdf_readiness", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SalesPdfReadinessTests(unittest.TestCase):
    def test_rejects_implausible_door_opening_width_for_review_readiness(self) -> None:
        self.assertFalse(MODULE.plausible_opening({
            "openingWidthMm": 70,
            "openingHeightMm": 2100,
            "openingDepthMm": 125,
        }))

    def test_accepts_visually_verified_opening_for_review_readiness(self) -> None:
        self.assertTrue(MODULE.plausible_opening({
            "openingWidthMm": 710,
            "openingHeightMm": 2100,
            "openingDepthMm": 125,
        }))


if __name__ == "__main__":
    unittest.main()
