"""
Research-PDF Builder Template — fpdf2 + DejaVu Sans

Use this template to convert a JSON-backed financial-analysis memo into a
sell-side-style PDF. Copy and modify for each new analysis.

Source / canonical implementation: a saved build script in a company's
~/research/<TICKER>/ directory after an end-to-end India analysis
(typically a 14-page PDF for a thesis + recommendation report).

USAGE
=====
1. Copy this file to ~/research/<TICKER>/build_pdf.py
2. Edit the "=== DATA INPUTS ===" block to point at your JSON files
3. Edit the "=== PAGE 1 .. PAGE N ===" blocks to render your sections
4. Run: python build_pdf.py
5. Visual review with pdftoppm + vision_analyze (see pitfalls in
   references/pdf-deliverable-from-analysis.md step 6)

REQUIREMENTS
============
- fpdf2: pip install --break-system-packages fpdf2
- DejaVu Sans TTF at /usr/share/fonts/truetype/dejavu/  (pre-installed on most Linux)
- pdftoppm (poppler-utils) for the visual-review loop

The pattern: fpdf2's default Helvetica rejects Unicode (₹, •, ×, em-dashes).
Loading DejaVu Sans fixes it. Use fpdf2's multi_cell() for body text — manual
word-wrap breaks on page boundaries.
"""

from fpdf import FPDF
from pathlib import Path
import json

# ============================================================
# DATA INPUTS — edit these to point at your JSON files
# ============================================================
base = Path(__file__).parent  # ~/research/<TICKER>/
peer_clean = json.loads((base / "peer_comp_clean.json").read_text())
peer_stats = json.loads((base / "peer_comp_stats.json").read_text())
fy27e = json.loads((base / "fy27e_model.json").read_text())
dcf = json.loads((base / "dcf_results.json").read_text())
multiples = json.loads((base / "multiples_results.json").read_text())
rim = json.loads((base / "rim_results.json").read_text())
valuation = json.loads((base / "valuation_results.json").read_text())

# ============================================================
# FONTS — required for Unicode (₹, •, ×, em-dashes)
# ============================================================
# ============================================================
# FONTS — required for Unicode (�, •, ×, em-dashes)
#
# Defensive probing: hardcoded /usr/share/fonts/truetype/dejavu/
# fails in many environments (cron sandbox, fresh containers, macOS,
# minimal Docker images). Probe a list of common locations and
# fall back to a clean error if none of them work. This avoids the
# silent-mid-build failure mode where fpdf2 throws
# FPDFUnicodeEncodingException only when it hits the first "₹"
# after the cover has already rendered.
# ============================================================
import os
from pathlib import Path

_DEJAVU_CANDIDATES = [
    # Linux package manager locations (most → least common)
    "/usr/share/fonts/truetype/dejavu/",
    "/usr/share/fonts/dejavu/",
    "/usr/local/share/fonts/dejavu/",
    # Snap/Flatpak font mounts
    "/snap/fonts/current/usr/share/fonts/truetype/dejavu/",
    # Homebrew on Linux
    "/home/linuxbrew/.linuxbrew/share/fonts/dejavu/",
    # macOS (Homebrew + MacTeX)
    "/opt/homebrew/share/fonts/dejavu/",
    "/usr/local/share/fonts/dejavu/",
    "/Library/Fonts/",
    "/System/Library/Fonts/Supplemental/",
    # User-installed
    os.path.expanduser("~/.local/share/fonts/dejavu/"),
    os.path.expanduser("~/.fonts/dejavu/"),
]

def _probe_font(filename):
    """Return first existing path for `filename` across _DEJAVU_CANDIDATES,
    or None if not found anywhere. Used by the FONTS block below."""
    for d in _DEJAVU_CANDIDATES:
        p = Path(d) / filename
        if p.exists() and p.is_file():
            return str(p)
    return None

