# PDF Deliverable — Polished Research Memos via fpdf2

Use when the user asks for a "**nicely formatted PDF**," "**PDF report**," "**send as PDF**," or "**export the memo**" of a completed research memo. Source: 2026-07-01 <TICKER> run. Companion to `india-data-pull-recipe.md` and `thesis-memo-reco-template.md`.

## When to use

- User has a finished memo (Markdown or JSON-backed) and wants it as a polished PDF
- Suitable for: sell-side equity research notes, thesis memos, sector overviews, recommendation reports
- **Don't use** for: raw data exports (CSV/PDF), single-page summaries, or any case where Markdown is sufficient

## When NOT to use (and what to use instead)

- **Just need to share the .md**: send the Markdown file directly via `send_message` with the file path
- **One-page report**: use a single Markdown block, not a PDF
- **Heavy graphical content** (charts, embedded images, custom layouts): skip fpdf2 and use `pandoc` if available, or `weasyprint` if user wants HTML→PDF fidelity

## The 5-step recipe (works in this order)

### Step 1 — Make sure your inputs are JSON, not just prose

If the memo has any numerical content (financials, scenario tables, peer comp), **serialize it to JSON first** in `~/research/<TICKER>/`. Why: a re-runnable PDF build script reads from JSON, and the JSON becomes the audit trail + the input for future re-runs. The <Company> run had:
- `fy27e_model.json` — FY27E-FY31E projections × 3 scenarios
- `dcf_results.json`, `multiples_results.json`, `rim_results.json` — three valuation methods
- `peer_comp_clean.json` — 7-peer TTM P&L + multiples
- `valuation_results.json` — blended PT + probability-weighted PT

The PDF builder reads from these JSONs. If you re-run with new Q1 FY27 actuals, you update the JSONs and the script generates a fresh PDF — no memo re-write.

### Step 2 — Install fpdf2 (one-time per environment)

```bash
python -m pip install --break-system-packages fpdf2
```

If running in a venv: `pip install fpdf2`. fpdf2 pulls `fonttools` and `Pillow` as transitive deps. Total install ~6 MB. **fpdf2 is pure Python**, no system libs.

### Step 3 — Get a Unicode-capable font (mandatory)

fpdf2's default Helvetica is **latin-1 only**. Indian financial memos use `₹`, `•`, `×`, em-dashes, and other Unicode chars that fail encoding. **Required:** use a TTF with Unicode coverage. DejaVu Sans works:

```
/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf        # regular
/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf   # bold
/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf # italic
/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf     # monospace
```

If DejaVu not available, alternatives: Liberation Sans (also at `/usr/share/fonts/truetype/liberation/`), or download Noto Sans from Google Fonts. Load each variant separately:

```python
from fpdf import FPDF
pdf = FPDF()
pdf.add_font('DejaVu', '', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
pdf.add_font('DejaVu', 'B', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
pdf.add_font('DejaVu', 'I', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf')
```

After loading, use `pdf.set_font('DejaVu', 'B', 12)` etc. The `pdf.add_font` calls are **mandatory before any set_font**.

**Don't hardcode the path — use the defensive probe from the template.**

Hardcoding `/usr/share/fonts/truetype/dejavu/` fails in: cron sandboxes (no /usr/share mounted), fresh Docker containers without fonts-dejavu installed, macOS (different paths), Homebrew-on-Linux, Snap/Flatpak font mounts, and any environment where DejaVu was installed to a custom location. The failure mode is silent: fpdf2 happily loads the page until the first `₹` or `•`, then throws `FPDFUnicodeEncodingException` after the cover has already rendered, leaving a half-finished PDF on disk.

The template's `_DEJAVU_CANDIDATES` list (in `templates/build_pdf.py`) probes 11 common install locations in priority order:

