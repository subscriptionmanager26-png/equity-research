#!/usr/bin/env python3
"""Write a simple multi-page PDF using the preinstalled fpdf2 package.

Usage:
  python3 tools/pdf_report.py artifacts/report.pdf "Title" "Paragraph one." "Paragraph two."

The Cloud Agent environment already has fpdf2. Do not pip install it.
"""

from __future__ import annotations

import sys
from pathlib import Path

from fpdf import FPDF


class ReportPDF(FPDF):
    def header(self) -> None:
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(90, 90, 90)
        self.cell(0, 8, self.title or "Report", align="L")
        self.ln(12)

    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Page {self.page_no()}", align="C")


def write_report(path: Path, title: str, paragraphs: list[str]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    pdf = ReportPDF()
    pdf.set_title(title)
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(20, 20, 20)
    pdf.multi_cell(0, 10, title)
    pdf.ln(6)
    pdf.set_font("Helvetica", size=12)
    for paragraph in paragraphs:
        text = paragraph.strip()
        if not text:
            continue
        pdf.multi_cell(0, 7, text)
        pdf.ln(3)
    pdf.output(str(path))
    return path


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(
            "Usage: python3 tools/pdf_report.py <output.pdf> <title> [paragraph ...]",
            file=sys.stderr,
        )
        return 2
    output = Path(argv[1])
    title = argv[2]
    paragraphs = argv[3:] or ["(empty report)"]
    written = write_report(output, title, paragraphs)
    print(written)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