def _resolve_fonts():
    """Probe each DejaVu variant. Returns dict of {variant: path}. Raises
    FileNotFoundError with a clear, actionable message if any variant is
    missing — better to fail loudly at script start than silently mid-build."""
    needed = {
        "reg":  "DejaVuSans.ttf",
        "bold": "DejaVuSans-Bold.ttf",
        "ital": "DejaVuSans-Oblique.ttf",
        "mono": "DejaVuSansMono.ttf",
    }
    out = {}
    missing = []
    for k, fn in needed.items():
        p = _probe_font(fn)
        if p is None:
            missing.append(fn)
        else:
            out[k] = p
    if missing:
        tried = "\n  ".join(_DEJAVU_CANDIDATES)
        raise FileNotFoundError(
            f"DejaVu font variants not found: {', '.join(missing)}\n"
            f"Tried these directories (first match wins):\n  {tried}\n"
            f"Fix one of:\n"
            f"  apt-get install fonts-dejavu fonts-dejavu-core fonts-dejavu-extra\n"
            f"  brew install --cask font-dejavu\n"
            f"  Download from https://dejavu-fonts.github.io and unzip into "
            f"~/.local/share/fonts/dejavu/, then fc-cache -fv\n"
            f"  Or edit _DEJAVU_CANDIDATES at the top of this script to add "
            f"your install path."
        )
    return out

_FONTS = _resolve_fonts()
FONT_REG  = _FONTS["reg"]
FONT_BOLD = _FONTS["bold"]
FONT_ITAL = _FONTS["ital"]
FONT_MONO = _FONTS["mono"]