```python
_DEJAVU_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/",   # Debian/Ubuntu default
    "/usr/share/fonts/dejavu/",            # RHEL/Fedora default
    "/usr/local/share/fonts/dejavu/",      # manual / source build
    "/snap/fonts/current/usr/share/fonts/truetype/dejavu/",  # Snap
    "/home/linuxbrew/.linuxbrew/share/fonts/dejavu/",        # Homebrew on Linux
    "/opt/homebrew/share/fonts/dejavu/",    # macOS Homebrew on Apple Silicon
    "/usr/local/share/fonts/dejavu/",      # macOS Homebrew on Intel
    "/Library/Fonts/",                     # macOS system fonts
    "/System/Library/Fonts/Supplemental/", # macOS bundled fonts
    "~/.local/share/fonts/dejavu/",        # user-installed (fontconfig user dir)
    "~/.fonts/dejavu/",                    # legacy user-installed
]
```

If none of those resolve, the script raises `FileNotFoundError` at import time with a copy-pasteable fix:

```
DejaVu font variants not found: DejaVuSans.ttf, DejaVuSans-Bold.ttf, ...
Fix one of:
  apt-get install fonts-dejavu fonts-dejavu-core fonts-dejavu-extra
  brew install --cask font-dejavu
  Download from https://dejavu-fonts.github.io and unzip into
  ~/.local/share/fonts/dejavu/, then fc-cache -fv
  Or edit _DEJAVU_CANDIDATES at the top of this script to add your install path.
```

This converts the silent-mid-build failure into a loud-at-startup failure with a self-documenting fix. Use the probe verbatim when you copy `templates/build_pdf.py` into a new `~/research/<TICKER>/build_pdf.py` — don't strip it back to hardcoded paths.

### Step 4 — Build the page layout (use this template shape)

A clean equity research PDF is ~10–14 pages with this structure:

| Page | Section | Visual treatment |
|---|---|---|
| 1 | Cover with action box + snapshot table | Big red callout box at top; 2-col table below |
| 2 | Executive summary | The 3-method PT table; "why this call" bullets |
| 3–4 | Three-statement snapshot | 3 tables (P&L, CF, BS) with FY22-FY26 series |
| 5 | SPELL ratios | Multiple sub-tables by ratio category |
| 6 | Earnings call analysis | "New metrics / dropped metrics / tone" sub-sections |
| 7 | Red flags + peer comp | Red-flag scorecard; 7-peer table + group stats |
| 8–9 | Valuation framework | One table per method (DCF, multiples, RIM); blended PT table |
| 10–11 | Scenarios + catalysts | Bull/base/bear assumptions; quarterly catalyst calendar |
| 12 | Position sizing + exit triggers | Trim/re-entry/thesis-break bullets |
| 13–14 | Sources & confidence | Primary source list; confidence ratings table; disclaimer |

**Page geometry defaults (work well for A4 / Letter):**
- Page size: A4 (210 × 297 mm, fpdf2 default)
- Margins: 10 mm all sides
- Body font: 10 pt DejaVu Sans
- Section headers: 13 pt bold, dark blue
- Subheaders: 11 pt bold, dark gray
- Table header row: 9 pt bold white on dark blue fill
- Table data rows: 9 pt regular, alternating very-light-blue/white fill
- Cover callout box: 11 pt bold white on red fill

### Step 5 — Use fpdf2's `multi_cell()` for body text (critical bug fix)

**Manual word-wrap is fragile across page breaks.** If you write your own wrap loop in `body()` / `bullet()`, paragraph text that crosses a page boundary can be silently truncated. **Caught this in the <Company> 2026-07-01 build** — section 6.3's body text wrapped to a single word ("Four") on page 7, with the rest lost.

**Use fpdf2's built-in `multi_cell()` for all body and bullet text.** It handles word-wrap AND page-breaks correctly:

```python
class ResearchPDF(FPDF):
    def body(self, text):
        self.set_font('DejaVu', '', 10)
        self.multi_cell(0, 5, text, align='L')
        self.ln(1)

    def bullet(self, text):
        self.set_font('DejaVu', '', 10)
        self.cell(6, 5, '•', 0, 0)  # bullet
        self.multi_cell(0, 5, text, align='L')
        self.ln(1)
```

For tables, fpdf2 has no built-in table renderer — build one as a method that loops `cell()` calls. Sample table method is in the saved `templates/build_pdf.py` artifact.

### Step 6 — Visual review before declaring done (mandatory, but cheap)

**PDFs that look right when you write them can render wrong.** The <Company> 2026-07-01 build had a working PDF that *also* had a section that was silently truncated to one word — only visible by rendering the page to PNG and looking at it. The fix was a one-line `multi_cell()` swap, but it wouldn't have been caught without visual review.

**However: the BN 2026-08-28 cron burned ~25 turns on three consecutive render → vision_analyze → patch → re-render cycles** (page 1 snapshot table too narrow → widen; page 6 red-flag columns too narrow → shrink; page 7 HOLD callout silently truncated → switch to multi_cell). The loop is correct in principle but expensive in turn budget. The cheaper discipline is **measure first, render once**.

#### Step 6a — Predictive width check (catch overflow before rendering)

`build_pdf.py`'s `table()` method has an `auto_fit=True` default that pre-flights every column via `get_string_width` and proportionally shrinks overflowing columns. **Use it.** Two checks run:

1. **Total-fit** — sum of widest cells across all columns ≤ available width (in mm).
2. **Per-col-fit** — widest cell in column j ≤ that column's width minus 4 mm padding.

If either fails, all columns are proportionally shrunk (never below 12 mm). Catches both the gross overflow case (too many columns, all narrow) and the subtle case (one column too narrow for its longest value while others are wide enough that total fits).

**`wrap=True` for sentence-length content.** If a table has cells with full clauses (catalyst descriptions, business-segment summaries, multi-word labels like "LTM Distributable Earnings per share (US$)" that don't fit in any reasonable column width), pass `wrap=True`. The row height grows to fit the tallest wrapped cell in the row, columns stay aligned, and content word-wraps cleanly. Cost: wrapped tables take more vertical space, so fewer rows per page.

```python
pdf.table(headers, rows, col_widths=[40, 30, 30], wrap=True)
```

Use `wrap=False` (default) for short-value tables — metrics, prices, ratios. The math overflow is impossible to miss; visually scrolled rows are not.

**Caveat:** auto-fit measures text width; it cannot detect every rendering glitch. fpdf2's `cell()` can clip text at the rendered pixel boundary even when the math says "fits" — that's exactly what bit BN 2026-08-28. The auto-fit reduces — but does not eliminate — the need for one visual-review round.

The two recurring bugs auto-fit + helper rewrites eliminate (not just mitigate):
- **Long callout values** — `callout()` now uses `multi_cell()`, not `cell()`. Long `label: value` strings can never silently truncate.
- **Long bullet values** — `bullet()` already uses `multi_cell()` for the text after the marker.

If you're hand-rolling a table outside the `table()` helper (don't — but if you must), measure each string with `pdf.get_string_width(text)` against your column width in mm before rendering. Rule of thumb: at 9pt DejaVu, 1 character ≈ 1.0–1.2 mm. Plan for the longest value in each column + 4 mm padding.

#### Step 6b — Render ONCE, at the end, as a sanity check

```bash
# Render every page to PNG at moderate resolution
pdftoppm -r 90 -png ~/research/<TICKER>/<output>.pdf /tmp/preview/page
```

`pdftoppm` ships with `poppler-utils` (pre-installed on most Linux). If missing: `apt-get install poppler-utils`. Output PNGs go to whatever directory you specify; `-r 90` gives 90 DPI which is enough to spot layout bugs.

After the predictive width check + auto-fit, the typical visual review loop is **one round**, not three:
1. Render → spot any remaining issues (rare)
2. Fix in the script
3. Re-render once more
4. Ship