# ============================================================
# PDF CLASS — reusable methods for headers, tables, callouts
# ============================================================
class ResearchPDF(FPDF):
    """Standard sell-side research layout. Override methods below to customize."""

    def header(self):
        """Page header on every page after the cover."""
        if self.page_no() > 1:
            self.set_font('DejaVu', 'I', 7)
            self.set_text_color(120, 120, 120)
            self.cell(0, 4, '<COMPANY> -- Fundamental Analysis & Investment Recommendation',
                      new_x='LMARGIN', new_y='NEXT', align='L')
            # Wait — see original: cell() with new_x='LMARGIN' new_y='NEXT' and align='L'
            # with width 0 means full-width. To split into header-text + page-num on right:
            # use two cells, the first with no full-width, the second with align='R'.
            # For simplicity in this template, omit the page-number cell.
            self.set_text_color(0, 0, 0)
            self.set_draw_color(180, 180, 180)
            self.line(10, self.get_y(), 200, self.get_y())
            self.ln(3)

    def footer(self):
        """Page footer: confidentiality marking."""
        self.set_y(-12)
        self.set_font('DejaVu', 'I', 6.5)
        self.set_text_color(150, 150, 150)
        self.cell(0, 4, 'Hermes Agent -- Internal research output. Not investment advice.',
                  new_x='LMARGIN', new_y='NEXT', align='L')
        self.set_text_color(0, 0, 0)

    def section_title(self, num, title):
        """Numbered section header. Use at the start of each major section."""
        self.ln(4)
        self.set_font('DejaVu', 'B', 13)
        self.set_text_color(30, 50, 90)
        self.cell(0, 8, f'{num}.  {title}', new_x='LMARGIN', new_y='NEXT', align='L')
        self.set_text_color(0, 0, 0)
        self.ln(2)

    def h2(self, title):
        """Subsection header."""
        self.ln(3)
        self.set_font('DejaVu', 'B', 11)
        self.set_text_color(50, 50, 50)
        self.cell(0, 6, title, new_x='LMARGIN', new_y='NEXT', align='L')
        self.set_text_color(0, 0, 0)
        self.ln(1)

    def h3(self, title):
        """Sub-subsection header."""
        self.ln(2)
        self.set_font('DejaVu', 'B', 10)
        self.cell(0, 5, title, new_x='LMARGIN', new_y='NEXT', align='L')
        self.ln(1)

    def body(self, text):
        """Body paragraph. Uses multi_cell() — handles page breaks correctly.

        DO NOT replace with a manual word-wrap loop. Manual wraps break
        silently at page boundaries (this was a real bug in <Company> 2026-07-01
        — section 6.3 truncated to one word 'Four' on page 7).
        """
        self.set_font('DejaVu', '', 10)
        self.multi_cell(0, 5, text, align='L')
        self.ln(1)

    def bullet(self, text):
        """Bullet item with hanging indent on wrap lines."""
        self.set_font('DejaVu', '', 10)
        self.cell(6, 5, '•', 0, 0)
        self.multi_cell(0, 5, text, align='L')
        self.ln(1)

    def callout(self, label, value, color=None):
        """Highlighted callout box (e.g. 'ACTION: SELL', 'PT: Rs. X').

        Uses multi_cell(), NOT cell(), so long values can never silently
        truncate mid-sentence. Real bug: BN 2026-08-28 page 7 HOLD callout
        was cut off after "STATUS:" because cell() doesn't word-wrap.
        """
        if color is None:
            color = (180, 30, 30)  # default red for sell
        self.set_fill_color(*color)
        self.set_text_color(255, 255, 255)
        self.set_font('DejaVu', 'B', 11)
        self.multi_cell(0, 9, f'  {label}: {value}',
                        new_x='LMARGIN', new_y='NEXT', align='L', fill=True)
        self.set_text_color(0, 0, 0)
        self.ln(2)

    def table(self, headers, rows, col_widths=None, header_color=(40, 60, 100),
             auto_fit=True, wrap=False):
        """Render a table with header row + alternating-row fill.

        Args:
            headers: list of column header strings
            rows: list of lists, each inner list = one row of values
            col_widths: list of column widths in mm (default: equal width)
            header_color: RGB tuple for header fill
            auto_fit: if True, pre-flight widths via get_string_width and
                shrink overflow columns proportionally so render-once is
                safe (no render → vision → patch → re-render loop needed).
                Default True — set False only if you've already validated
                widths and want bit-exact output.
            wrap: if True, cells that overflow their column word-wrap via
                multi_cell() instead of truncating. Row height grows to
                fit the tallest wrapped cell in that row, so columns stay
                aligned. Use when content is intrinsically long
                (multi-word labels, sentence-length values) and shrinking
                the column would make it unreadable. Cost: tables with
                wrapping take more vertical space, so fewer rows per page.
                Default False (cell-truncate, like original behavior).

        Catches the BN 2026-08-28 bugs (page 1 snapshot table label column
        too narrow; page 6 red flag + catalyst Status/Probability columns
        too narrow) BEFORE rendering. Cheaper than visual-review loops.
        """
        n_cols = len(headers)
        if col_widths is None:
            col_widths = [190 / n_cols] * n_cols

        # --- Pre-flight: measure widest cell per column at the data font ---
        # Data rows are rendered at DejaVu 9pt. 1mm ≈ 2.835pt.
        # Two checks:
        #   1) Total-fit:    sum of widest cells across all cols <= available
        #   2) Per-col-fit:  widest cell in col j <= col_widths[j] - 4mm padding
        # Both matter: a single column overflowing triggers silent truncation in
        # fpdf2's cell() even when the total fits. Real bug class in BN 2026-08-28.
        self.set_font('DejaVu', '', 9)
        max_w_per_col = []
        per_col_overflow = False
        for j in range(n_cols):
            widest = max(
                [self.get_string_width(str(h)) for h in [headers[j]]] +
                [self.get_string_width(str(r[j])) for r in rows] +
                [0]
            )
            max_w_per_col.append(widest)
            col_budget_pt = (col_widths[j] - 4) / 0.5  # 4mm padding, 0.5mm/pt
            if widest > col_budget_pt * 1.05:  # 5% safety
                per_col_overflow = True

        usable_mm = sum(col_widths) - 4 * n_cols  # 2mm padding each side per col
        total_needed_pt = sum(max_w_per_col)
        # 1pt of text ≈ 0.5mm at 9pt DejaVu (empirical). Add 5% safety.
        total_needed_mm = (total_needed_pt * 0.5) * 1.05

        if auto_fit and (total_needed_mm > usable_mm or per_col_overflow):
            # Proportionally shrink all columns
            scale = usable_mm / max(total_needed_mm, 1)
            col_widths = [max(w * scale, 12) for w in col_widths]  # never < 12mm
            reason = ("total overflow" if total_needed_mm > usable_mm
                      else "per-column overflow")
            print(f"[table] auto-shrunk cols to fit ({reason}; needed "
                  f"{total_needed_mm:.0f}mm, had {usable_mm:.0f}mm, scale={scale:.2f})")

        # Header row
        self.set_fill_color(*header_color)
        self.set_text_color(255, 255, 255)
        self.set_font('DejaVu', 'B', 8.5)
        for i, h in enumerate(headers):
            align = 'L' if i == 0 else 'C'
            new_x = 'RIGHT' if i < n_cols - 1 else 'LMARGIN'
            new_y = 'NEXT' if i == n_cols - 1 else 'TOP'
            self.cell(col_widths[i], 6.5, h, border=1,
                      new_x=new_x, new_y=new_y, align=align, fill=True)
        self.set_text_color(0, 0, 0)

        # Data rows
        line_h = 5.5  # 9pt DejaVu row height
        for i, row in enumerate(rows):
            self.set_font('DejaVu', '', 9)
            fill = (i % 2 == 0)

            if wrap:
                # Compute row height = max wrapped line count across cells.
                # 9pt text ≈ 0.5mm/pt width, line_h mm/line height.
                # Available text width per col = col_widths - 4mm padding.
                max_lines = 1
                for j, val in enumerate(row):
                    text_w_pt = self.get_string_width(str(val))
                    avail_pt = (col_widths[j] - 4) / 0.5
                    lines = max(1, -(-int(text_w_pt) // max(int(avail_pt), 1)))
                    max_lines = max(max_lines, lines)
                row_h = line_h * max_lines
            else:
                row_h = line_h

            # Render the row at fixed height (cell mode) or computed height
            # (wrap mode). Use cell() per col when wrap=False (fast, may
            # truncate); use multi_cell() per col when wrap=True (slower,
            # word-wraps cleanly).
            x_start = self.get_x()
            y_start = self.get_y()
            for j, val in enumerate(row):
                align = 'L' if j == 0 else 'R'
                if wrap:
                    # multi_cell advances cursor; track x manually so each
                    # cell in the row starts at the same y.
                    self.set_xy(x_start + sum(col_widths[:j]), y_start)
                    if fill:
                        self.set_fill_color(245, 248, 252)
                    self.multi_cell(col_widths[j], line_h, str(val),
                                    border=0.5, align=align, fill=fill,
                                    new_x='RIGHT', new_y='TOP',
                                    maxline=0)  # no limit, wrap freely
                else:
                    new_x = 'RIGHT' if j < n_cols - 1 else 'LMARGIN'
                    new_y = 'NEXT' if j == n_cols - 1 else 'TOP'
                    if fill:
                        self.set_fill_color(245, 248, 252)
                    self.cell(col_widths[j], row_h, str(val), border=0.5,
                              new_x=new_x, new_y=new_y, align=align, fill=fill)
            # Move cursor to start of next row, just below the tallest cell
            if wrap:
                self.set_xy(x_start, y_start + row_h)
            self.set_text_color(0, 0, 0)
        self.ln(2)

    def divider(self):
        """Horizontal divider line."""
        self.set_draw_color(180, 180, 180)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(3)


# ============================================================
# BUILD THE PDF — customize each page for your analysis
# ============================================================
pdf = ResearchPDF()
pdf.set_auto_page_break(auto=True, margin=15)
pdf.set_margins(10, 10, 10)

# Load fonts ONCE before any set_font call
pdf.add_font('DejaVu', '', FONT_REG)
pdf.add_font('DejaVu', 'B', FONT_BOLD)
pdf.add_font('DejaVu', 'I', FONT_ITAL)
pdf.add_font('Mono', '', FONT_MONO)


# === PAGE 1: COVER ===
pdf.add_page()
# Edit: add title, action callout, snapshot table
pdf.ln(40)
pdf.set_font('DejaVu', 'B', 24)
pdf.set_text_color(30, 50, 90)
pdf.cell(0, 12, '<COMPANY NAME>',
         new_x='LMARGIN', new_y='NEXT', align='C')
# ... continue with cover content

# === PAGE 2: EXECUTIVE SUMMARY ===
pdf.add_page()
pdf.section_title(1, 'Executive Summary')
pdf.body('<opening paragraph>')
# ... continue with exec summary

# === PAGES 3-N: SECTIONS ===
# Add one pdf.add_page() + pdf.section_title() per section

# === SAVE ===
output_path = base / '<TICKER>_Fundamental_Analysis_<DATE>.pdf'
pdf.output(str(output_path))
print(f'OK  PDF saved: {output_path}')
print(f'    Size: {output_path.stat().st_size:,} bytes')
print(f'    Pages: {pdf.page_no()}')

# === POST-BUILD: VISUAL REVIEW ===
# Run pdftoppm to render previews, then vision_analyze each page:
#   pdftoppm -r 90 -png <output>.pdf /tmp/preview/page
# Then check each preview for: text cut off, table overflow, header alignment.
# If issues found, fix in this script and re-run.