>3 review rounds = structural rework (page is too cramped; rethink layout, don't patch widths).

### Step 7 — Save the build script alongside the JSON inputs

The <Company> build saved `build_pdf.py` (38 KB, ~600 lines) at `~/research/<TICKER>/build_pdf.py`. This is the **canonical template** for re-runs:

- Future Q1 FY27 actuals come in → update `fy27e_model.json` → re-run `python build_pdf.py` → fresh PDF
- User changes a peer comp data point → update `peer_comp_clean.json` → re-run
- The script reads from JSON, so it's deterministic given the same inputs

Keep the script in the company's research directory, not in a global templates path. Each company has slightly different table structures (sections in different orders, different metrics emphasized) — keeping the script co-located with the data is cleaner than a global template with conditional logic.

## Pitfalls (from the <Company> 2026-07-01 build)

1. **fpdf2 default font rejects Unicode** — error message is `FPDFUnicodeEncodingException: Character "•" at index X in text is outside the range of characters supported by the font used: "helvetica"`. Fix: load DejaVu TTF first. Do this BEFORE the first `cell()` call.
2. **Manual word-wrap breaks on page boundaries** — fixed by switching to `multi_cell()`. Don't roll your own.
3. **"Page Not Found" returns HTML with `.pdf` extension** — file type is `HTML document`, not `PDF document`. Always check with `file <path>` or `curl -sLI` first. (Applies regardless of which parser you use — `pdftotext`, `pymupdf4llm`, or the `pdf_doc_parse` tool will all silently return 0 bytes on HTML content.)
4. **Two-page-wide tables overflow** — if you have 9+ columns, narrow the font to 8 pt OR drop 1-2 columns OR break into two tables. Don't try to fit everything in 190 mm.
5. **Cover-page callout box uses one `set_fill_color` for the entire row** — make sure `set_text_color(255, 255, 255)` is set before the callout text and reset back to black after. Otherwise body text on subsequent pages is invisible (white-on-white).
6. **`ln=1` parameter is deprecated in fpdf2 v2.5.2+** — use `new_x='LMARGIN', new_y='NEXT'` instead. Works either way; deprecation warnings are noise.
7. **PDFs that look fine in the source render with cut-off text** — always do a vision_analyze pass on the rendered preview, BUT minimize iteration cost: the `table()` helper's `auto_fit=True` pre-flights column widths via `get_string_width` so most overflow is caught before render. The `callout()` helper uses `multi_cell()` so it can never silently truncate. One render-review round is normal; >3 means structural rework (BN 2026-08-28 burned ~25 turns doing 3 rounds — too expensive for a cron budget).
8. **Build script vs skill file drift** — if you update the JSON inputs without updating the script (e.g., adding a new valuation method), the PDF will silently use the old structure. Add a `_manifest_version` field at the top of each JSON to detect this.

## Related artifacts (already saved)

- `templates/build_pdf.py` — the canonical <Company> build script, ready to copy and modify
- `references/india-data-pull-recipe.md` — JSON inputs and pull mechanics
- `references/thesis-memo-reco-template.md` — the memo content template

## Time budget (<Company> 2026-07-01 build)

| Step | Time | Output |
|---|---|---|
| Serialize memo data to JSON | 5 min | `fy27e_model.json`, `dcf_results.json`, etc. |
| Install fpdf2 + verify DejaVu font | 1 min | One-time per environment |
| Write the build script | 60 min | `build_pdf.py` (~600 lines, covers all 11 sections) |
| First render + vision review | 5 min | 14 PNG previews |
| Fix layout bugs caught in review | 5–15 min | One round of edits |
| Final PDF | – | `~80 KB / 14 pages` |

For repeat analyses (Q1 FY27 update, etc.), the build script is unchanged — only the JSON inputs change. Re-build in 5–10 seconds.

## Token footprint note (this build)

The <Company> 2026-07-01 PDF build was entirely in-context:
- Loaded all 7 JSONs (≤ 30K tokens combined)
- ~600 lines of build script (in-context for the run)
- One vision_analyze pass per page review (~2–3K tokens per call)
- Final PDF output: 83 KB on disk, ~20 KB if you read it back into context

**No need to load the source PDFs** (31 MB FY25 annual report, 443 KB transcripts) into context for the PDF build — the JSONs already have the extracted numbers. This is a feature: the PDF build is cheap to re-run.